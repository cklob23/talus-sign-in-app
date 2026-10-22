import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalEmail, asRequiredUuid } from "@/lib/kiosk-input"

/**
 * Look up whether a returning visitor still has a valid training completion.
 * Replaces the kiosk browser reads of visitors and training_completions.
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
      return NextResponse.json({ visitorId: null, hasValidTraining: false })
    }

    const supabase = getAdminClient()
    const { data: visitors, error: visitorError } = await supabase
      .from("visitors")
      .select("id")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(20)

    if (visitorError) {
      console.error("[API] Training status visitor lookup:", visitorError)
      return NextResponse.json({ error: "Failed to look up training" }, { status: 500 })
    }

    if (!visitors || visitors.length === 0) {
      return NextResponse.json({ visitorId: null, hasValidTraining: false })
    }

    const visitorIds = visitors.map((v) => v.id)
    const { data: completions } = await supabase
      .from("training_completions")
      .select("visitor_id, expires_at")
      .in("visitor_id", visitorIds)
      .eq("visitor_type_id", visitor_type_id)
      .order("expires_at", { ascending: false })
      .limit(5)

    const now = Date.now()
    const valid = (completions || []).find((row) => {
      if (!row.expires_at) return true
      return new Date(row.expires_at).getTime() >= now
    })

    return NextResponse.json({
      visitorId: valid?.visitor_id || visitors[0].id,
      hasValidTraining: !!valid,
    })
  } catch (error) {
    console.error("[API] Training status error:", error)
    return NextResponse.json({ error: "Failed to look up training" }, { status: 500 })
  }
}
