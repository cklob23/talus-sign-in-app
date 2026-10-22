import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContextOrHide } from "@/lib/kiosk-auth"
import { asOptionalEmail, asOptionalString } from "@/lib/kiosk-input"
import { BADGE_NUMBER_INPUT_RE, normalizeBadgeInput } from "@/lib/badge-number"

const HIDDEN = { error: "No active sign-in found" }

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : null
    const qrToken = raw && typeof raw.qrToken === "string" ? raw.qrToken : undefined
    const auth = await requireKioskContextOrHide(request, { qrToken })
    if (!auth.ok) return auth.response

    const email = asOptionalEmail(raw?.email ?? null)
    const badgeRaw = asOptionalString(raw?.badgeNumber ?? raw?.badge_number ?? null, 20)
    if (email === undefined || badgeRaw === undefined) {
      return NextResponse.json(HIDDEN, { status: 404 })
    }

    const badgeNumber = badgeRaw ? normalizeBadgeInput(badgeRaw) : null
    if (badgeNumber && !BADGE_NUMBER_INPUT_RE.test(badgeNumber)) {
      return NextResponse.json(HIDDEN, { status: 404 })
    }
    if (!email && !badgeNumber) {
      return NextResponse.json({ error: "Email or badge number is required" }, { status: 400 })
    }

    const supabase = getAdminClient()
    let query = supabase
      .from("sign_ins")
      .select("*, visitor:visitors(*)")
      .is("sign_out_time", null)
      .order("sign_in_time", { ascending: false })
      .limit(1)

    if (auth.context.source === "qr") {
      query = query.eq("location_id", auth.context.locationId)
    }

    if (badgeNumber) {
      query = query.eq("badge_number", badgeNumber)
    } else if (email) {
      const { data: visitors, error: visitorError } = await supabase
        .from("visitors")
        .select("id, first_name, last_name")
        .eq("email", email)

      if (visitorError) {
        console.error("Visitor lookup error:", visitorError)
        return NextResponse.json({ error: "Failed to look up visitor" }, { status: 500 })
      }

      if (!visitors || visitors.length === 0) {
        return NextResponse.json(HIDDEN, { status: 404 })
      }

      query = query.in(
        "visitor_id",
        visitors.map((visitor) => visitor.id),
      )
    }

    const { data: rows, error: findError } = await query
    const signIn = rows?.[0]

    if (findError || !signIn) {
      return NextResponse.json(HIDDEN, { status: 404 })
    }

    return NextResponse.json({
      sign_in: {
        id: signIn.id,
        visitor_id: signIn.visitor_id,
        visitor_name: `${signIn.visitor?.first_name || ""} ${signIn.visitor?.last_name || ""}`.trim(),
        visitor_email: signIn.visitor?.email || null,
        badge_number: signIn.badge_number,
        sign_in_time: signIn.sign_in_time,
        visitor: signIn.visitor,
      },
    })
  } catch (err) {
    console.error("Find sign-in error:", err)
    return NextResponse.json({ error: "Failed to find sign-in" }, { status: 500 })
  }
}
