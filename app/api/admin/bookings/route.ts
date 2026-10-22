import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireAdminApiUser } from "@/lib/admin-auth"
import {
  asOptionalUuid,
  asRequiredEmail,
  asRequiredUuid,
  asTrimmedString,
} from "@/lib/kiosk-input"
import {
  DEFAULT_INVITE_LEAD_MINUTES,
  parseInviteMode,
  parseLeadMinutes,
  parsePreferredLanguage,
  resolveInvitePlan,
  type LoadedBooking,
} from "@/lib/booking-invite"
import { deliverBookingInvite, markInviteResult } from "@/lib/booking-invite-send"
import { localDatetimeToUtc } from "@/lib/timezone"
import { resolveAppOrigin } from "@/lib/nda"

const BOOKING_SELECT =
  "id, status, visitor_email, visitor_first_name, visitor_last_name, visitor_company, visitor_type_id, location_id, host_id, visitor_id, expected_arrival, purpose, preferred_language, invite_mode, invite_lead_minutes, invite_send_at, invite_status, invite_sent_at, invite_count, invite_error, created_at, updated_at, host:hosts(name), visitor_type:visitor_types(id, name, requires_training, training_title, training_video_url, badge_color), location:locations(id, name, timezone)"

export async function POST(request: Request) {
  const auth = await requireAdminApiUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  const parsed = parseBookingFields(raw, { emailRequired: true })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const admin = getAdminClient()
  const { data: location } = await admin
    .from("locations")
    .select("id, name, timezone")
    .eq("id", parsed.fields.locationId)
    .maybeSingle()
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 })

  const arrival = localDatetimeToUtc(parsed.fields.expectedArrival, location.timezone || "UTC")
  if (!arrival) {
    return NextResponse.json({ error: "Expected arrival must be a local date and time." }, { status: 400 })
  }

  const { data: host } = await admin.from("hosts").select("id, name").eq("id", parsed.fields.hostId).maybeSingle()
  if (!host) return NextResponse.json({ error: "Host not found." }, { status: 404 })

  if (parsed.fields.visitorTypeId) {
    const { data: visitorType } = await admin
      .from("visitor_types")
      .select("id")
      .eq("id", parsed.fields.visitorTypeId)
      .maybeSingle()
    if (!visitorType) return NextResponse.json({ error: "Visitor type not found." }, { status: 404 })
  }

  const plan = resolveInvitePlan({
    mode: parsed.fields.inviteMode,
    expectedArrival: arrival,
    leadMinutes: parsed.fields.inviteLeadMinutes,
  })

  const insert = {
    visitor_first_name: parsed.fields.firstName,
    visitor_last_name: parsed.fields.lastName,
    visitor_email: parsed.fields.email,
    visitor_company: parsed.fields.company,
    host_id: parsed.fields.hostId,
    visitor_type_id: parsed.fields.visitorTypeId,
    expected_arrival: arrival.toISOString(),
    purpose: parsed.fields.purpose,
    location_id: parsed.fields.locationId,
    created_by: auth.user.userId,
    preferred_language: parsed.fields.preferredLanguage,
    invite_mode: plan.mode,
    invite_lead_minutes: plan.leadMinutes,
    invite_send_at: plan.sendAt,
    invite_status: plan.sendNow ? "sending" : plan.status,
    invite_count: 0,
    invite_error: null,
  }

  const { data: created, error } = await admin.from("bookings").insert(insert).select(BOOKING_SELECT).single()
  if (error || !created) {
    return NextResponse.json({ error: error?.message || "Could not create the booking." }, { status: 500 })
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.userId,
    action: "booking.created",
    entity_type: "booking",
    entity_id: created.id,
    description: `Booking created for ${parsed.fields.firstName} ${parsed.fields.lastName}`,
    metadata: {
      visitor_email: parsed.fields.email,
      host_id: parsed.fields.hostId,
      location_id: parsed.fields.locationId,
      invite_mode: plan.mode,
    },
  })

  let booking = created as LoadedBooking
  if (plan.sendNow) {
    const origin = resolveAppOrigin(request)
    const sent = await deliverBookingInvite({
      admin,
      booking,
      origin,
      actorUserId: auth.user.userId,
    })
    await markInviteResult(admin, booking, sent, auth.user.userId, new Date(), "admin")
    const { data: reloaded } = await admin.from("bookings").select(BOOKING_SELECT).eq("id", created.id).maybeSingle()
    if (reloaded) booking = reloaded as LoadedBooking
  }

  return NextResponse.json({ success: true, booking })
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApiUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  const id = asRequiredUuid(raw.id)
  if (!id) return NextResponse.json({ error: "Booking id is required." }, { status: 400 })

  const admin = getAdminClient()
  const { data: existing } = await admin.from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 })

  const status = raw.status === "completed" || raw.status === "cancelled" || raw.status === "pending" || raw.status === "checked_in"
    ? raw.status
    : undefined

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (status) {
    updates.status = status
    if ((status === "cancelled" || status === "completed") && existing.invite_status === "scheduled") {
      updates.invite_status = "none"
    }
  }

  const hasFieldUpdates = [
    "firstName",
    "lastName",
    "email",
    "company",
    "hostId",
    "visitorTypeId",
    "locationId",
    "expectedArrival",
    "purpose",
    "preferredLanguage",
    "inviteMode",
    "inviteLeadMinutes",
  ].some((key) => raw[key] !== undefined)

  if (hasFieldUpdates) {
    const parsed = parseBookingFields(raw, { emailRequired: raw.email !== undefined, partial: true })
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const fields = parsed.fields
    if (fields.firstName) updates.visitor_first_name = fields.firstName
    if (fields.lastName) updates.visitor_last_name = fields.lastName
    if (fields.email) updates.visitor_email = fields.email
    if (raw.company !== undefined) updates.visitor_company = fields.company
    if (fields.hostId) updates.host_id = fields.hostId
    if (raw.visitorTypeId !== undefined) updates.visitor_type_id = fields.visitorTypeId
    if (fields.locationId) updates.location_id = fields.locationId
    if (raw.purpose !== undefined) updates.purpose = fields.purpose
    if (raw.preferredLanguage !== undefined) updates.preferred_language = fields.preferredLanguage

    const locationId = (fields.locationId || existing.location_id) as string
    const { data: location } = await admin.from("locations").select("id, timezone").eq("id", locationId).maybeSingle()
    const timezone = location?.timezone || "UTC"
    let arrival = existing.expected_arrival ? new Date(existing.expected_arrival) : new Date()
    if (fields.expectedArrival) {
      const converted = localDatetimeToUtc(fields.expectedArrival, timezone)
      if (!converted) {
        return NextResponse.json({ error: "Expected arrival must be a local date and time." }, { status: 400 })
      }
      arrival = converted
      updates.expected_arrival = arrival.toISOString()
    }

    if (raw.inviteMode !== undefined || raw.inviteLeadMinutes !== undefined || fields.expectedArrival) {
      const mode = fields.inviteMode || parseInviteMode(existing.invite_mode) || "manual"
      const lead = fields.inviteLeadMinutes || existing.invite_lead_minutes || DEFAULT_INVITE_LEAD_MINUTES
      const plan = resolveInvitePlan({ mode, expectedArrival: arrival, leadMinutes: lead })
      updates.invite_mode = plan.mode
      updates.invite_lead_minutes = plan.leadMinutes
      updates.invite_send_at = plan.sendAt
      updates.invite_status = plan.sendNow ? "sending" : plan.status
      if (plan.sendNow) {
        const { error } = await admin.from("bookings").update(updates).eq("id", id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        const { data: reloaded } = await admin.from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle()
        const sent = await deliverBookingInvite({
          admin,
          booking: (reloaded || existing) as LoadedBooking,
          origin: resolveAppOrigin(request),
          actorUserId: auth.user.userId,
        })
        await markInviteResult(admin, (reloaded || existing) as LoadedBooking, sent, auth.user.userId, new Date(), "admin")
        await admin.from("audit_logs").insert({
          user_id: auth.user.userId,
          action: "booking.updated",
          entity_type: "booking",
          entity_id: id,
          description: `Booking updated for ${existing.visitor_first_name} ${existing.visitor_last_name}`,
          metadata: { invite_mode: plan.mode },
        })
        const { data: after } = await admin.from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle()
        return NextResponse.json({ success: true, booking: after })
      }
    }
  }

  const { error } = await admin.from("bookings").update(updates).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const action =
    status === "completed" ? "booking.checked_in" : status === "cancelled" ? "booking.cancelled" : "booking.updated"
  await admin.from("audit_logs").insert({
    user_id: auth.user.userId,
    action,
    entity_type: "booking",
    entity_id: id,
    description: status ? `Booking ${status}` : `Booking updated for ${existing.visitor_first_name} ${existing.visitor_last_name}`,
    metadata: { status: status || existing.status },
  })

  const { data: booking } = await admin.from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle()
  return NextResponse.json({ success: true, booking })
}

