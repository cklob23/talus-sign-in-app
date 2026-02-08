import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Create admin client with service role key to bypass RLS
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      visitor_id, 
      visitor_name,
      visitor_email,
      location_id, 
      host_id, 
      badge_number, 
      photo_url, 
      visitor_type_id,
      booking_id,
      timezone 
    } = body

    if (!visitor_id || !location_id) {
      return NextResponse.json(
        { error: "Missing required fields: visitor_id and location_id" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Create the sign-in record
    const { data: signInRecord, error: signInError } = await adminClient
      .from("sign_ins")
      .insert({
        visitor_id,
        location_id,
        host_id: host_id || null,
        badge_number: badge_number || null,
        photo_url: photo_url || null,
        visitor_type_id: visitor_type_id || null,
        timezone: timezone || "UTC",
      })
      .select()
      .single()

    if (signInError) {
      console.error("[API] Sign-in insert error:", signInError)
      return NextResponse.json(
        { error: signInError.message },
        { status: 500 }
      )
    }

    // If there's a booking, update its status
    if (booking_id) {
      await adminClient
        .from("bookings")
        .update({ status: "checked_in" })
        .eq("id", booking_id)
    }

    // Log the audit entry
    const visitorLabel = visitor_name
      ? visitor_email
        ? `${visitor_name} (${visitor_email})`
        : visitor_name
      : "Unknown visitor"
    await adminClient.from("audit_logs").insert({
      user_id: null,
      action: "visitor.sign_in",
      entity_type: "visitor",
      entity_id: visitor_id,
      description: `Visitor signed in: ${visitorLabel}`,
      metadata: {
        visitor_id,
        visitor_name,
        visitor_email,
        sign_in_id: signInRecord.id,
        location_id,
        badge_number,
        host_id,
        visitor_type_id,
        booking_id
      },
    })

    return NextResponse.json({ 
      success: true, 
      signIn: signInRecord 
    })
  } catch (error) {
    console.error("[API] Visitor sign-in error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
