import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalEmail, asOptionalString, asOptionalUuid, asRequiredUuid } from "@/lib/kiosk-input"

export async function POST(request: Request) {
  try {
    const auth = await requireKioskContext(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const sign_in_id = asRequiredUuid(raw.sign_in_id)
    const visitor_id = asOptionalUuid(raw.visitor_id)
    const visitor_name = asOptionalString(raw.visitor_name, 200)
    const visitor_email = asOptionalEmail(raw.visitor_email)
    const badge_number = asOptionalString(raw.badge_number, 20)

    if (!sign_in_id) {
      return NextResponse.json({ error: "Missing required field: sign_in_id" }, { status: 400 })
    }
    if (
      visitor_id === undefined ||
      visitor_name === undefined ||
      visitor_email === undefined ||
      badge_number === undefined
    ) {
      return NextResponse.json({ error: "Invalid field value" }, { status: 400 })
    }

    const adminClient = getAdminClient()

    if (auth.context.source === "qr") {
      const { data: existing } = await adminClient
        .from("sign_ins")
        .select("id, location_id")
        .eq("id", sign_in_id)
        .maybeSingle()
      if (!existing || existing.location_id !== auth.context.locationId) {
        return NextResponse.json({ error: "Sign-in not found" }, { status: 404 })
      }
    }

    const { error: signOutError } = await adminClient
      .from("sign_ins")
      .update({ sign_out_time: new Date().toISOString() })
      .eq("id", sign_in_id)

    if (signOutError) {
      console.error("[API] Sign-out update error:", signOutError)
      return NextResponse.json({ error: "Failed to sign out" }, { status: 500 })
    }

    const visitorLabel = visitor_name
      ? visitor_email
        ? `${visitor_name} (${visitor_email})`
        : visitor_name
      : "Unknown visitor"
    await adminClient.from("audit_logs").insert({
      user_id: auth.context.source === "receptionist" ? auth.context.session.id : null,
      action: "visitor.sign_out",
      entity_type: "visitor",
      entity_id: visitor_id || null,
      description: `Visitor signed out: ${visitorLabel}`,
      metadata: {
        sign_in_id,
        visitor_id,
        visitor_name,
        visitor_email,
        badge_number,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[API] Visitor sign-out error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
