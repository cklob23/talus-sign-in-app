import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"

/**
 * GET /api/kiosk/settings?location_id=xxx
 * Returns kiosk-relevant settings for a location.
 * Uses admin client to bypass RLS since the kiosk does not have a Supabase auth session.
 * Merges global settings (location_id IS NULL) with location-specific overrides.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const locationId = searchParams.get("location_id")

  if (!locationId) {
    return NextResponse.json({ error: "location_id is required" }, { status: 400 })
  }

  const supabase = getAdminClient()

  const kioskSettingKeys = [
    "badge_printing",
    "host_notifications",
    "distance_unit_miles",
  ]

  // Fetch both global and location-specific settings in parallel
  const [globalRes, locationRes] = await Promise.all([
    supabase
      .from("settings")
      .select("key, value")
      .is("location_id", null)
      .in("key", kioskSettingKeys),
    supabase
      .from("settings")
      .select("key, value")
      .eq("location_id", locationId)
      .in("key", kioskSettingKeys),
  ])

  // Merge: global first, then location-specific overrides
  const merged: Record<string, unknown> = {}
  if (globalRes.data) {
    for (const s of globalRes.data) merged[s.key] = s.value
  }
  if (locationRes.data) {
    for (const s of locationRes.data) merged[s.key] = s.value
  }

  return NextResponse.json({ settings: merged })
}
