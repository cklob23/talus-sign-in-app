import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Use service role client to bypass RLS for audit logging
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, entityType, entityId, description, metadata, userId } = body

    if (!action || !entityType) {
      return NextResponse.json(
        { error: "action and entityType are required" },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin.from("audit_logs").insert({
      user_id: userId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      description: description || null,
      metadata: metadata || {},
    })

    if (error) {
      console.error("[v0] Audit log insert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Audit log API error:", error)
    return NextResponse.json(
      { error: "Failed to create audit log" },
      { status: 500 }
    )
  }
}
