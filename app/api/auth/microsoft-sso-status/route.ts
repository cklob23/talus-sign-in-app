import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * Public read-only check used by login and kiosk pages to show the Microsoft
 * button. This endpoint must never PATCH Supabase auth config.
 */
export async function GET() {
  try {
    const supabase = createAdminClient()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const projectRefMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
    const projectRef = projectRefMatch?.[1] || ""

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

    const { data: clientIdSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "azure_client_id")
      .is("location_id", null)
      .single()

    const hasClientId = !!clientIdSetting?.value
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
