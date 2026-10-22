import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asRequiredEmail } from "@/lib/kiosk-input"

export async function POST(request: Request) {
  try {
    const auth = await requireKioskContext(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const visitor_email = asRequiredEmail(
      body && typeof body === "object" ? (body as { visitor_email?: unknown }).visitor_email : null,
    )

    if (!visitor_email) {
      return NextResponse.json({ error: "visitor_email is required" }, { status: 400 })
    }

    const supabase = getAdminClient()
    const { error } = await supabase
      .from("bookings")
      .update({ status: "completed" })
      .eq("visitor_email", visitor_email)
      .eq("status", "checked_in")

    if (error) {
      console.error("Complete bookings error:", error)
      return NextResponse.json({ error: "Failed to complete bookings" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Complete bookings error:", err)
    return NextResponse.json({ error: "Failed to complete bookings" }, { status: 500 })
  }
}
