import { type NextRequest, NextResponse } from "next/server"
import { finalizeCountersignature, getCountersignByToken } from "@/lib/nda"

/**
 * Public, token-gated endpoints for the executive countersigning screen.
 *
 * The token in the URL is the only credential; there is no session here, so the
 * token itself is treated as the secret and every response is scoped to exactly
 * that one request row.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const context = await getCountersignByToken(token)
    if (!context) return NextResponse.json({ error: "This countersigning link is not valid." }, { status: 404 })
    return NextResponse.json(context)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params

    let body: { signerName?: string; signerTitle?: string; signatureDataUrl?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    if (!body.signerName?.trim()) {
        return NextResponse.json({ error: "Please enter your name." }, { status: 400 })
    }
    if (!body.signatureDataUrl) {
        return NextResponse.json({ error: "Please add your signature." }, { status: 400 })
    }

    const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null
    const userAgent = request.headers.get("user-agent")

    const result = await finalizeCountersignature({
        token,
        signerName: body.signerName,
        signerTitle: body.signerTitle ?? null,
        signatureDataUrl: body.signatureDataUrl,
        ip,
        userAgent,
    })

    if (!result.ok) {
        const status =
            result.error === "not_found"
                ? 404
                : result.error === "already_finalized" || result.error === "expired"
                    ? 409
                    : 400
        const message = countersignErrorMessage(result.error)
        return NextResponse.json({ error: message, code: result.error }, { status })
    }

    return NextResponse.json({ success: true, sharepointUrl: result.sharepointUrl ?? null })
}

function countersignErrorMessage(code?: string): string {
    switch (code) {
        case "not_found":
            return "This countersigning link is not valid."
        case "already_finalized":
            return "This NDA has already been countersigned."
        case "expired":
            return "This countersigning link has expired."
        case "name_required":
            return "Please enter your name."
        case "invalid_signature":
            return "Your signature could not be read. Please try again."
        case "signature_too_large":
            return "The signature image is too large."
        case "source_missing":
        case "source_unavailable":
            return "The signed document could not be loaded. Please contact an administrator."
        default:
            return "The countersignature could not be completed. Please try again."
    }
}
