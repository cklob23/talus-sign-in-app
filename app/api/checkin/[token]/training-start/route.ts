import { NextResponse, type NextRequest } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { resolveCheckinToken } from "@/lib/checkin-token"
import { findActiveHost } from "@/lib/active-hosts"
import { parseIdempotencyKey } from "@/lib/idempotency"
import { scheduleHostNotification } from "@/lib/host-notify-once"
import { issueTrainingTicket, qrTrainingScope } from "@/lib/training-gate"

/**
 * Called when a QR visitor reaches the training video.
 *
 * Returns a signed training ticket that the final sign-in must hand back, so
 * the server can tell how long the visitor has been on the training step.
 * When `notifyHost` is set it also tells the host the visitor has started
 * training (the same email the old notify-training route sent).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params

    const resolved = await resolveCheckinToken(token)
    if (!resolved.ok) {
        return NextResponse.json({ error: resolved.reason }, { status: resolved.status })
    }
    const { location } = resolved

    let body: {
        visitorTypeId?: string
        hostId?: string | null
        firstName?: string
        lastName?: string
        company?: string
        idempotencyKey?: string
        notifyHost?: boolean
    }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const visitorTypeId = typeof body.visitorTypeId === "string" ? body.visitorTypeId.trim() : ""
    if (!visitorTypeId) {
        return NextResponse.json({ error: "Missing visitor type" }, { status: 400 })
    }

    const idempotencyKey = parseIdempotencyKey(body.idempotencyKey)
    if (idempotencyKey === undefined) {
        return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data: visitorType } = await admin
        .from("visitor_types")
        .select("id, name, requires_training")
        .eq("id", visitorTypeId)
        .maybeSingle()
    if (!visitorType?.requires_training) {
        return NextResponse.json({ error: "Training is not required for this visitor type" }, { status: 400 })
    }

    let ticket: string
    try {
        ticket = issueTrainingTicket({ visitorTypeId: visitorType.id, scope: qrTrainingScope(location.id) })
    } catch (error) {
        console.error("[QR training] ticket unavailable:", error instanceof Error ? error.message : error)
        return NextResponse.json(
            { error: "Training is temporarily unavailable. Please ask reception to sign you in." },
            { status: 500 },
        )
    }

    const hostId = typeof body.hostId === "string" ? body.hostId.trim() : ""
    if (body.notifyHost === true && hostId) {
        const firstName = body.firstName?.trim()
        const lastName = body.lastName?.trim()
        const host = await findActiveHost(admin, hostId)
        // A bad host must not block training: the final sign-in re-validates it.
        if (host.ok && firstName && lastName) {
            scheduleHostNotification({
                hostId: host.host.id,
                locationId: location.id,
                locationName: location.name,
                notificationType: "completing_training",
                visitorName: `${firstName} ${lastName}`,
                visitorCompany: body.company?.trim() || null,
                visitorTypeName: visitorType.name,
                idempotencyKey,
            })
        }
    }

    return NextResponse.json({ ticket, issuedAt: new Date().toISOString() })
}
