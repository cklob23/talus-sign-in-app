import { getAdminClient } from "@/lib/supabase/server"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

/** Private bucket. Signed NDAs are confidential and never publicly readable. */
export const NDA_BUCKET = "nda-documents"

export interface NdaDocumentRecord {
    id: string
    location_id: string | null
    version: number
    title: string
    storage_path: string
    file_name: string | null
    byte_size: number | null
    created_at: string
}

/**
 * Whether NDA enforcement is switched on.
 *
 * Defaults to false: if the setting row is missing the feature must stay dormant
 * rather than suddenly blocking every visitor at the door.
 */
export async function isNdaEnabled(): Promise<boolean> {
    const admin = getAdminClient()
    const { data } = await admin
        .from("settings")
        .select("value")
        .eq("key", "nda_enabled")
        .is("location_id", null)
        .maybeSingle()
    return data?.value === true
}

/**
 * How many months a signature remains valid. 0 or below means the visitor signs
 * on every visit.
 */
export async function getNdaValidityMonths(): Promise<number> {
    const admin = getAdminClient()
    const { data } = await admin
        .from("settings")
        .select("value")
        .eq("key", "nda_validity_months")
        .is("location_id", null)
        .maybeSingle()
    const raw = typeof data?.value === "number" ? data.value : Number(data?.value)
    return Number.isFinite(raw) ? raw : 12
}

/**
 * The NDA a given location should present.
 *
 * Falls back to the global (null-location) NDA so a new site is covered by the
 * company-wide agreement instead of silently skipping the step.
 */
export async function getCurrentNdaForLocation(locationId: string | null): Promise<NdaDocumentRecord | null> {
    const admin = getAdminClient()

    if (locationId) {
        const { data } = await admin
            .from("nda_documents")
            .select("id, location_id, version, title, storage_path, file_name, byte_size, created_at")
            .eq("location_id", locationId)
            .eq("is_current", true)
            .maybeSingle()
        if (data) return data as NdaDocumentRecord
    }

    const { data: fallback } = await admin
        .from("nda_documents")
        .select("id, location_id, version, title, storage_path, file_name, byte_size, created_at")
        .is("location_id", null)
        .eq("is_current", true)
        .maybeSingle()
    return (fallback as NdaDocumentRecord) ?? null
}

/** A short-lived signed URL. Used for both admin downloads and visitor review. */
export async function createNdaSignedUrl(storagePath: string, expiresInSeconds = 300): Promise<string | null> {
    const admin = getAdminClient()
    const { data, error } = await admin.storage.from(NDA_BUCKET).createSignedUrl(storagePath, expiresInSeconds)
    if (error) {
        console.log("[v0] NDA signed URL failed:", error.message)
        return null
    }
    return data?.signedUrl ?? null
}

/**
 * An existing signature that still covers this visitor for this NDA version.
 *
 * Deliberately scoped to the exact document id: a new NDA version always
 * requires a fresh signature, because the visitor has not read the new text.
 */
export async function findValidAcknowledgement(args: {
    visitorId: string | null
    visitorEmail: string | null
    ndaDocumentId: string
}): Promise<{ id: string; signed_at: string; expires_at: string | null } | null> {
    const admin = getAdminClient()

    // Match on email first. The QR flow inserts a brand new visitors row on every
    // check-in, so visitor_id never matches a previous visit and would make the
    // re-sign window unreachable. Email is the only stable identifier at the door.
    const email = args.visitorEmail?.trim().toLowerCase()
    const query = admin
        .from("nda_acknowledgements")
        .select("id, signed_at, expires_at")
        .eq("nda_document_id", args.ndaDocumentId)
        .order("signed_at", { ascending: false })
        .limit(1)

    const { data } = email
        ? await query.ilike("visitor_email", email).maybeSingle()
        : args.visitorId
            ? await query.eq("visitor_id", args.visitorId).maybeSingle()
            : { data: null }

    if (!data) return null
    // A null expiry means it never lapses.
    if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null
    return data
}

/**
 * Decides whether a visitor must sign before this check-in can complete.
 *
 * Returns the document to present, so the caller does not have to re-query.
 */
export async function resolveNdaRequirement(args: {
    visitorTypeRequiresNda: boolean
    locationId: string | null
    visitorId: string | null
    visitorEmail: string | null
}): Promise<
    | { required: false; reason: "disabled" | "type_exempt" | "no_document" | "already_signed"; document: null }
    | { required: true; document: NdaDocumentRecord }
