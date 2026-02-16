import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Extract the project ref from the Supabase URL
function getProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  // URL format: https://<project_ref>.supabase.co
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/)
  if (!match) throw new Error("Could not extract project ref from SUPABASE_URL")
  return match[1]
}

// GET: Fetch current Azure auth config from Supabase
export async function GET() {
  try {
    // Verify the user is authenticated and is an admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const accessToken = process.env.SUPABASE_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({
        error: "SUPABASE_ACCESS_TOKEN is not configured. Generate a personal access token at https://supabase.com/dashboard/account/tokens and add it as an environment variable.",
        needs_token: true,
      }, { status: 500 })
    }

    const projectRef = getProjectRef()

    // Fetch auth config from Supabase Management API
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()

      // Provide a helpful error for common token issues
      if (response.status === 401 || errorText.includes("JWT")) {
        return NextResponse.json({
          error: "Invalid SUPABASE_ACCESS_TOKEN. This must be a personal access token from https://supabase.com/dashboard/account/tokens — not a project API key (anon/service_role).",
          needs_token: true,
        }, { status: 401 })
      }

      return NextResponse.json(
        { error: `Failed to fetch auth config: ${errorText}` },
        { status: response.status }
      )
    }

    const authConfig = await response.json()

    // Build the Supabase callback URL for Azure AD
    const supabaseCallbackUrl = `https://${projectRef}.supabase.co/auth/v1/callback`

    // Also read tenant_id from local settings as a fallback
    const { data: tenantIdSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "azure_tenant_id")
      .is("location_id", null)
      .single()

    // Auto-heal: if the stored URL has a trailing /v2.0, fix it in Supabase
    // Supabase appends /v2.0 internally, so having it in the URL causes a
    // duplicated path (/v2.0/oauth2/v2.0/authorize) → 404 on Microsoft login
    const azureUrlFromConfigRaw = authConfig.external_azure_url || ""
    if (azureUrlFromConfigRaw.endsWith("/v2.0") && accessToken) {
      const correctedUrl = azureUrlFromConfigRaw.replace(/\/v2\.0$/, "")
      await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ external_azure_url: correctedUrl }),
        }
      )
    }

    // Auto-populate DB backup if Management API has credentials but DB doesn't
    // This is a one-time migration for existing setups.
    // NOTE: We intentionally do NOT auto-populate azure_client_secret here because
    // the Management API may return a value that differs from the raw Client Secret
    // Value needed for the Graph API client_credentials grant. The secret must be
    // explicitly saved by the admin via the SSO settings form.
    const keysToBackup: { key: string; value: unknown }[] = [
      { key: "microsoft_sso_enabled", value: authConfig.external_azure_enabled || false },
      { key: "azure_client_id", value: authConfig.external_azure_client_id || "" },
    ]

    // Extract tenant_id from URL if present
    const azureUrlFromConfig = authConfig.external_azure_url || ""
    const tenantMatch = azureUrlFromConfig.match(/microsoftonline\.com\/([^/]+)/)
    if (tenantMatch) {
      keysToBackup.push({ key: "azure_tenant_id", value: tenantMatch[1] })
    }

    for (const { key, value } of keysToBackup) {
      if (!value) continue
      const { data: existing } = await supabase
        .from("settings")
        .select("id, value")
        .eq("key", key)
        .is("location_id", null)
        .single()

      if (!existing) {
        await supabase.from("settings").insert({ key, value: String(value), location_id: null })
      } else if (!existing.value && value) {
        await supabase.from("settings").update({ value: String(value) }).eq("id", existing.id)
      }
    }

    return NextResponse.json({
      enabled: authConfig.external_azure_enabled || false,
      client_id: authConfig.external_azure_client_id || "",
      secret: authConfig.external_azure_secret ? "••••••••" : "",
      url: authConfig.external_azure_url || "",
      has_secret: !!authConfig.external_azure_secret,
      callback_url: supabaseCallbackUrl,
      tenant_id: tenantIdSetting?.value || tenantMatch?.[1] || "",
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch config" },
      { status: 500 }
    )
  }
}

