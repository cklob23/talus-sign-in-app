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

    return NextResponse.json({
      enabled: authConfig.external_azure_enabled || false,
      client_id: authConfig.external_azure_client_id || "",
      secret: authConfig.external_azure_secret ? "••••••••" : "",
      url: authConfig.external_azure_url || "",
      has_secret: !!authConfig.external_azure_secret,
      callback_url: supabaseCallbackUrl,
      tenant_id: tenantIdSetting?.value || "",
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
    // Format: https://login.microsoftonline.com/<tenant_id>/v2.0
    const azureUrl = tenant_id
      ? `https://login.microsoftonline.com/${tenant_id}/v2.0`
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

    // Also persist the enabled state and client_id to the local settings table
    // so the public SSO status endpoint can read it without needing the Management API
    const settingsToSave = [
      { key: "microsoft_sso_enabled", value: enabled },
      { key: "azure_client_id", value: client_id || "" },
      { key: "azure_tenant_id", value: tenant_id || "" },
    ]

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
