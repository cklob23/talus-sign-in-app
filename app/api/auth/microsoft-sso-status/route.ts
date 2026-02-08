import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Public endpoint: checks if Microsoft SSO is enabled and configured
// No authentication required - used by login/kiosk pages to show/hide the button
export async function GET() {
  try {
    const supabase = createAdminClient()

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

    return NextResponse.json({
      enabled: isEnabled && hasClientId,
    })
  } catch {
    return NextResponse.json({ enabled: false })
  }
}
