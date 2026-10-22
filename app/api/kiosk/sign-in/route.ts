import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import {
  asOptionalEmail,
  asOptionalHttpUrl,
  asOptionalString,
  asOptionalUuid,
  asRequiredUuid,
  asTrimmedString,
} from "@/lib/kiosk-input"
import { findActiveHost } from "@/lib/active-hosts"
import { createSignInIdempotent, parseIdempotencyKey } from "@/lib/idempotency"
import { supabaseSignInStore } from "@/lib/sign-in-store"
import { scheduleHostNotification } from "@/lib/host-notify-once"
import { hasValidTrainingForEmail, hasValidTrainingForVisitor } from "@/lib/training-completions"
import { enforceServerGeofence, loadLocationFence } from "@/lib/geofence-enforce"

export async function POST(request: Request) {
  try {
    const auth = await requireKioskContext(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const visitor_id = asRequiredUuid(raw.visitor_id)
    const location_id = asRequiredUuid(raw.location_id)
    const host_id = asOptionalUuid(raw.host_id)
    const visitor_type_id = asOptionalUuid(raw.visitor_type_id)
    const booking_id = asOptionalUuid(raw.booking_id)
    const badge_number = asOptionalString(raw.badge_number, 20)
    const photo_url = asOptionalHttpUrl(raw.photo_url)
    const timezone = asOptionalString(raw.timezone, 64)
    const visitor_name = asTrimmedString(raw.visitor_name, 200)
    const visitor_email = asOptionalEmail(raw.visitor_email)
    const visitor_company = asOptionalString(raw.visitor_company, 200)
    const purpose = asOptionalString(raw.purpose, 300)
    const visitor_type_name = asOptionalString(raw.visitor_type_name, 120)
    const idempotency_key = parseIdempotencyKey(raw.idempotency_key)
    const photo_missing = raw.photo_missing === true

    if (!visitor_id || !location_id) {
      return NextResponse.json(
        { error: "Missing required fields: visitor_id and location_id" },
        { status: 400 },
      )
    }
    if (
      host_id === undefined ||
      visitor_type_id === undefined ||
      booking_id === undefined ||
      badge_number === undefined ||
      photo_url === undefined ||
      timezone === undefined ||
      visitor_email === undefined ||
      idempotency_key === undefined
    ) {
      return NextResponse.json({ error: "Invalid field value" }, { status: 400 })
    }

    if (auth.context.source === "qr" && auth.context.locationId !== location_id) {
      return NextResponse.json({ error: "Location does not match check-in token" }, { status: 403 })
    }

    const location = await loadLocationFence(location_id)
    if (!location) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 })
    }

    const staffOverride = raw.staff_override === true && auth.context.source === "receptionist"
    const geofence = await enforceServerGeofence({
      location,
      globallyRequired: true,
      rawCoords: raw.coords,
      request,
      source: "kiosk",
      scopeId: location_id,
      staffOverride,
      actorUserId: auth.context.source === "receptionist" ? auth.context.session.id : null,
    })
    if (geofence.blocked) return geofence.blocked

    const adminClient = getAdminClient()

    if (host_id) {
      const host = await findActiveHost(adminClient, host_id)
      if (!host.ok) {
        return NextResponse.json({ error: host.error }, { status: host.status })
      }
    }

    // A visitor type that requires training can only be signed in once a valid
    // completion exists. /api/kiosk/training only records one after checking
    // the video ticket and acknowledgement, so this closes the "sign in while
    // the video is still playing" gap from the server side too.
    if (visitor_type_id) {
      const { data: visitorType } = await adminClient
        .from("visitor_types")
        .select("id, requires_training")
        .eq("id", visitor_type_id)
        .maybeSingle()
      if (visitorType?.requires_training) {
        const trained =
          (await hasValidTrainingForVisitor(adminClient, visitor_id, visitor_type_id)) ||
          (await hasValidTrainingForEmail(adminClient, visitor_email, visitor_type_id))
        if (!trained) {
          return NextResponse.json(
            {
              error: "Please complete the safety training before signing in.",
              code: "training_required",
            },
            { status: 409 },
          )
        }
      }
    }

    const created = await createSignInIdempotent(supabaseSignInStore(adminClient), {
      visitor_id,
      location_id,
      host_id: host_id || null,
      badge_number: badge_number || null,
      photo_url: photo_url || null,
      visitor_type_id: visitor_type_id || null,
      timezone: timezone || "UTC",
      idempotency_key: idempotency_key || null,
    })

    if (!created.ok) {
      console.error("[API] Sign-in insert error:", created.error)
      return NextResponse.json({ error: "Failed to create sign-in" }, { status: 500 })
    }

    const signInRecord = created.signIn

    if (!created.replayed && booking_id) {
      await adminClient
        .from("bookings")
        .update({ status: "checked_in" })
        .eq("id", booking_id)
    }

    if (!created.replayed) {
      const visitorLabel = visitor_name
        ? visitor_email
          ? `${visitor_name} (${visitor_email})`
          : visitor_name
        : "Unknown visitor"
      await adminClient.from("audit_logs").insert({
        user_id: auth.context.source === "receptionist" ? auth.context.session.id : null,
        action: "visitor.sign_in",
        entity_type: "visitor",
        entity_id: visitor_id,
        description: `Visitor signed in: ${visitorLabel}`,
        metadata: {
          visitor_id,
          visitor_name,
          visitor_email,
          sign_in_id: signInRecord.id,
          location_id,
          badge_number,
          host_id,
          visitor_type_id,
          booking_id,
          idempotency_key,
          photo_missing: photo_missing && !photo_url,
        },
      })
      if (photo_missing && !photo_url) {
        await adminClient.from("audit_logs").insert({
          user_id: auth.context.source === "receptionist" ? auth.context.session.id : null,
          action: "visitor.photo_missing",
          entity_type: "visitor",
          entity_id: visitor_id,
          description: visitor_name
            ? `Visitor signed in at kiosk without a photo: ${visitor_name}`
            : "Visitor signed in at kiosk without a photo",
          metadata: {
            visitor_id,
            sign_in_id: signInRecord.id,
            location_id,
            visitor_type_id,
            source: "kiosk",
            reason: "camera_unavailable",
          },
        })
      }
    }

    scheduleHostNotification({
      hostId: host_id,
      locationId: location_id,
      notificationType: "arrived",
      visitorName: visitor_name || "Visitor",
      visitorCompany: visitor_company ?? null,
      visitorTypeName: visitor_type_name ?? null,
      badgeNumber: badge_number,
      visitorPhotoUrl: photo_url,
      purpose: purpose ?? null,
      signInId: String(signInRecord.id),
      idempotencyKey: idempotency_key,
    })

    return NextResponse.json({
      success: true,
      signIn: signInRecord,
      replayed: created.replayed,
    })
  } catch (error) {
    console.error("[API] Visitor sign-in error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
