import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/server"
import { getRampAccessToken, fetchRampVendors } from "@/lib/sync/ramp"

/**
 * GET - Preview vendors from Ramp before importing (like Azure AD user preview).
 * Returns the vendor list from Ramp without writing to DB.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminClient = getAdminClient()
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    let rampToken: string
    try {
      rampToken = await getRampAccessToken()
    } catch (authErr) {
      return NextResponse.json(
        { error: authErr instanceof Error ? authErr.message : "Failed to authenticate with Ramp" },
        { status: 500 }
      )
    }

    // Fetch all vendors from Ramp (paginated)
    let allVendors
    try {
      allVendors = await fetchRampVendors(rampToken)
    } catch (fetchErr) {
      return NextResponse.json(
        { error: fetchErr instanceof Error ? fetchErr.message : "Failed to fetch vendors from Ramp" },
        { status: 502 }
      )
    }

    // Check which vendors already exist in our DB
    const { data: existingVendors } = await adminClient
      .from("vendors")
      .select("ramp_vendor_id")

    const existingRampIds = new Set(
      (existingVendors || []).map((v: { ramp_vendor_id: string | null }) => v.ramp_vendor_id).filter(Boolean)
    )

    // Return vendors with an "exists" flag
    const vendors = allVendors.map((v) => ({
      id: v.id,
      name: v.name,
      name_legal: v.name_legal || null,
      is_active: v.is_active !== false,
      country: v.country || null,
      state: v.state || null,
      description: v.description || null,
      category_name: v.category_name || null,
      exists: existingRampIds.has(v.id),
    }))

    return NextResponse.json({ vendors })
  } catch (err) {
    console.error("Ramp preview error:", err)
    return NextResponse.json(
      { error: "Failed to fetch vendors from Ramp" },
      { status: 500 }
    )
  }
}

/**
 * POST - Import selected vendors from the preview into the database.
 * Accepts { vendors: [...] } with the selected vendor objects from the GET preview.
 * This avoids re-fetching all 2700+ vendors from Ramp again.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminClient = getAdminClient()
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const selectedVendors: {
      id: string
      name: string
      name_legal?: string | null
      is_active?: boolean
      country?: string | null
      state?: string | null
      description?: string | null
      category_name?: string | null
    }[] = body.vendors

    if (!selectedVendors || selectedVendors.length === 0) {
      return NextResponse.json({ error: "No vendors provided" }, { status: 400 })
    }

    // Query existing vendor ramp IDs to distinguish creates from updates
    const incomingRampIds = selectedVendors.map(v => v.id).filter(Boolean)
    const { data: existingVendorRows } = await adminClient
      .from("vendors")
      .select("ramp_vendor_id")
      .in("ramp_vendor_id", incomingRampIds)

    const existingIdSet = new Set(
      (existingVendorRows || []).map((v: { ramp_vendor_id: string }) => v.ramp_vendor_id)
    )

    // Batch upsert selected vendors (chunks of 100 for speed)
    const now = new Date().toISOString()
    let createdCount = 0
    let updatedCount = 0
    const errors: string[] = []

    const BATCH_SIZE = 100
    for (let i = 0; i < selectedVendors.length; i += BATCH_SIZE) {
      const batch = selectedVendors.slice(i, i + BATCH_SIZE).map((v) => ({
        ramp_vendor_id: v.id,
        name: v.name,
        name_legal: v.name_legal || null,
        is_active: v.is_active !== false,
        country: v.country || null,
        state: v.state || null,
        description: v.description || null,
        category_name: v.category_name || null,
        synced_at: now,
      }))

      const { error } = await adminClient
        .from("vendors")
        .upsert(batch, { onConflict: "ramp_vendor_id", count: "exact" })

      if (error) {
        console.error(`Batch ${i / BATCH_SIZE + 1} error:`, error)
        errors.push(`Batch ${i / BATCH_SIZE + 1}: ${error.message}`)
      } else {
        for (const item of batch) {
          if (existingIdSet.has(item.ramp_vendor_id)) {
            updatedCount++
          } else {
            createdCount++
          }
        }
      }
    }

    const upserted = createdCount + updatedCount

    if (errors.length > 0 && upserted === 0) {
      return NextResponse.json(
        { error: `Import failed: ${errors[0]}` },
        { status: 500 }
      )
    }

    // Update last sync timestamp for scheduled sync tracking
    if (upserted > 0) {
      const { data: existing } = await adminClient
        .from("settings")
        .select("id")
        .eq("key", "last_ramp_sync")
        .is("location_id", null)
        .single()

      if (existing) {
        await adminClient
          .from("settings")
          .update({ value: new Date().toISOString() })
          .eq("id", existing.id)
      } else {
        await adminClient
          .from("settings")
          .insert({ key: "last_ramp_sync", value: new Date().toISOString(), location_id: null })
      }
    }

    return NextResponse.json({
      success: true,
      synced: upserted,
      created: createdCount,
      updated: updatedCount,
      total_selected: selectedVendors.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error("Ramp import error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to import vendors" },
      { status: 500 }
    )
  }
}