> {
    if (!args.visitorTypeRequiresNda) return { required: false, reason: "type_exempt", document: null }
    if (!(await isNdaEnabled())) return { required: false, reason: "disabled", document: null }

    const document = await getCurrentNdaForLocation(args.locationId)
    // Enforcement on with nothing uploaded must not trap visitors at the door.
    if (!document) return { required: false, reason: "no_document", document: null }

    const existing = await findValidAcknowledgement({
        visitorId: args.visitorId,
        visitorEmail: args.visitorEmail,
        ndaDocumentId: document.id,
    })
    if (existing) return { required: false, reason: "already_signed", document: null }

    return { required: true, document }
}

function formatUtc(date: Date): string {
    return `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`
}

/**
 * Builds the signed artifact: the original NDA with an appended signature page.
 *
 * One self-contained file is what makes the record defensible. Storing the blank
 * agreement and the signature separately would not prove what was agreed to.
 */
async function buildSignedPdf(args: {
    originalPdf: Uint8Array
    signaturePng: Uint8Array
    visitorName: string
    visitorCompany: string | null
    visitorTypeName: string | null
    hostName: string | null
    locationName: string
    ndaTitle: string
    ndaVersion: number
    signedAt: Date
}): Promise<Uint8Array> {
    const pdf = await PDFDocument.load(args.originalPdf)
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)

    // Match the existing page width so the appended page does not look grafted on.
    const firstPage = pdf.getPages()[0]
    const width = firstPage?.getWidth() ?? 612
    const height = firstPage?.getHeight() ?? 792
    const page = pdf.addPage([width, height])

    const margin = 56
    const ink = rgb(0.1, 0.1, 0.12)
    const muted = rgb(0.42, 0.44, 0.5)
    let y = height - margin

    page.drawText("Electronic Signature Record", { x: margin, y, size: 18, font: helveticaBold, color: ink })
    y -= 26
    page.drawText(`${args.ndaTitle} (version ${args.ndaVersion})`, {
        x: margin,
        y,
        size: 11,
        font: helvetica,
        color: muted,
    })
    y -= 30

    page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 1,
        color: rgb(0.85, 0.86, 0.9),
    })
    y -= 28

    const rows: Array<[string, string]> = [
        ["Signed by", args.visitorName],
        ["Company", args.visitorCompany || "Not provided"],
        ["Visitor type", args.visitorTypeName || "Not specified"],
        ["Host", args.hostName || "Not specified"],
        ["Location", args.locationName],
        ["Date and time", formatUtc(args.signedAt)],
    ]

    for (const [label, value] of rows) {
        page.drawText(label, { x: margin, y, size: 10, font: helveticaBold, color: muted })
        page.drawText(value, { x: margin + 130, y, size: 11, font: helvetica, color: ink })
        y -= 22
    }

    y -= 18
    page.drawText("Signature", { x: margin, y, size: 10, font: helveticaBold, color: muted })
    y -= 12

    const png = await pdf.embedPng(args.signaturePng)
    // Scale to fit the available width while preserving aspect ratio.
    const maxW = Math.min(320, width - margin * 2)
    const maxH = 110
    const scale = Math.min(maxW / png.width, maxH / png.height, 1)
    const drawW = png.width * scale
    const drawH = png.height * scale
    y -= drawH

    page.drawImage(png, { x: margin, y, width: drawW, height: drawH })
    y -= 14
    page.drawLine({
        start: { x: margin, y },
        end: { x: margin + Math.max(drawW, 220), y },
        thickness: 1,
        color: rgb(0.75, 0.76, 0.8),
    })
    y -= 26

    page.drawText(
        "Signed electronically at check-in. This record was generated automatically and is bound to the",
        { x: margin, y, size: 8.5, font: helvetica, color: muted },
    )
    y -= 12
    page.drawText("agreement version identified above.", {
        x: margin,
        y,
        size: 8.5,
        font: helvetica,
        color: muted,
    })

    return pdf.save()
}

/** Strips the data-URL prefix from a canvas export. */
function decodeSignatureDataUrl(dataUrl: string): Uint8Array | null {
    const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl.trim())
    if (!match) return null
    try {
        return new Uint8Array(Buffer.from(match[1], "base64"))
    } catch {
        return null
    }
}

export interface SignNdaResult {
    ok: boolean
    acknowledgementId?: string
    error?: string
}

/**
 * Records a visitor's signature: stamps the PDF, stores both artifacts in the
 * private bucket, and writes the acknowledgement row.
 *
 * Unlike host notifications, a failure here is surfaced to the caller. An
 * unsigned visitor must not be allowed on site when the NDA is mandatory.
 */
