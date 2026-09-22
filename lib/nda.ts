import { getAdminClient } from "@/lib/supabase/server"
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib"
import { type NdaFieldPosition, type NdaFieldRole, parseFieldPositions } from "@/lib/nda-fields"
import { renderEmailShell, sendEmail } from "@/lib/email"
import { uploadToSharePoint } from "@/lib/sharepoint"
import { randomBytes } from "crypto"

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
    field_positions: NdaFieldPosition[]
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
    const cols = "id, location_id, version, title, storage_path, file_name, byte_size, field_positions, created_at"

    if (locationId) {
        const { data } = await admin
            .from("nda_documents")
            .select(cols)
            .eq("location_id", locationId)
            .eq("is_current", true)
            .maybeSingle()
        if (data) return toNdaRecord(data)
    }

    const { data: fallback } = await admin
        .from("nda_documents")
        .select(cols)
        .is("location_id", null)
        .eq("is_current", true)
        .maybeSingle()
    return fallback ? toNdaRecord(fallback) : null
}

/** Normalises a raw nda_documents row, coercing the stored field array. */
function toNdaRecord(row: Record<string, unknown>): NdaDocumentRecord {
    return {
        id: row.id as string,
        location_id: (row.location_id as string | null) ?? null,
        version: row.version as number,
        title: row.title as string,
        storage_path: row.storage_path as string,
        file_name: (row.file_name as string | null) ?? null,
        byte_size: (row.byte_size as number | null) ?? null,
        field_positions: parseFieldPositions(row.field_positions),
        created_at: row.created_at as string,
    }
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

/** Full date for a signature-block date field, e.g. "Sep 21, 2026". */
function formatFieldDate(date: Date): string {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

/**
 * Abbreviated month and day only, e.g. "Sep 21". The NDA template already
 * prints the year after the Effective Date blank, and the blank is short, so
 * the month is abbreviated to fit at a legible size.
 */
function formatEffectiveDate(date: Date): string {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

/**
 * Public origin for links in outbound email. Prefers the incoming request's
 * host so links match the environment they were generated from, then falls
 * back to configured/Vercel-provided URLs.
 */
export function resolveAppOrigin(request?: { headers: Headers; url: string } | null): string {
    if (request) {
        const forwardedHost = request.headers.get("x-forwarded-host")
        const forwardedProto = request.headers.get("x-forwarded-proto")
        if (forwardedHost) return `${forwardedProto ?? "https"}://${forwardedHost}`
        try {
            return new URL(request.url).origin
        } catch {
            // fall through to env-based resolution
        }
    }
    const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (configured) return configured.replace(/\/+$/, "")
    const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    if (vercelProd) return `https://${vercelProd}`
    const vercel = process.env.VERCEL_URL?.trim()
    if (vercel) return `https://${vercel}`
    return ""
}

/** The text/image a given field carries, keyed on its kind. */
export interface FieldValues {
    signaturePng?: Uint8Array | null
    name?: string | null
    company?: string | null
    title?: string | null
    date?: string | null
    effectiveDate?: string | null
}

function fieldText(kind: NdaFieldPosition["kind"], values: FieldValues): string | null {
    switch (kind) {
        case "name":
            return values.name ?? null
        case "company":
            return values.company ?? null
        case "title":
            return values.title ?? null
        case "date":
            return values.date ?? null
        case "effective_date":
            return values.effectiveDate ?? null
        default:
            return null
    }
}

/**
 * Draws the placed fields for one signing party onto the PDF's existing pages.
 *
 * Coordinates are top-left fractions of each page; pdf-lib's origin is
 * bottom-left, so y is flipped here. Text is vertically centred in its box and
 * a signature image is scaled to fit while preserving aspect ratio.
 */
async function stampFields(
    pdf: PDFDocument,
    positions: NdaFieldPosition[],
    role: NdaFieldRole,
    values: FieldValues,
    font: PDFFont,
): Promise<void> {
    const pages = pdf.getPages()
    const ink = rgb(0.1, 0.1, 0.12)

    for (const f of positions) {
        if (f.role !== role) continue
        const page = pages[f.page]
        if (!page) continue

        const { width, height } = page.getSize()
        const w = f.wPct * width
        const h = f.hPct * height
        const x = f.xPct * width
        const yBottom = height - f.yPct * height - h

        if (f.kind === "signature") {
            if (!values.signaturePng || values.signaturePng.byteLength === 0) continue
            try {
                const png = await pdf.embedPng(values.signaturePng)
                const scale = Math.min(w / png.width, h / png.height)
                const dw = png.width * scale
                const dh = png.height * scale
                page.drawImage(png, { x: x + (w - dw) / 2, y: yBottom + (h - dh) / 2, width: dw, height: dh })
            } catch {
                // A bad signature image must not abort the whole stamp.
            }
            continue
        }

        const text = fieldText(f.kind, values)
        if (!text) continue
        // Start from the requested/derived size, then shrink until the text fits
        // the box width so it never spills over the printed template text.
        let size = f.fontSize ?? Math.min(Math.max(h * 0.62, 8), 14)
        const pad = 2
        while (size > 6 && font.widthOfTextAtSize(text, size) > w - pad * 2) size -= 0.5
        page.drawText(text, { x: x + pad, y: yBottom + (h - size) / 2 + size * 0.15, size, font, color: ink })
    }
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
    fieldPositions: NdaFieldPosition[]
}): Promise<Uint8Array> {
    const pdf = await PDFDocument.load(args.originalPdf)
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)

    // First, drop the visitor's marks into the placed fields on the real pages.
    // The signed date doubles as the effective date of the agreement.
    await stampFields(pdf, args.fieldPositions, "visitor", {
        signaturePng: args.signaturePng,
        name: args.visitorName,
        company: args.visitorCompany,
        date: formatFieldDate(args.signedAt),
        effectiveDate: formatEffectiveDate(args.signedAt),
    }, helvetica)

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
    /** Public origin used to build the countersign link (see resolveAppOrigin). */
    appOrigin?: string
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
        .select("id, version, title, storage_path, field_positions")
        .eq("id", args.ndaDocumentId)
        .maybeSingle()
    if (!ndaDoc) return { ok: false, error: "nda_not_found" }
    const fieldPositions = parseFieldPositions(ndaDoc.field_positions)

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
            fieldPositions,
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

    // Kick off executive countersigning if it is switched on. Best effort: the
    // visitor is already recorded and on site, so a failure to dispatch the
    // countersign request must not fail their check-in.
    try {
        await createCountersignRequest({
            acknowledgementId: ack.id,
            ndaDocumentId: ndaDoc.id,
            ndaTitle: ndaDoc.title,
            ndaVersion: ndaDoc.version,
            signedPdf,
            visitorName: args.visitorName,
            visitorCompany: args.visitorCompany,
            visitorEmail: args.visitorEmail,
            locationName: args.locationName,
            appOrigin: args.appOrigin || resolveAppOrigin(null),
        })
    } catch (error) {
        console.log("[v0] NDA countersign dispatch failed:", error instanceof Error ? error.message : error)
    }

    return { ok: true, acknowledgementId: ack.id }
}

// ---------------------------------------------------------------------------
// Executive countersigning
// ---------------------------------------------------------------------------

export interface CountersignRecipient {
    email: string
    name?: string | null
}

export interface CountersignConfig {
    enabled: boolean
    recipients: CountersignRecipient[]
    validityDays: number
}

/** Reads countersigning settings, tolerating both stored strings and JSON. */
export async function getCountersignConfig(): Promise<CountersignConfig> {
    const admin = getAdminClient()
    const { data } = await admin
        .from("settings")
        .select("key, value")
        .is("location_id", null)
        .in("key", ["nda_countersign_enabled", "nda_recipient_emails", "nda_countersign_validity_days"])

    const map: Record<string, unknown> = {}
    for (const row of data ?? []) map[row.key] = row.value

    const enabled = map.nda_countersign_enabled === true || map.nda_countersign_enabled === "true"

    let recipients: CountersignRecipient[] = []
    const raw = map.nda_recipient_emails
    const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? safeJsonArray(raw) : []
    recipients = arr
        .map((r) => {
            if (typeof r === "string") return { email: r.trim().toLowerCase() }
            if (r && typeof r === "object" && typeof (r as { email?: unknown }).email === "string") {
                return { email: (r as { email: string }).email.trim().toLowerCase(), name: (r as { name?: string }).name ?? null }
            }
            return null
        })
        .filter((r): r is CountersignRecipient => !!r && r.email.length > 0)

    const days = typeof map.nda_countersign_validity_days === "number" ? map.nda_countersign_validity_days : Number(map.nda_countersign_validity_days)
    return { enabled, recipients, validityDays: Number.isFinite(days) ? days : 14 }
}

function safeJsonArray(s: string): unknown[] {
    try {
        const parsed = JSON.parse(s)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

interface SharePointConfig {
    enabled: boolean
    siteUrl: string
    folderPath: string
}

async function getSharePointConfig(): Promise<SharePointConfig> {
    const admin = getAdminClient()
    const { data } = await admin
        .from("settings")
        .select("key, value")
        .is("location_id", null)
        .in("key", ["nda_sharepoint_enabled", "nda_sharepoint_site_url", "nda_sharepoint_folder_path"])
    const map: Record<string, unknown> = {}
    for (const row of data ?? []) map[row.key] = row.value
    const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v))
    return {
        enabled: map.nda_sharepoint_enabled === true || map.nda_sharepoint_enabled === "true",
        siteUrl: str(map.nda_sharepoint_site_url),
        folderPath: str(map.nda_sharepoint_folder_path) || "Signed NDAs",
    }
}

function newCountersignToken(): string {
    return randomBytes(24).toString("base64url")
}

/** A filesystem-safe base for signed NDA filenames. */
function slug(text: string): string {
    return text.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "nda"
}

/**
 * Creates the countersign request and emails the configured executives a secure
 * link plus the visitor-signed PDF. No-op when countersigning is off or no
 * recipients are configured.
 */
async function createCountersignRequest(args: {
    acknowledgementId: string
    ndaDocumentId: string
    ndaTitle: string
    ndaVersion: number
    signedPdf: Uint8Array
    visitorName: string
    visitorCompany: string | null
    visitorEmail: string | null
    locationName: string
    appOrigin: string
}): Promise<void> {
    const config = await getCountersignConfig()
    if (!config.enabled || config.recipients.length === 0) return

    const admin = getAdminClient()
    const token = newCountersignToken()
    const expiresAt =
        config.validityDays > 0 ? new Date(Date.now() + config.validityDays * 86400_000).toISOString() : null

    const { error } = await admin.from("nda_countersignatures").insert({
        acknowledgement_id: args.acknowledgementId,
        nda_document_id: args.ndaDocumentId,
        token,
        status: "pending",
        recipients: config.recipients,
        visitor_name: args.visitorName,
        visitor_company: args.visitorCompany,
        visitor_email: args.visitorEmail?.trim().toLowerCase() || null,
        location_name: args.locationName,
        nda_title: args.ndaTitle,
        nda_version: args.ndaVersion,
        expires_at: expiresAt,
    })
    if (error) {
        console.log("[v0] countersign insert failed:", error.message)
        return
    }

    const appUrl = (args.appOrigin || resolveAppOrigin(null)).replace(/\/+$/, "")
    if (!appUrl) console.log("[v0] countersign link has no origin; set NEXT_PUBLIC_SITE_URL")
    const link = `${appUrl}/nda/countersign/${token}`
    const companyName = (await getSmtpCompanyName()) || "Talus Ag"

    const body = `
    <p style="margin:0 0 16px;">A visitor has signed the <strong>${escapeHtml(args.ndaTitle)}</strong> (version ${args.ndaVersion}) and it now needs your countersignature to be finalized.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 20px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 6px;"><span style="color:#6b7280;">Visitor:</span> <strong>${escapeHtml(args.visitorName)}</strong></p>
        ${args.visitorCompany ? `<p style="margin:0 0 6px;"><span style="color:#6b7280;">Company:</span> ${escapeHtml(args.visitorCompany)}</p>` : ""}
        <p style="margin:0;"><span style="color:#6b7280;">Location:</span> ${escapeHtml(args.locationName)}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 12px;">The visitor-signed copy is attached for your review. To countersign, open the secure link below, review the document, then sign as the Talus representative:</p>
    <p style="margin:0 0 24px;text-align:center;">
      <a href="${link}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;">Review &amp; countersign</a>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;">First recipient to countersign finalizes the agreement.${expiresAt ? ` This link expires on ${new Date(expiresAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}.` : ""}</p>
    <p style="margin:12px 0 0;color:#9ca3af;font-size:12px;word-break:break-all;">If the button does not work, paste this link: ${link}</p>
  `

    const html = renderEmailShell({ companyName, heading: "NDA awaiting your countersignature", accent: "#7c3aed", bodyHtml: body })
    const attachmentName = `NDA-${slug(args.visitorName)}-v${args.ndaVersion}-visitor-signed.pdf`

    await sendEmail({
        to: config.recipients.map((r) => r.email),
        subject: `Countersignature needed: ${args.visitorName}${args.visitorCompany ? ` (${args.visitorCompany})` : ""} NDA`,
        html,
        text: `A visitor (${args.visitorName}${args.visitorCompany ? `, ${args.visitorCompany}` : ""}) signed the ${args.ndaTitle}. Countersign it here: ${link}`,
        attachments: [{ filename: attachmentName, content: args.signedPdf, contentType: "application/pdf" }],
    })
}

async function getSmtpCompanyName(): Promise<string | null> {
    const admin = getAdminClient()
    const { data } = await admin.from("settings").select("value").eq("key", "company_name").is("location_id", null).maybeSingle()
    return data?.value ? String(data.value) : null
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/**
 * Appends a countersignature audit page mirroring the visitor's, so the final
 * artifact documents both parties on one record.
 */
async function buildCountersignedPdf(args: {
    visitorSignedPdf: Uint8Array
    signaturePng: Uint8Array
    fieldPositions: NdaFieldPosition[]
    signerName: string
    signerTitle: string | null
    ndaTitle: string
    ndaVersion: number
    visitorName: string
    countersignedAt: Date
}): Promise<Uint8Array> {
    const pdf = await PDFDocument.load(args.visitorSignedPdf)
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)

    await stampFields(pdf, args.fieldPositions, "company", {
        signaturePng: args.signaturePng,
        name: args.signerName,
        title: args.signerTitle,
        date: formatFieldDate(args.countersignedAt),
    }, helvetica)

    const first = pdf.getPages()[0]
    const width = first?.getWidth() ?? 612
    const height = first?.getHeight() ?? 792
    const page = pdf.addPage([width, height])
    const margin = 56
    const ink = rgb(0.1, 0.1, 0.12)
    const muted = rgb(0.42, 0.44, 0.5)
    let y = height - margin

    page.drawText("Countersignature Record", { x: margin, y, size: 18, font: helveticaBold, color: ink })
    y -= 26
    page.drawText(`${args.ndaTitle} (version ${args.ndaVersion})`, { x: margin, y, size: 11, font: helvetica, color: muted })
    y -= 30
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.85, 0.86, 0.9) })
    y -= 28

    const rows: Array<[string, string]> = [
        ["Countersigned by", args.signerName],
        ["Title", args.signerTitle || "Not provided"],
        ["On behalf of", "Talus Ag"],
        ["Visitor", args.visitorName],
        ["Date and time", formatUtc(args.countersignedAt)],
    ]
    for (const [label, value] of rows) {
        page.drawText(label, { x: margin, y, size: 10, font: helveticaBold, color: muted })
        page.drawText(value, { x: margin + 130, y, size: 11, font: helvetica, color: ink })
        y -= 22
    }

    y -= 18
    page.drawText("Signature", { x: margin, y, size: 10, font: helveticaBold, color: muted })
    y -= 12
    try {
        const png = await pdf.embedPng(args.signaturePng)
        const maxW = Math.min(320, width - margin * 2)
        const scale = Math.min(maxW / png.width, 110 / png.height, 1)
        const drawW = png.width * scale
        const drawH = png.height * scale
        y -= drawH
        page.drawImage(png, { x: margin, y, width: drawW, height: drawH })
        y -= 14
        page.drawLine({ start: { x: margin, y }, end: { x: margin + Math.max(drawW, 220), y }, thickness: 1, color: rgb(0.75, 0.76, 0.8) })
    } catch {
        // If the image fails, the typed name and audit rows still stand as the record.
    }

    return pdf.save()
}

