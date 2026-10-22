import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalEmail, asRequiredUuid } from "@/lib/kiosk-input"
import { getTrainingClearance, maskEmail } from "@/lib/training-clearance"

/**
 * Shared "is this person cleared for this visitor type" lookup.
 * Used by kiosk, QR (via requireKioskContext + token), and staff overrides.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireKioskContext(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const email = asOptionalEmail((body as { email?: unknown }).email)
    const visitor_type_id = asRequiredUuid((body as { visitor_type_id?: unknown }).visitor_type_id)

    if (!visitor_type_id) {
      return NextResponse.json({ error: "visitor_type_id is required" }, { status: 400 })
    }
    if (email === undefined) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 })
    }
    if (!email) {
      return NextResponse.json({
        visitorId: null,
        hasValidTraining: false,
        cleared: false,
        skipKind: null,
        message: null,
        messageEs: null,
        completedAt: null,
        expiresAt: null,
        maskedEmail: null,
      })
    }

    const clearance = await getTrainingClearance(getAdminClient(), email, visitor_type_id)
    return NextResponse.json({
      visitorId: clearance.visitorId,
      hasValidTraining: clearance.cleared,
      cleared: clearance.cleared,
      skipKind: clearance.skipKind,
      message: clearance.message,
      messageEs: clearance.messageEs,
      completedAt: clearance.completedAt,
      expiresAt: clearance.expiresAt,
      source: clearance.source,
      maskedEmail: maskEmail(email),
    })
  } catch (error) {
    console.error("[API] Training status error:", error)
    return NextResponse.json({ error: "Failed to look up training" }, { status: 500 })
  }
}
