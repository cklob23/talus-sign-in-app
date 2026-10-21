import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalHttpUrl, asRequiredUuid } from "@/lib/kiosk-input"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireKioskContext(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const visitorId = asRequiredUuid((body as { visitorId?: unknown }).visitorId)
    const photoUrl = asOptionalHttpUrl((body as { photoUrl?: unknown }).photoUrl)

    if (!visitorId) {
      return NextResponse.json({ error: "No visitor ID provided" }, { status: 400 })
    }
    if (!photoUrl) {
      return NextResponse.json({ error: "No photo URL provided" }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const { data, error: updateError } = await adminClient
      .from("visitors")
      .update({ photo_url: photoUrl })
      .eq("id", visitorId)
      .select()

    if (updateError) {
      console.error("Error updating visitor photo_url:", updateError)
      return NextResponse.json({ error: "Failed to update visitor photo" }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Visitor photo update error:", error)
    return NextResponse.json({ error: "Failed to update visitor photo" }, { status: 500 })
  }
}