function parseBookingFields(
  raw: Record<string, unknown>,
  opts: { emailRequired: boolean; partial?: boolean },
):
  | {
      ok: true
      fields: {
        firstName: string | null
        lastName: string | null
        email: string | null
        company: string | null
        hostId: string | null
        visitorTypeId: string | null
        locationId: string | null
        expectedArrival: string
        purpose: string | null
        preferredLanguage: "en" | "es"
        inviteMode: "now" | "scheduled" | "manual"
        inviteLeadMinutes: number
      }
    }
  | { ok: false; error: string } {
  const firstName = asTrimmedString(raw.firstName, 80)
  const lastName = asTrimmedString(raw.lastName, 80)
  const email = asRequiredEmail(raw.email)
  const company = typeof raw.company === "string" ? raw.company.trim() || null : null
  const hostId = asRequiredUuid(raw.hostId)
  const visitorTypeId = raw.visitorTypeId === undefined || raw.visitorTypeId === "" || raw.visitorTypeId === null
    ? null
    : asRequiredUuid(raw.visitorTypeId)
  const locationId = asRequiredUuid(raw.locationId)
  const expectedArrival = typeof raw.expectedArrival === "string" ? raw.expectedArrival.trim() : ""
  const purpose = typeof raw.purpose === "string" ? raw.purpose.trim() || null : null
  const preferredLanguage = parsePreferredLanguage(raw.preferredLanguage)
  const inviteMode = raw.inviteMode === undefined ? "scheduled" : parseInviteMode(raw.inviteMode)
  const inviteLeadMinutes =
    raw.inviteLeadMinutes === undefined ? DEFAULT_INVITE_LEAD_MINUTES : parseLeadMinutes(raw.inviteLeadMinutes)

  if (!opts.partial) {
    if (!firstName || !lastName) return { ok: false, error: "First and last name are required." }
    if (!email) return { ok: false, error: "Visitor email is required." }
    if (!hostId) return { ok: false, error: "Please select a host for the booking." }
    if (!locationId) return { ok: false, error: "Please select a location for the booking." }
    if (!expectedArrival) return { ok: false, error: "Expected arrival is required." }
    if (raw.visitorTypeId !== undefined && raw.visitorTypeId !== "" && raw.visitorTypeId !== null && !visitorTypeId) {
      return { ok: false, error: "Invalid visitor type." }
    }
  } else {
    if (raw.email !== undefined && !email) return { ok: false, error: "Visitor email is required." }
    if (raw.hostId !== undefined && !hostId) return { ok: false, error: "Please select a host for the booking." }
    if (raw.locationId !== undefined && !locationId) return { ok: false, error: "Please select a location for the booking." }
    if (asOptionalUuid(raw.hostId) === undefined) return { ok: false, error: "Invalid host." }
    if (asOptionalUuid(raw.visitorTypeId) === undefined) return { ok: false, error: "Invalid visitor type." }
  }

  if (inviteMode === null) return { ok: false, error: "Invite mode must be now, scheduled, or manual." }
  if (inviteLeadMinutes === null) return { ok: false, error: "Invite lead time is invalid." }

  return {
    ok: true,
    fields: {
      firstName,
      lastName,
      email,
      company,
      hostId,
      visitorTypeId,
      locationId,
      expectedArrival,
      purpose,
      preferredLanguage,
      inviteMode,
      inviteLeadMinutes,
    },
  }
}