export async function signNda(args: {
    ndaDocumentId: string
    signatureDataUrl: string
    visitorId: string | null
    signInId: string | null
    visitorTypeId: string | null
    visitorTypeName: string | null
    locationId: string | null
    locationName: string
    hostId: string | null
    hostName: string | null
    visitorName: string
    visitorCompany: string | null
    visitorEmail: string | null
    ip: string | null
    userAgent: string | null
}): Promise<SignNdaResult> {
    const admin = getAdminClient()

    const signaturePng = decodeSignatureDataUrl(args.signatureDataUrl)
    if (!signaturePng || signaturePng.byteLength === 0) {
        return { ok: false, error: "invalid_signature" }
    }
    // Guard against an oversized payload being pushed through the public route.
    if (signaturePng.byteLength > 2 * 1024 * 1024) {
        return { ok: false, error: "signature_too_large" }
    }

    const { data: ndaDoc } = await admin
        .from("nda_documents")
        .select("id, version, title, storage_path")
        .eq("id", args.ndaDocumentId)
        .maybeSingle()
    if (!ndaDoc) return { ok: false, error: "nda_not_found" }

    const { data: original, error: downloadError } = await admin.storage
        .from(NDA_BUCKET)
        .download(ndaDoc.storage_path)
    if (downloadError || !original) {
        console.log("[v0] NDA template download failed:", downloadError?.message)
        return { ok: false, error: "template_unavailable" }
    }

    const signedAt = new Date()
    let signedPdf: Uint8Array
    try {
        signedPdf = await buildSignedPdf({
            originalPdf: new Uint8Array(await original.arrayBuffer()),
            signaturePng,
            visitorName: args.visitorName,
            visitorCompany: args.visitorCompany,
            visitorTypeName: args.visitorTypeName,
            hostName: args.hostName,
            locationName: args.locationName,
            ndaTitle: ndaDoc.title,
            ndaVersion: ndaDoc.version,
            signedAt,
        })
    } catch (error) {
        console.log("[v0] NDA PDF stamping failed:", error)
        return { ok: false, error: "pdf_generation_failed" }
    }

    const stamp = `${signedAt.toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`
    const signedPath = `signed/${stamp}.pdf`
    const signaturePath = `signatures/${stamp}.png`

    const { error: pdfUploadError } = await admin.storage
        .from(NDA_BUCKET)
        .upload(signedPath, signedPdf, { contentType: "application/pdf", upsert: false })
    if (pdfUploadError) {
        console.log("[v0] Signed NDA upload failed:", pdfUploadError.message)
        return { ok: false, error: "upload_failed" }
    }

    // Kept alongside the stamped PDF so the raw mark can be re-examined later.
    const { error: sigUploadError } = await admin.storage
        .from(NDA_BUCKET)
        .upload(signaturePath, signaturePng, { contentType: "image/png", upsert: false })
    if (sigUploadError) {
        console.log("[v0] Signature image upload failed:", sigUploadError.message)
    }

    const validityMonths = await getNdaValidityMonths()
    let expiresAt: string | null = null
    if (validityMonths > 0) {
        const expiry = new Date(signedAt)
        expiry.setMonth(expiry.getMonth() + validityMonths)
        expiresAt = expiry.toISOString()
    } else {
        // Zero validity means re-sign every visit, so it lapses immediately.
        expiresAt = signedAt.toISOString()
    }

    const { data: ack, error: insertError } = await admin
        .from("nda_acknowledgements")
        .insert({
            nda_document_id: ndaDoc.id,
            visitor_id: args.visitorId,
            sign_in_id: args.signInId,
            visitor_type_id: args.visitorTypeId,
            location_id: args.locationId,
            host_id: args.hostId,
            visitor_name: args.visitorName,
            visitor_company: args.visitorCompany,
            visitor_email: args.visitorEmail?.trim().toLowerCase() || null,
            visitor_type_name: args.visitorTypeName,
            host_name: args.hostName,
            signed_at: signedAt.toISOString(),
            expires_at: expiresAt,
            signed_pdf_storage_path: signedPath,
            signature_storage_path: sigUploadError ? null : signaturePath,
            signature_ip: args.ip,
            user_agent: args.userAgent,
        })
        .select("id")
        .single()

    if (insertError || !ack) {
        // Do not leave an orphaned document implying a record that does not exist.
        await admin.storage.from(NDA_BUCKET).remove([signedPath, signaturePath])
        console.log("[v0] NDA acknowledgement insert failed:", insertError?.message)
        return { ok: false, error: "record_failed" }
    }

    return { ok: true, acknowledgementId: ack.id }
}
