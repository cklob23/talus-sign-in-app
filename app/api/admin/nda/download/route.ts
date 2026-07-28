import { type NextRequest, NextResponse } from "next/server"
import { createClient, getAdminClient } from "@/lib/supabase/server"
import { createNdaSignedUrl } from "@/lib/nda"

/**
 * Issues a short-lived signed URL for a stored NDA PDF.
 *
 * The bucket is private, so this route is the only way to reach a document, and
 * it requires an admin session. The path is validated against a real database
 * row rather than trusted from the query string, which stops a crafted path from
 * reading arbitrary objects out of the bucket.
 */
export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle()
    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const acknowledgementId = request.nextUrl.searchParams.get("acknowledgementId")
    const documentId = request.nextUrl.searchParams.get("documentId")

    const admin = getAdminClient()
    let storagePath: string | null = null
    let auditTarget: string | null = null

    if (acknowledgementId) {
        const { data } = await admin
            .from("nda_acknowledgements")
            .select("id, signed_pdf_storage_path, visitor_name")
            .eq("id", acknowledgementId)
            .maybeSingle()
        storagePath = data?.signed_pdf_storage_path ?? null
        auditTarget = data ? `signed NDA for ${data.visitor_name}` : null
    } else if (documentId) {
        const { data } = await admin
            .from("nda_documents")
            .select("id, storage_path, title, version")
            .eq("id", documentId)
            .maybeSingle()
        storagePath = data?.storage_path ?? null
        auditTarget = data ? `${data.title} v${data.version}` : null
    } else {
        return NextResponse.json({ error: "A document or acknowledgement id is required" }, { status: 400 })
    }

    if (!storagePath) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    const url = await createNdaSignedUrl(storagePath, 120)
    if (!url) {
        return NextResponse.json({ error: "Could not generate a download link" }, { status: 500 })
    }

    // Access to a confidential legal document is itself worth recording.
    await admin.from("audit_logs").insert({
        user_id: profile.id,
        action: "nda.downloaded",
        entity_type: "nda",
        entity_id: acknowledgementId ?? documentId,
        description: `Downloaded ${auditTarget ?? "an NDA document"}`,
        metadata: { acknowledgement_id: acknowledgementId, document_id: documentId },
    })

    return NextResponse.json({ url })
}
