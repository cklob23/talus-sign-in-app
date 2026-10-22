import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalIsoDate, asRequiredUuid } from "@/lib/kiosk-input"

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
    const visitor_type_id = asRequiredUuid(raw.visitor_type_id)
    const expires_at = asOptionalIsoDate(raw.expires_at)

    if (!visitor_id || !visitor_type_id) {
      return NextResponse.json(
        { error: "Missing required fields: visitor_id and visitor_type_id" },
        { status: 400 },
      )
    }
    if (expires_at === undefined) {
      return NextResponse.json({ error: "Invalid expires_at" }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const { data: completion, error: completionError } = await adminClient
      .from("training_completions")
      .insert({
        visitor_id,
        visitor_type_id,
        expires_at: expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (completionError) {
      console.error("[API] Training completion insert error:", completionError)
      return NextResponse.json({ error: "Failed to record training" }, { status: 500 })
    }

    return NextResponse.json({ success: true, completion })
  } catch (error) {
    console.error("[API] Create training completion error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
