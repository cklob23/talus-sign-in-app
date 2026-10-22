import { NextResponse, type NextRequest } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { resolveCheckinToken } from "@/lib/checkin-token"
import { findActiveHost } from "@/lib/active-hosts"
import { parseIdempotencyKey } from "@/lib/idempotency"
import { scheduleHostNotification } from "@/lib/host-notify-once"

/**
 * Notifies a host that their QR visitor has started required training.
 *
 * The kiosk sends this before the training video plays so the host knows the
 * visitor is on site but not yet ready. The QR flow needs its own endpoint
 * because no sign-in row exists until training finishes.
 *
 * Security model: the poster token is the only credential, and the host is
 * resolved server-side as any active host (P1-6). The visitor never supplies
 * an email address.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params

    const resolved = await resolveCheckinToken(token)
    if (!resolved.ok) {
        return NextResponse.json({ error: resolved.reason }, { status: resolved.status })
    }
    const { location } = resolved

    let body: {
        hostId?: string
        visitorTypeId?: string
        firstName?: string
        lastName?: string
        company?: string
        idempotencyKey?: string
    }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const hostId = body.hostId?.trim()
    const firstName = body.firstName?.trim()
    const lastName = body.lastName?.trim()
    if (!hostId || !firstName || !lastName) {
        return NextResponse.json({ error: "Missing visitor or host details" }, { status: 400 })
    }

    const idempotencyKey = parseIdempotencyKey(body.idempotencyKey)
    if (idempotencyKey === undefined) {
        return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 })
    }

    // Only notify for a type that actually requires training, so this endpoint
    // can't be used to generate arbitrary emails to a host. Visitor types are
    // global. Any active host is valid.
    const admin = getAdminClient()
    const host = await findActiveHost(admin, hostId)
    if (!host.ok) {
        return NextResponse.json({ error: host.error }, { status: host.status })
    }
    let visitorTypeName: string | null = null
    if (body.visitorTypeId) {
        const { data: visitorType } = await admin
            .from("visitor_types")
            .select("name, requires_training")
            .eq("id", body.visitorTypeId)
            .maybeSingle()

        if (!visitorType?.requires_training) {
            return NextResponse.json({ error: "Training is not required for this visitor type" }, { status: 400 })
        }
        visitorTypeName = visitorType.name
    }

    scheduleHostNotification({
        hostId,
        locationId: location.id,
        locationName: location.name,
        notificationType: "completing_training",
        visitorName: `${firstName} ${lastName}`,
        visitorCompany: body.company?.trim() || null,
        visitorTypeName,
        visitorTypeId: body.visitorTypeId?.trim() || null,
        idempotencyKey,
        entrySource: "qr",
    })

    // Queued in after() so a slow SMTP host cannot block the training step.
    return NextResponse.json({ success: true, queued: true })
}
