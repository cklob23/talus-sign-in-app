import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import {
  asOptionalEmail,
  asOptionalHttpUrl,
  asOptionalString,
  asRequiredUuid,
  asTrimmedString,
} from "@/lib/kiosk-input"

export async function POST(request: Request) {
  try {
    const auth = await requireKioskContext(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const first_name = asTrimmedString((body as { first_name?: unknown }).first_name, 100)
    const last_name = asTrimmedString((body as { last_name?: unknown }).last_name, 100)
    const email = asOptionalEmail((body as { email?: unknown }).email)
    const phone = asOptionalString((body as { phone?: unknown }).phone, 40)
    const company = asOptionalString((body as { company?: unknown }).company, 200)
    const photo_url = asOptionalHttpUrl((body as { photo_url?: unknown }).photo_url)

    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: "Missing required fields: first_name and last_name" },
        { status: 400 },
      )
    }
    if (email === undefined || phone === undefined || company === undefined || photo_url === undefined) {
      return NextResponse.json({ error: "Invalid field value" }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const { data: visitor, error: visitorError } = await adminClient
      .from("visitors")
      .insert({
        first_name,
        last_name,
        email: email || null,
        phone: phone || null,
        company: company || null,
        photo_url: photo_url || null,
      })
      .select()
      .single()

    if (visitorError) {
      console.error("[API] Visitor insert error:", visitorError)
      return NextResponse.json({ error: "Failed to create visitor" }, { status: 500 })
    }

    return NextResponse.json({ success: true, visitor })
  } catch (error) {
    console.error("[API] Create visitor error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireKioskContext(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const id = asRequiredUuid((body as { id?: unknown }).id)
    const hasPhotoUrl = Object.prototype.hasOwnProperty.call(body, "photo_url")
    const photo_url = hasPhotoUrl
      ? asOptionalHttpUrl((body as { photo_url?: unknown }).photo_url)
      : null

    if (!id) {
      return NextResponse.json({ error: "Missing required field: id" }, { status: 400 })
    }
    if (!hasPhotoUrl) {
      return NextResponse.json({ error: "Missing required field: photo_url" }, { status: 400 })
    }
    if (photo_url === undefined) {
      return NextResponse.json({ error: "Invalid photo_url" }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const { data: visitor, error: updateError } = await adminClient
      .from("visitors")
      .update({ photo_url })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("[API] Visitor update error:", updateError)
      return NextResponse.json({ error: "Failed to update visitor" }, { status: 500 })
    }

    return NextResponse.json({ success: true, visitor })
  } catch (error) {
    console.error("[API] Update visitor error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
