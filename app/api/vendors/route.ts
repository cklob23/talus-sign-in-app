import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"

/**
 * GET /api/vendors?active_only=true&q=search&limit=20
 * Returns vendors for this instance. Supports search for the kiosk autocomplete.
 *  - q: search term (filters by name, case-insensitive)
 *  - active_only: only active vendors (default true)
 *  - limit: max results (default 20 for search, all for full list)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get("active_only") !== "false"
  const search = searchParams.get("q")?.trim() || ""
  const limitParam = searchParams.get("limit")

  const adminClient = getAdminClient()

  let query = adminClient
    .from("vendors")
    .select("id, name, is_active, ramp_vendor_id")
    .order("name")

  if (activeOnly) {
    query = query.eq("is_active", true)
  }

  if (search.length > 0) {
    query = query.ilike("name", `%${search}%`)
  }

  // Apply limit: default 20 for search queries, no limit otherwise
  const limit = limitParam
    ? parseInt(limitParam, 10)
    : search.length > 0
      ? 20
      : 5000
  query = query.limit(limit)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ vendors: data || [] })
}