// POST: Update Azure auth config in Supabase
export async function POST(request: Request) {
  try {
    // Verify the user is authenticated and is an admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const accessToken = process.env.SUPABASE_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({
        error: "SUPABASE_ACCESS_TOKEN is not configured. Generate a personal access token at https://supabase.com/dashboard/account/tokens and add it as an environment variable.",
        needs_token: true,
      }, { status: 500 })
    }

    const projectRef = getProjectRef()
    const body = await request.json()
    const {
      enabled,
      client_id,
      secret,
      tenant_id,
    } = body

    // Validate: cannot enable without client_id and secret
    if (enabled) {
      if (!client_id) {
        return NextResponse.json(
          { error: "Application (Client) ID is required to enable Microsoft SSO." },
          { status: 400 }
        )
      }
      // Check if secret is provided or already exists
      // "••••••••" means a secret is already set in Supabase - don't block save
      if (!secret || (secret !== "••••••••" && secret.trim() === "")) {
        return NextResponse.json(
          { error: "Client Secret is required to enable Microsoft SSO." },
          { status: 400 }
        )
      }
    }

    // Build the Azure tenant URL
    // Format: https://login.microsoftonline.com/<tenant_id>
    // NOTE: Do NOT append /v2.0 — Supabase appends that internally when
    // constructing the OAuth authorize URL. Adding it here causes a
    // duplicated path (/v2.0/oauth2/v2.0/authorize) which results in a 404.
    const azureUrl = tenant_id
      ? `https://login.microsoftonline.com/${tenant_id}`
      : ""

    // Build the update payload for Supabase Management API
    const updatePayload: Record<string, unknown> = {
      external_azure_enabled: enabled,
    }

    // Only send client_id if provided (don't overwrite with empty)
    if (client_id) {
      updatePayload.external_azure_client_id = client_id
    }

    // Only send secret if it's a real value (not the masked placeholder)
    if (secret && secret !== "••••••••") {
      updatePayload.external_azure_secret = secret
    }

    // Only send URL if tenant_id is provided
    if (azureUrl) {
      updatePayload.external_azure_url = azureUrl
    }

    // Update auth config via Supabase Management API
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatePayload),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()

      if (response.status === 401 || errorText.includes("JWT")) {
        return NextResponse.json({
          error: "Invalid SUPABASE_ACCESS_TOKEN. This must be a personal access token from https://supabase.com/dashboard/account/tokens — not a project API key (anon/service_role).",
          needs_token: true,
        }, { status: 401 })
      }

      return NextResponse.json(
        { error: `Failed to update auth config: ${errorText}` },
        { status: response.status }
      )
    }

    // Persist credentials to the local settings table as a secure backup
    // so syncs can use DB-stored credentials when the Management API is unavailable
    const settingsToSave: { key: string; value: unknown }[] = [
      { key: "microsoft_sso_enabled", value: enabled },
      { key: "azure_client_id", value: client_id || "" },
      { key: "azure_tenant_id", value: tenant_id || "" },
    ]

    // Only save the secret if it's a real value (not the masked placeholder)
    if (secret && secret !== "••••••••") {
      settingsToSave.push({ key: "azure_client_secret", value: secret })
    }

    for (const { key, value } of settingsToSave) {
      const { data: existing } = await supabase
        .from("settings")
        .select("id")
        .eq("key", key)
        .is("location_id", null)
        .single()

      if (existing) {
        await supabase
          .from("settings")
          .update({ value })
          .eq("key", key)
          .is("location_id", null)
      } else {
        await supabase
          .from("settings")
          .insert({ key, value, location_id: null })
      }
    }

    // Return the callback URL so the admin can use it in Azure AD
    const supabaseCallbackUrl = `https://${projectRef}.supabase.co/auth/v1/callback`

    return NextResponse.json({
      success: true,
      callback_url: supabaseCallbackUrl,
      message: enabled
        ? "Microsoft SSO enabled successfully in Supabase"
        : "Microsoft SSO disabled in Supabase",
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update config" },
      { status: 500 }
    )
  }
}
