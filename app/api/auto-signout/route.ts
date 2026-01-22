import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// This endpoint can be called by a cron job (e.g., Vercel Cron) at end of day
// to automatically sign out all visitors

export async function POST(request: Request) {
  try {
    // Verify the request is authorized (in production, use a secret key)
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    
    // If CRON_SECRET is set, verify it
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Create admin client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get all locations
    const { data: locations } = await supabase
      .from("locations")
      .select("id, name")

    if (!locations || locations.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No locations found",
        signedOut: 0 
      })
    }

    const now = new Date().toISOString()
    let totalSignedOut = 0
    const results: { locationId: string; locationName: string; signedOut: number; enabled: boolean }[] = []

    // Process each location separately
    for (const location of locations) {
      // Check if auto sign-out is enabled for this location
      const { data: autoSignOutSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "auto_sign_out")
        .eq("location_id", location.id)
        .single()

      const autoSignOutEnabled = autoSignOutSetting?.value === true || autoSignOutSetting?.value === "true"

      if (!autoSignOutEnabled) {
        results.push({ 
          locationId: location.id, 
          locationName: location.name, 
          signedOut: 0, 
          enabled: false 
        })
        continue
      }

      // Get active sign-ins for this location
      const { data: activeSignIns, error: fetchError } = await supabase
        .from("sign_ins")
        .select("id")
        .eq("location_id", location.id)
        .is("sign_out_time", null)

      if (fetchError) {
        console.error(`[v0] Error fetching sign-ins for location ${location.name}:`, fetchError)
        continue
      }

      if (!activeSignIns || activeSignIns.length === 0) {
        results.push({ 
          locationId: location.id, 
          locationName: location.name, 
          signedOut: 0, 
          enabled: true 
        })
        continue
      }

      // Update all active sign-ins for this location
      const { error: updateError } = await supabase
        .from("sign_ins")
        .update({ sign_out_time: now })
        .eq("location_id", location.id)
        .is("sign_out_time", null)

      if (updateError) {
        console.error(`[v0] Error signing out visitors for location ${location.name}:`, updateError)
        continue
      }

      totalSignedOut += activeSignIns.length
      results.push({ 
        locationId: location.id, 
        locationName: location.name, 
        signedOut: activeSignIns.length, 
        enabled: true 
      })
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully signed out ${totalSignedOut} visitor(s) across ${locations.length} location(s)`,
      signedOut: totalSignedOut,
      timestamp: now,
      locations: results
    })
  } catch (error) {
    console.error("[v0] Error in auto-signout API:", error)
    return NextResponse.json(
      { error: "Failed to process auto sign-out" },
      { status: 500 }
    )
  }
}

// GET endpoint for manual trigger or status check
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/auto-signout",
    description: "Automatically signs out all visitors at end of day",
    method: "POST",
    authentication: "Bearer token using CRON_SECRET environment variable",
    usage: "Set up a Vercel Cron job to call this endpoint daily at your desired time (e.g., 6 PM)"
  })
}
