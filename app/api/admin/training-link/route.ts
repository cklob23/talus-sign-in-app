import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireAdminApiUser } from "@/lib/admin-auth"
import { asOptionalUuid, asRequiredEmail, asRequiredUuid, asTrimmedString } from "@/lib/kiosk-input"
import { issueTrainingLinkToken } from "@/lib/visit-token"
import { sendTrainingLinkEmail } from "@/lib/training-mail"
import { resolveAppOrigin } from "@/lib/nda"
import { getBrandingSettings } from "@/lib/branding"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { normalizeVisitorEmail } from "@/lib/training-clearance"

export async function POST(request: Request) {
  const auth = await requireAdminApiUser()
  if (!auth.ok) return auth.response

  const limited = rateLimit(`training-link-send:${auth.user.userId}:${clientIp(request)}`, 20, 60 * 60 * 1000)
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many training links sent. Try again later." }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  const bookingId = asOptionalUuid(raw.bookingId)
  const lang = raw.lang === "es" ? "es" : "en"

  const admin = getAdminClient()
  let email = asRequiredEmail(raw.email)
  let firstName = asTrimmedString(raw.firstName, 80)
  let lastName = asTrimmedString(raw.lastName, 80)
  let company = typeof raw.company === "string" ? raw.company.trim() : ""
  let visitorTypeId = asRequiredUuid(raw.visitorTypeId)
  let locationId = asRequiredUuid(raw.locationId)
  let hostId = asOptionalUuid(raw.hostId)
  let hostName = typeof raw.hostName === "string" ? raw.hostName.trim() : ""

  if (bookingId === undefined || hostId === undefined) {
    return NextResponse.json({ error: "Invalid booking or host." }, { status: 400 })
  }

  if (bookingId) {
    const { data: booking } = await admin
      .from("bookings")
      .select(
        "id, visitor_email, visitor_first_name, visitor_last_name, visitor_company, visitor_type_id, location_id, host_id, host:hosts(name)",
      )
      .eq("id", bookingId)
      .maybeSingle()
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 })
    email = normalizeVisitorEmail(booking.visitor_email) || email
    firstName = booking.visitor_first_name || firstName
    lastName = booking.visitor_last_name || lastName
    company = booking.visitor_company || company
    visitorTypeId = booking.visitor_type_id || visitorTypeId
    locationId = booking.location_id || locationId
    hostId = booking.host_id || hostId
    const host = Array.isArray(booking.host) ? booking.host[0] : booking.host
    hostName = host?.name || hostName
  }

  if (!email || !firstName || !lastName || !visitorTypeId || !locationId) {
    return NextResponse.json({ error: "Email, name, visitor type, and site are required." }, { status: 400 })
  }

  const [{ data: visitorType }, { data: location }, branding] = await Promise.all([
    admin
      .from("visitor_types")
      .select("id, name, requires_training, training_title, training_video_url")
      .eq("id", visitorTypeId)
      .maybeSingle(),
    admin.from("locations").select("id, name").eq("id", locationId).maybeSingle(),
    getBrandingSettings(),
  ])

  if (!visitorType?.requires_training || !visitorType.training_video_url) {
    return NextResponse.json({ error: "That visitor type has no safety video." }, { status: 400 })
  }
  if (!location) {
    return NextResponse.json({ error: "Location not found." }, { status: 404 })
  }

  if (hostId && !hostName) {
    const { data: host } = await admin.from("hosts").select("name").eq("id", hostId).maybeSingle()
    hostName = host?.name || ""
  }

  const token = issueTrainingLinkToken({
    payload: {
      email,
      firstName,
      lastName,
      visitorTypeId,
      locationId,
      bookingId,
      hostId,
    },
  })
  const origin = resolveAppOrigin(request)
  const watchUrl = `${origin}/t/${encodeURIComponent(token)}${lang === "es" ? "?lang=es" : ""}`

  const sent = await sendTrainingLinkEmail({
    to: email,
    lang,
    visitorFirstName: firstName,
    hostName: hostName || "your host",
    companyName: branding.companyName,
    siteName: location.name,
    videoTitle: visitorType.training_title || "Site Safety Orientation",
    watchUrl,
    appOrigin: origin,
    logoUrl: branding.companyLogo || `${origin}/talusAg_Logo.png`,
  })

  await admin.from("training_link_sends").insert({
    visitor_email: email,
    visitor_first_name: firstName,
    visitor_last_name: lastName,
    visitor_company: company || null,
    visitor_type_id: visitorTypeId,
    location_id: locationId,
    booking_id: bookingId,
    host_id: hostId,
    created_by: auth.user.userId,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  })

  await admin.from("audit_logs").insert({
    user_id: auth.user.userId,
    action: "visitor.training_link_sent",
    entity_type: "visitor",
    entity_id: bookingId,
    description: `Training link sent to ${email}`,
    metadata: { email, visitor_type_id: visitorTypeId, location_id: locationId, booking_id: bookingId },
  })

  return NextResponse.json({
    success: true,
    sent: sent.sent,
    reason: sent.reason,
    watchUrl,
  })
}
