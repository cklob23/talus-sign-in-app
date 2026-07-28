import { type NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { createNdaSignedUrl, resolveNdaRequirement, signNda } from "@/lib/nda"

/**
 * NDA resolve + sign for the staffed kiosk.
 *
 * Mirrors the QR check-in NDA route so both entry points share one signing core.
 * The kiosk runs behind a receptionist session, and these operations only ever
 * read the NDA template or append an acknowledgement, so no visitor PII is
 * exposed beyond what the kiosk already holds.
 */
export async function POST(request: NextRequest) {
    let body: {
        intent?: "resolve" | "sign" | "link"
        visitorTypeId?: string
        locationId?: string
        email?: string
        // sign only
        ndaDocumentId?: string
        signatureDataUrl?: string
        visitorId?: string
        signInId?: string
        visitorName?: string
        visitorCompany?: string
        hostId?: string
        // link only
        acknowledgementId?: string
    }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const admin = getAdminClient()

    if (body.intent === "resolve") {
        if (!body.visitorTypeId) {
            return NextResponse.json({ error: "Visitor type is required" }, { status: 400 })
        }

        const { data: visitorType } = await admin
            .from("visitor_types")
            .select("id, requires_nda")
            .eq("id", body.visitorTypeId)
            .maybeSingle()

        const requirement = await resolveNdaRequirement({
            visitorTypeRequiresNda: visitorType?.requires_nda === true,
            locationId: body.locationId ?? null,
            visitorId: null,
            visitorEmail: body.email ?? null,
        })

        if (!requirement.required) {
            return NextResponse.json({ required: false, reason: requirement.reason })
        }

        const url = await createNdaSignedUrl(requirement.document.storage_path, 900)
        if (!url) return NextResponse.json({ required: false, reason: "no_document" })

        return NextResponse.json({
            required: true,
            ndaDocumentId: requirement.document.id,
            title: requirement.document.title,
            version: requirement.document.version,
            documentUrl: url,
        })
    }

    if (body.intent === "sign") {
        if (!body.ndaDocumentId || !body.signatureDataUrl || !body.visitorName) {
            return NextResponse.json({ error: "Missing signature details" }, { status: 400 })
        }

        let locationName = "Unknown location"
        if (body.locationId) {
            const { data: loc } = await admin.from("locations").select("name").eq("id", body.locationId).maybeSingle()
            locationName = loc?.name ?? locationName
        }

        let hostName: string | null = null
        if (body.hostId) {
            const { data: host } = await admin.from("hosts").select("name").eq("id", body.hostId).maybeSingle()
            hostName = host?.name ?? null
        }

        let visitorTypeName: string | null = null
        if (body.visitorTypeId) {
            const { data: vt } = await admin
                .from("visitor_types")
                .select("name")
                .eq("id", body.visitorTypeId)
                .maybeSingle()
            visitorTypeName = vt?.name ?? null
        }

        const result = await signNda({
            ndaDocumentId: body.ndaDocumentId,
            signatureDataUrl: body.signatureDataUrl,
            visitorId: body.visitorId ?? null,
            signInId: body.signInId ?? null,
            visitorTypeId: body.visitorTypeId ?? null,
            visitorTypeName,
            locationId: body.locationId ?? null,
            locationName,
            hostId: body.hostId ?? null,
            hostName,
            visitorName: body.visitorName,
            visitorCompany: body.visitorCompany ?? null,
            visitorEmail: body.email ?? null,
            ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
            userAgent: request.headers.get("user-agent"),
        })

        if (!result.ok) {
            return NextResponse.json({ error: result.error ?? "Could not record the signature" }, { status: 500 })
        }
        return NextResponse.json({ success: true, acknowledgementId: result.acknowledgementId })
    }

    // The kiosk signs before the sign_in row exists, so that a failed signature
    // aborts the check-in rather than leaving a visitor on site unsigned. Once the
    // sign_in is created, this binds the acknowledgement to that visit.
    if (body.intent === "link") {
        if (!body.acknowledgementId || !body.signInId) {
            return NextResponse.json({ error: "Missing acknowledgement or sign-in id" }, { status: 400 })
        }
        const { error } = await admin
            .from("nda_acknowledgements")
            .update({ sign_in_id: body.signInId })
            .eq("id", body.acknowledgementId)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown intent" }, { status: 400 })
}