export interface CountersignContext {
    status: string
    visitorName: string
    visitorCompany: string | null
    locationName: string | null
    ndaTitle: string | null
    ndaVersion: number | null
    expired: boolean
    documentUrl: string | null
    signerName?: string | null
    signedAt?: string | null
}

/** Loads a countersign request by token for the public signing screen. */
export async function getCountersignByToken(token: string): Promise<CountersignContext | null> {
    const admin = getAdminClient()
    const { data } = await admin
        .from("nda_countersignatures")
        .select(
            "id, status, visitor_name, visitor_company, location_name, nda_title, nda_version, expires_at, signer_name, signed_at, acknowledgement_id",
        )
        .eq("token", token)
        .maybeSingle()
    if (!data) return null

    const expired = !!data.expires_at && new Date(data.expires_at).getTime() <= Date.now() && data.status === "pending"

    let documentUrl: string | null = null
    if (data.status === "pending" && !expired) {
        const { data: ack } = await admin
            .from("nda_acknowledgements")
            .select("signed_pdf_storage_path")
            .eq("id", data.acknowledgement_id)
            .maybeSingle()
        if (ack?.signed_pdf_storage_path) documentUrl = await createNdaSignedUrl(ack.signed_pdf_storage_path, 900)
    }

    return {
        status: data.status,
        visitorName: data.visitor_name,
        visitorCompany: data.visitor_company,
        locationName: data.location_name,
        ndaTitle: data.nda_title,
        ndaVersion: data.nda_version,
        expired,
        documentUrl,
        signerName: data.signer_name,
        signedAt: data.signed_at,
    }
}

