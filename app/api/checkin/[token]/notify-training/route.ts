import { NextResponse, type NextRequest } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { resolveCheckinToken } from "@/lib/checkin-token"
import { sendHostNotification } from "@/lib/host-notification"

/**
 * Notifies a host that their QR visitor has started required training.
 *
 * The kiosk sends this before the training video plays so the host knows the
 * visitor is on site but not yet ready. The QR flow needs its own endpoint
 * because no sign-in row exists until training finishes.
 *
 * Security model: the poster token is the only credential, and the host is
 * resolved server-side and must belong to the token's location. The visitor
 * never supplies an email address.
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

    // Only notify for a type that actually requires training, so this endpoint
    // can't be used to generate arbitrary emails to a host. Visitor types are
    // global, so the type is not scoped to the location; the host still is.
    const admin = getAdminClient()
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

    const result = await sendHostNotification({
        hostId,
        locationId: location.id,
        locationName: location.name,
        notificationType: "completing_training",
        visitorName: `${firstName} ${lastName}`,
        visitorCompany: body.company?.trim() || null,
        visitorTypeName,
    })

    // Reported for observability only. The visitor must be able to continue into
    // training even when the host cannot be reached.
    return NextResponse.json({ success: true, notified: result.sent, reason: result.reason ?? null })
}
