import { type NextRequest, NextResponse } from "next/server"
import { createClient, getAdminClient } from "@/lib/supabase/server"

/**
 * Signed NDA records for the admin audit view.
 *
 * Admin-only: these rows contain visitor names, companies and signature
 * metadata, so they are never exposed to the anonymous check-in routes.
 */
export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const locationId = params.get("locationId")
    const search = params.get("search")?.trim()
    const from = params.get("from")
    const to = params.get("to")

    const admin = getAdminClient()
    let query = admin
        .from("nda_acknowledgements")
        .select(
            "id, visitor_name, visitor_company, visitor_email, visitor_type_name, host_name, signed_at, expires_at, signed_pdf_storage_path, location_id, nda_documents(version, title), locations(name)",
        )
        .order("signed_at", { ascending: false })
        .limit(500)

    if (locationId && locationId !== "all") query = query.eq("location_id", locationId)
    if (from) query = query.gte("signed_at", from)
    // Make the end date inclusive of the whole day.
    if (to) query = query.lte("signed_at", `${to}T23:59:59.999Z`)
    if (search) {
        query = query.or(`visitor_name.ilike.%${search}%,visitor_company.ilike.%${search}%`)
    }

    const { data, error } = await query
    if (error) {
        console.log("[v0] NDA acknowledgements query failed:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ acknowledgements: data ?? [] })
}
