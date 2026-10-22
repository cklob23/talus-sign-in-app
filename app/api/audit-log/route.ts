import { NextResponse } from "next/server"
import { getAdminClient, createClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"

const ALLOWED_ACTIONS = new Set([
  "user.login",
  "user.logout",
  "kiosk.receptionist_login",
  "kiosk.receptionist_logout",
  "employee.sign_in",
  "employee.sign_out",
  "visitor.sign_in",
  "visitor.sign_out",
])

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { action, entityType, entityId, description, metadata } = body as Record<string, unknown>

    if (typeof action !== "string" || typeof entityType !== "string") {
      return NextResponse.json({ error: "action and entityType are required" }, { status: 400 })
    }
    if (action.length > 80 || entityType.length > 40) {
      return NextResponse.json({ error: "Invalid action or entityType" }, { status: 400 })
    }

    let userId: string | null = null

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      userId = user.id
    } else {
      const kiosk = await requireKioskContext(request)
      if (!kiosk.ok) return kiosk.response
      userId = kiosk.context.source === "receptionist" ? kiosk.context.session.id : null
      if (!ALLOWED_ACTIONS.has(action)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const admin = getAdminClient()
    const { error } = await admin.from("audit_logs").insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: typeof entityId === "string" ? entityId : null,
      description: typeof description === "string" ? description.slice(0, 500) : null,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    })

    if (error) {
      console.error("[v0] Audit log insert error:", error)
      return NextResponse.json({ error: "Failed to create audit log" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Audit log API error:", error)
    return NextResponse.json({ error: "Failed to create audit log" }, { status: 500 })
  }
}
