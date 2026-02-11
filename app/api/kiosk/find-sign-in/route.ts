import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"

// Find an active visitor sign-in by email
// Uses admin client to bypass RLS since the kiosk has no Supabase auth session
export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const supabase = getAdminClient()
    const normalizedEmail = email.toLowerCase().trim()

    // First, find visitor(s) with this email
    const { data: visitors, error: visitorError } = await supabase
      .from("visitors")
      .select("id, first_name, last_name")
      .eq("email", normalizedEmail)

    if (visitorError) {
      console.error("Visitor lookup error:", visitorError)
      return NextResponse.json({ error: "Failed to look up visitor" }, { status: 500 })
    }

    if (!visitors || visitors.length === 0) {
      return NextResponse.json({ error: "No active sign-in found for this email" }, { status: 404 })
    }

    // Get all visitor IDs
    const visitorIds = visitors.map((v) => v.id)

    // Find active sign-in for any of these visitors
    const { data: signIn, error: findError } = await supabase
      .from("sign_ins")
      .select("*, visitor:visitors(*)")
      .in("visitor_id", visitorIds)
      .is("sign_out_time", null)
      .order("sign_in_time", { ascending: false })
      .limit(1)
      .single()

    if (findError || !signIn) {
      return NextResponse.json({ error: "No active sign-in found for this email" }, { status: 404 })
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to find sign-in" },
      { status: 500 }
    )
  }
}
