import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asRequiredUuid } from "@/lib/kiosk-input"
import { issueTrainingTicket, KIOSK_TRAINING_SCOPE } from "@/lib/training-gate"

/**
 * Called when a kiosk visitor taps "Start Training". The returned ticket must
 * be sent back with the training completion so the server can confirm the
 * video ran for its full length.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireKioskContext(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const visitor_type_id = asRequiredUuid((body as { visitor_type_id?: unknown } | null)?.visitor_type_id)
    if (!visitor_type_id) {
      return NextResponse.json({ error: "visitor_type_id is required" }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data: visitorType } = await admin
      .from("visitor_types")
      .select("id, requires_training")
      .eq("id", visitor_type_id)
      .maybeSingle()
    if (!visitorType?.requires_training) {
      return NextResponse.json({ error: "Training is not required for this visitor type" }, { status: 400 })
    }

    const ticket = issueTrainingTicket({ visitorTypeId: visitorType.id, scope: KIOSK_TRAINING_SCOPE })
    return NextResponse.json({ ticket })
  } catch (error) {
    console.error("[API] Training start error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Could not start training. Please try again." }, { status: 500 })
  }
}
