import { getAdminClient } from "@/lib/supabase/server"
import { processDueBookingInvites, supabaseInviteStore } from "@/lib/booking-invite"
import { deliverBookingInvite } from "@/lib/booking-invite-send"

/**
 * Resolve the public origin used in invite links. Prefer configured site URL,
 * then forwarded host headers, then the request URL.
 */
export function bookingInviteCronOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, "")
  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto")
  if (forwardedHost) return `${forwardedProto ?? "https"}://${forwardedHost}`
  try {
    return new URL(request.url).origin
  } catch {
    return ""
  }
}

export type BookingInviteCronResult = {
  ok: true
  claimed: number
  sent: number
  failed: number
  skipped: number
}

/**
 * Send due booking invites. Safe to call from both /api/cron/booking-invites
 * and /api/cron/reports: processDueBookingInvites claims scheduled rows
 * (scheduled → sending) and then marks them sent. A second hit in the same
 * window skips already-claimed or sent bookings, so the two routes do not
 * double-send.
 */
export async function runBookingInviteCron(request: Request): Promise<BookingInviteCronResult> {
  const admin = getAdminClient()
  const origin = bookingInviteCronOrigin(request)
  const result = await processDueBookingInvites({
    store: supabaseInviteStore(admin),
    send: (booking) =>
      deliverBookingInvite({
        admin,
        booking,
        origin,
        actorUserId: null,
      }),
  })
  return { ok: true, ...result }
}
