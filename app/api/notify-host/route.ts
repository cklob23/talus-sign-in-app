import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalHttpUrl, asOptionalString, asOptionalUuid } from "@/lib/kiosk-input"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { parseIdempotencyKey } from "@/lib/idempotency"
import { findActiveHost } from "@/lib/active-hosts"
import { scheduleHostNotification } from "@/lib/host-notify-once"
import type { HostNotificationType } from "@/lib/host-notify-send"

const RATE_LIMIT = 20
const RATE_WINDOW_MS = 10 * 60 * 1000

/**
 * Training-start and legacy clients can still POST here. Arrival emails are
 * triggered from the sign-in routes. The response returns as soon as the
 * send is queued; SMTP/Twilio run in after().
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const qrToken = typeof raw.qrToken === "string" ? raw.qrToken : undefined
    const auth = await requireKioskContext(request, { qrToken })
    if (!auth.ok) return auth.response

    const ip = clientIp(request)
    const limited = rateLimit(`notify-host:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)
    if (!limited.allowed) {
      return NextResponse.json({ error: "Too many notification requests" }, { status: 429 })
    }

    const hostId = asOptionalUuid(raw.hostId)
    const signInId = asOptionalUuid(raw.signInId)
    const idempotencyKey = parseIdempotencyKey(raw.idempotencyKey)
    if (hostId === undefined || signInId === undefined || idempotencyKey === undefined) {
      return NextResponse.json({ error: "Invalid host, sign-in id, or idempotency key" }, { status: 400 })
    }

    const visitorName = asOptionalString(raw.visitorName, 200)
    if (!visitorName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const visitorCompany = asOptionalString(raw.visitorCompany, 200)
    const purpose = asOptionalString(raw.purpose, 300)
    const badgeNumber = asOptionalString(raw.badgeNumber, 40)
    const locationName = asOptionalString(raw.locationName, 200)
    const locationId = asOptionalUuid(raw.locationId)
    const visitorTypeName = asOptionalString(raw.visitorTypeName, 120)
    const visitorPhotoUrl = asOptionalHttpUrl(raw.visitorPhotoUrl)
    const notificationType: HostNotificationType =
      raw.notificationType === "completing_training" ? "completing_training" : "arrived"

    if (
      visitorCompany === undefined ||
      purpose === undefined ||
      badgeNumber === undefined ||
      locationName === undefined ||
      locationId === undefined ||
      visitorTypeName === undefined ||
      visitorPhotoUrl === undefined
    ) {
      return NextResponse.json({ error: "Invalid field value" }, { status: 400 })
    }

    const admin = getAdminClient()
    let resolvedHostId = hostId
    let resolvedLocationId = locationId

    if (signInId) {
      const { data: signIn } = await admin
        .from("sign_ins")
        .select("id, host_id, location_id")
        .eq("id", signInId)
        .maybeSingle()
      if (!signIn) {
        return NextResponse.json({ error: "Sign-in not found" }, { status: 404 })
      }
      if (auth.context.source === "qr" && signIn.location_id !== auth.context.locationId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      resolvedHostId = signIn.host_id || resolvedHostId
      resolvedLocationId = signIn.location_id || resolvedLocationId
    }

    if (!resolvedHostId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const host = await findActiveHost(admin, resolvedHostId)
    if (!host.ok) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 })
    }

    if (auth.context.source === "qr") {
      resolvedLocationId = auth.context.locationId
    }

    const hostLimit = rateLimit(`notify-host-target:${resolvedHostId}`, 10, RATE_WINDOW_MS)
    if (!hostLimit.allowed) {
      return NextResponse.json({ error: "Too many notification requests" }, { status: 429 })
    }

    scheduleHostNotification({
      hostId: resolvedHostId,
      locationId: resolvedLocationId || "",
      locationName,
      notificationType,
      visitorName,
      visitorCompany,
      visitorTypeName,
      badgeNumber,
      visitorPhotoUrl,
      purpose,
      signInId,
      idempotencyKey,
    })

    return NextResponse.json({
      success: true,
      queued: true,
      message: "Host notification queued",
    })
  } catch (error) {
    console.error("[Notify Host] Error queueing notification:", error)
    return NextResponse.json({ error: "Failed to send notification email" }, { status: 500 })
  }
}
