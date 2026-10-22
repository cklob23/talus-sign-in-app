import {
  type LoadedBooking,
  parsePreferredLanguage,
  trainingLinkTtlMs,
  unwrapOne,
} from "@/lib/booking-invite"
import { sendBookingInviteEmail, type BookingInviteTraining } from "@/lib/booking-mail"
import { formatTrainingMonthYear, getTrainingClearance } from "@/lib/training-clearance"
import { createTrainingLink } from "@/lib/training-link-send"
import { getBrandingSettings } from "@/lib/branding"
import { DEFAULT_DISPLAY_TIMEZONE } from "@/lib/timezone"

type AnyClient = {
  from: (table: string) => any
}

export async function deliverBookingInvite(args: {
  admin: AnyClient
  booking: LoadedBooking
  origin: string
  actorUserId?: string | null
  now?: Date
}): Promise<{ sent: boolean; error?: string; watchUrl?: string | null }> {
  const email = (args.booking.visitor_email || "").trim().toLowerCase()
  if (!email) return { sent: false, error: "Visitor email is required." }

  const location = unwrapOne(args.booking.location)
  const host = unwrapOne(args.booking.host)
  const visitorType = unwrapOne(args.booking.visitor_type)
  const timezone = location?.timezone || DEFAULT_DISPLAY_TIMEZONE
  const lang = parsePreferredLanguage(args.booking.preferred_language)
  const now = args.now ?? new Date()
  const firstName = args.booking.visitor_first_name || "Visitor"
  const lastName = args.booking.visitor_last_name || "Guest"

  let training: BookingInviteTraining = { kind: "none" }
  let watchUrl: string | null = null

  const needsTraining = Boolean(visitorType?.requires_training && visitorType.training_video_url && args.booking.visitor_type_id)
  if (needsTraining && args.booking.visitor_type_id) {
    const clearance = await getTrainingClearance(args.admin, email, args.booking.visitor_type_id, now.getTime())
    if (clearance.cleared) {
      training = {
        kind: "cleared",
        until: clearance.expiresAt ? formatTrainingMonthYear(clearance.expiresAt, lang) : "",
      }
    } else {
      const ttlMs = trainingLinkTtlMs({
        expectedArrival: args.booking.expected_arrival || now,
        timezone,
        now: now.getTime(),
      })
      const created = await createTrainingLink({
        admin: args.admin,
        email,
        firstName,
        lastName,
        company: args.booking.visitor_company,
        visitorTypeId: args.booking.visitor_type_id,
        locationId: args.booking.location_id || location?.id || "",
        bookingId: args.booking.id,
        hostId: args.booking.host_id,
        createdBy: args.actorUserId || null,
        ttlMs,
        now: now.getTime(),
        origin: args.origin,
        lang,
      })
      watchUrl = created.watchUrl
      training = {
        kind: "link",
        watchUrl: created.watchUrl,
        videoTitle: visitorType?.training_title || "Site Safety Orientation",
      }
    }
  }

  const branding = await getBrandingSettings()
  const result = await sendBookingInviteEmail({
    to: email,
    lang,
    visitorFirstName: firstName,
    hostName: host?.name || (lang === "es" ? "su anfitrion" : "your host"),
    siteName: location?.name || (lang === "es" ? "el sitio" : "the site"),
    expectedArrival: args.booking.expected_arrival || now.toISOString(),
    timezone,
    training,
    logoUrl: branding.companyLogo || `${args.origin.replace(/\/+$/, "")}/talusAg_Logo.png`,
    appOrigin: args.origin,
  })

  if (!result.sent) {
    return { sent: false, error: result.reason || "send_failed", watchUrl }
  }
  return { sent: true, watchUrl }
}

export async function markInviteResult(
  admin: AnyClient,
  booking: LoadedBooking,
  result: { sent: boolean; error?: string },
  actorUserId: string | null,
  now = new Date(),
  source: "admin" | "cron" = "admin",
): Promise<void> {
  if (result.sent) {
    await admin
      .from("bookings")
      .update({
        invite_status: "sent",
        invite_sent_at: now.toISOString(),
        invite_count: (booking.invite_count ?? 0) + 1,
        invite_error: null,
        updated_at: now.toISOString(),
      })
      .eq("id", booking.id)
    await admin.from("audit_logs").insert({
      user_id: actorUserId,
      action: "booking.invite_sent",
      entity_type: "booking",
      entity_id: booking.id,
      description: `Booking invite sent to ${booking.visitor_email || "visitor"}`,
      metadata: { source, email: booking.visitor_email },
    })
    return
  }

  await admin
    .from("bookings")
    .update({
      invite_status: "failed",
      invite_error: (result.error || "send_failed").slice(0, 500),
      updated_at: now.toISOString(),
    })
    .eq("id", booking.id)
  await admin.from("audit_logs").insert({
    user_id: actorUserId,
    action: "booking.invite_failed",
    entity_type: "booking",
    entity_id: booking.id,
    description: `Booking invite failed for ${booking.visitor_email || "visitor"}`,
    metadata: { source, email: booking.visitor_email, error: result.error || "send_failed" },
  })
}