export interface FinalizeResult {
    ok: boolean
    error?: string
    sharepointUrl?: string | null
    sharepointError?: string | null
}

/**
 * Finalizes an NDA: stamps the executive's signature onto the visitor-signed
 * PDF, archives it to SharePoint when configured, records the outcome, and
 * emails the finalized copy to everyone involved. First valid submission wins;
 * a second attempt on an already-signed token is rejected.
 */
export async function finalizeCountersignature(args: {
    token: string
    signerName: string
    signerTitle: string | null
    signatureDataUrl: string
    ip: string | null
    userAgent: string | null
}): Promise<FinalizeResult> {
    const admin = getAdminClient()

    const signerName = args.signerName.trim()
    if (!signerName) return { ok: false, error: "name_required" }

    const signaturePng = decodeSignatureDataUrl(args.signatureDataUrl)
    if (!signaturePng || signaturePng.byteLength === 0) return { ok: false, error: "invalid_signature" }
    if (signaturePng.byteLength > 2 * 1024 * 1024) return { ok: false, error: "signature_too_large" }

    const { data: row } = await admin
        .from("nda_countersignatures")
        .select("id, status, expires_at, acknowledgement_id, nda_document_id, recipients, visitor_name, visitor_company, visitor_email, location_name, nda_title, nda_version")
        .eq("token", args.token)
        .maybeSingle()
    if (!row) return { ok: false, error: "not_found" }
    if (row.status !== "pending") return { ok: false, error: "already_finalized" }
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, error: "expired" }

    const { data: ack } = await admin
        .from("nda_acknowledgements")
        .select("signed_pdf_storage_path")
        .eq("id", row.acknowledgement_id)
        .maybeSingle()
    if (!ack?.signed_pdf_storage_path) return { ok: false, error: "source_missing" }

    const { data: visitorPdf, error: dlError } = await admin.storage.from(NDA_BUCKET).download(ack.signed_pdf_storage_path)
    if (dlError || !visitorPdf) return { ok: false, error: "source_unavailable" }

    const { data: doc } = await admin
        .from("nda_documents")
        .select("field_positions")
        .eq("id", row.nda_document_id)
        .maybeSingle()
    const fieldPositions = parseFieldPositions(doc?.field_positions)

    const countersignedAt = new Date()
    let finalPdf: Uint8Array
    try {
        finalPdf = await buildCountersignedPdf({
            visitorSignedPdf: new Uint8Array(await visitorPdf.arrayBuffer()),
            signaturePng,
            fieldPositions,
            signerName,
            signerTitle: args.signerTitle?.trim() || null,
            ndaTitle: row.nda_title || "Non-Disclosure Agreement",
            ndaVersion: row.nda_version ?? 1,
            visitorName: row.visitor_name,
            countersignedAt,
        })
    } catch (error) {
        console.log("[v0] countersigned PDF build failed:", error)
        return { ok: false, error: "pdf_generation_failed" }
    }

    const stamp = `${countersignedAt.toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`
    const finalPath = `finalized/${stamp}.pdf`
    const sigPath = `countersignatures/${stamp}.png`

    const { error: upErr } = await admin.storage
        .from(NDA_BUCKET)
        .upload(finalPath, finalPdf, { contentType: "application/pdf", upsert: false })
    if (upErr) {
        console.log("[v0] finalized NDA upload failed:", upErr.message)
        return { ok: false, error: "upload_failed" }
    }
    await admin.storage.from(NDA_BUCKET).upload(sigPath, signaturePng, { contentType: "image/png", upsert: false }).catch(() => { })

    // Archive to SharePoint when configured. A failure here is recorded but does
    // not fail finalization — the record still lives in our own storage.
    let sharepointUrl: string | null = null
    let sharepointError: string | null = null
    const sp = await getSharePointConfig()
    if (sp.enabled && sp.siteUrl) {
        const fileName = `NDA-${slug(row.visitor_name)}${row.visitor_company ? `-${slug(row.visitor_company)}` : ""}-v${row.nda_version ?? 1}-signed.pdf`
        const result = await uploadToSharePoint({ siteUrl: sp.siteUrl, folderPath: sp.folderPath, fileName, bytes: finalPdf })
        if (result.ok) sharepointUrl = result.url ?? null
        else sharepointError = result.error ?? "SharePoint upload failed"
    }

    // Claim the row atomically: only flip it if still pending, so two recipients
    // signing at once cannot both finalize.
    const { data: claimed, error: claimErr } = await admin
        .from("nda_countersignatures")
        .update({
            status: "signed",
            signer_name: signerName,
            signer_title: args.signerTitle?.trim() || null,
            signed_at: countersignedAt.toISOString(),
            signature_storage_path: sigPath,
            final_pdf_storage_path: finalPath,
            sharepoint_url: sharepointUrl,
            sharepoint_error: sharepointError,
            signer_ip: args.ip,
            user_agent: args.userAgent,
        })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle()

    if (claimErr || !claimed) {
        // Someone else finalized first; drop the artifacts we just wrote.
        await admin.storage.from(NDA_BUCKET).remove([finalPath, sigPath]).catch(() => { })
        return { ok: false, error: "already_finalized" }
    }

    // Confirmation with the finalized copy attached.
    try {
        const recipients = Array.isArray(row.recipients)
            ? (row.recipients as Array<{ email?: string }>).map((r) => r.email).filter((e): e is string => !!e)
            : []
        const to = Array.from(new Set([...recipients, ...(row.visitor_email ? [row.visitor_email] : [])]))
        if (to.length > 0) {
            const companyName = (await getSmtpCompanyName()) || "Talus Ag"
            const body = `
        <p style="margin:0 0 16px;">The <strong>${escapeHtml(row.nda_title || "Non-Disclosure Agreement")}</strong> with <strong>${escapeHtml(row.visitor_name)}</strong>${row.visitor_company ? ` (${escapeHtml(row.visitor_company)})` : ""} has been countersigned by ${escapeHtml(signerName)} and is now fully executed.</p>
        ${sharepointUrl ? `<p style="margin:0 0 16px;">A copy has been archived to SharePoint: <a href="${sharepointUrl}">view document</a>.</p>` : ""}
        <p style="margin:0;">The finalized agreement is attached for your records.</p>
      `
            await sendEmail({
                to,
                subject: `Fully executed: ${row.visitor_name}${row.visitor_company ? ` (${row.visitor_company})` : ""} NDA`,
                html: renderEmailShell({ companyName, heading: "NDA fully executed", accent: "#059669", bodyHtml: body }),
                text: `The NDA with ${row.visitor_name} has been countersigned by ${signerName} and is fully executed.`,
                attachments: [{ filename: `NDA-${slug(row.visitor_name)}-v${row.nda_version ?? 1}-executed.pdf`, content: finalPdf, contentType: "application/pdf" }],
            })
        }
    } catch (error) {
        console.log("[v0] countersign confirmation email failed:", error instanceof Error ? error.message : error)
    }

    return { ok: true, sharepointUrl, sharepointError }
}
