import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireAdminApiUser } from "@/lib/admin-auth"
import { asRequiredUuid } from "@/lib/kiosk-input"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { inviteCooldownActive, type LoadedBooking } from "@/lib/booking-invite"
import { deliverBookingInvite, markInviteResult } from "@/lib/booking-invite-send"
import { resolveAppOrigin } from "@/lib/nda"

const BOOKING_SELECT =
  "id, status, visitor_email, visitor_first_name, visitor_last_name, visitor_company, visitor_type_id, location_id, host_id, visitor_id, expected_arrival, preferred_language, invite_mode, invite_lead_minutes, invite_send_at, invite_status, invite_sent_at, invite_count, invite_error, host:hosts(name), visitor_type:visitor_types(id, name, requires_training, training_title, training_video_url), location:locations(id, name, timezone)"

export async function POST(request: Request) {
  const auth = await requireAdminApiUser()
  if (!auth.ok) return auth.response

  const limited = rateLimit(`training-link-send:${auth.user.userId}:${clientIp(request)}`, 20, 60 * 60 * 1000)
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many emails sent. Try again later." }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
  const bookingId = asRequiredUuid((body as Record<string, unknown>).bookingId)
  if (!bookingId) return NextResponse.json({ error: "Booking id is required." }, { status: 400 })

  const cooldown = rateLimit(`booking-invite:${bookingId}`, 1, 5 * 60 * 1000)
  if (!cooldown.allowed) {
    return NextResponse.json({ error: "Wait 5 minutes before sending this invite again." }, { status: 429 })
  }

  const admin = getAdminClient()
  const { data: booking } = await admin.from("bookings").select(BOOKING_SELECT).eq("id", bookingId).maybeSingle()
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 })
  if (!booking.visitor_email) {
    return NextResponse.json({ error: "Visitor email is required." }, { status: 400 })
  }
  if (inviteCooldownActive(booking.invite_sent_at)) {
    return NextResponse.json({ error: "Wait 5 minutes before sending this invite again." }, { status: 429 })
  }

  const sent = await deliverBookingInvite({
    admin,
    booking: booking as LoadedBooking,
    origin: resolveAppOrigin(request),
    actorUserId: auth.user.userId,
  })
  await markInviteResult(admin, booking as LoadedBooking, sent, auth.user.userId, new Date(), "admin")

  const { data: updated } = await admin.from("bookings").select(BOOKING_SELECT).eq("id", bookingId).maybeSingle()
  return NextResponse.json({
    success: true,
    sent: sent.sent,
    reason: sent.error,
    booking: updated,
  })
}
