import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Auto-heal the Azure tenant URL in Supabase auth config
// Supabase appends /v2.0 internally, so storing /v2.0 in the URL causes
// a duplicated path (/v2.0/oauth2/v2.0/authorize) → 404 on Microsoft login
async function autoHealAzureUrl(projectRef: string) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  if (!accessToken) return

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )
    if (!response.ok) return

    const authConfig = await response.json()
    const azureUrl = authConfig.external_azure_url || ""

    if (azureUrl.endsWith("/v2.0")) {
      const correctedUrl = azureUrl.replace(/\/v2\.0$/, "")
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
  } catch {
    // Non-critical — don't block the status check
  }
}

// Public endpoint: checks if Microsoft SSO is enabled and configured
// No authentication required - used by login/kiosk pages to show/hide the button
export async function GET() {
  try {
    const supabase = createAdminClient()

    // Build project ref from Supabase URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const projectRefMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
    const projectRef = projectRefMatch?.[1] || ""

    // Check the settings table for microsoft_sso_enabled
    const { data: enabledSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "microsoft_sso_enabled")
      .is("location_id", null)
      .single()

    const isEnabled = enabledSetting?.value === true || enabledSetting?.value === "true"

    if (!isEnabled) {
      return NextResponse.json({ enabled: false })
    }

    // Also verify the Supabase auth config has Azure enabled with a client_id set
    // by checking the settings table for azure_client_id
    const { data: clientIdSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "azure_client_id")
      .is("location_id", null)
      .single()

    const hasClientId = !!clientIdSetting?.value

    // Auto-heal: fix the Azure tenant URL if it has the trailing /v2.0
    // Do this in the background so it doesn't slow down the response
    if (hasClientId && projectRef) {
      autoHealAzureUrl(projectRef).catch(() => { })
    }

    const callbackUrl = projectRef
      ? `https://${projectRef}.supabase.co/auth/v1/callback`
      : ""

    return NextResponse.json({
      enabled: isEnabled && hasClientId,
      callback_url: callbackUrl,
    })
  } catch {
    return NextResponse.json({ enabled: false })
  }
}
