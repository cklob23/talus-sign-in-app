import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"

// Mark checked_in bookings as completed when a visitor signs out
// Uses admin client to bypass RLS
export async function POST(request: Request) {
  try {
    const { visitor_email } = await request.json()

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to complete bookings" },
      { status: 500 }
    )
  }
}
