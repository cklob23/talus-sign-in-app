import { type NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { createNdaSignedUrl, resolveNdaRequirement } from "@/lib/nda"

/**
 * Tells the QR check-in flow whether this visitor type needs an NDA and, if so,
 * hands back a short-lived URL to review the document.
 *
 * The poster token is the only credential here, so the visitor type is verified
 * to belong to the token's location before anything is returned.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params

    const admin = getAdminClient()
    const { data: qr } = await admin
        .from("location_qr_codes")
        .select("location_id, is_active, locations(id, name)")
        .eq("token", token)
        .maybeSingle()

    if (!qr || qr.is_active === false) {
        return NextResponse.json({ error: "Invalid check-in link" }, { status: 404 })
    }

    let body: { visitorTypeId?: string; email?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const visitorTypeId = body.visitorTypeId?.trim()
    if (!visitorTypeId) {
        return NextResponse.json({ error: "Visitor type is required" }, { status: 400 })
    }

    // Scope the visitor type to this token's location so a token cannot be used
    // to probe or sign against another site's configuration.
    const { data: visitorType } = await admin
        .from("visitor_types")
        .select("id, name, requires_nda, location_id")
        .eq("id", visitorTypeId)
        .eq("location_id", qr.location_id)
        .maybeSingle()

    if (!visitorType) {
        return NextResponse.json({ error: "Visitor type not found" }, { status: 400 })
    }

    const requirement = await resolveNdaRequirement({
        visitorTypeRequiresNda: visitorType.requires_nda === true,
        locationId: qr.location_id,
        visitorId: null,
        visitorEmail: body.email ?? null,
    })

    if (!requirement.required) {
        return NextResponse.json({ required: false, reason: requirement.reason })
    }

    const url = await createNdaSignedUrl(requirement.document.storage_path, 900)
    if (!url) {
        // Cannot show the agreement, so cannot ask for a signature on it.
        return NextResponse.json({ required: false, reason: "no_document" })
    }

    return NextResponse.json({
        required: true,
        ndaDocumentId: requirement.document.id,
        title: requirement.document.title,
        version: requirement.document.version,
        documentUrl: url,
    })
}
