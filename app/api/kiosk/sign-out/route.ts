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
    const { sign_in_id, visitor_id, visitor_name, visitor_email, badge_number } = body

    if (!sign_in_id) {
      return NextResponse.json(
        { error: "Missing required field: sign_in_id" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Update the sign-in record with sign-out time
    const { error: signOutError } = await adminClient
      .from("sign_ins")
      .update({ sign_out_time: new Date().toISOString() })
      .eq("id", sign_in_id)

    if (signOutError) {
      console.error("[API] Sign-out update error:", signOutError)
      return NextResponse.json(
        { error: signOutError.message },
        { status: 500 }
      )
    }

    // Log the audit entry
    const visitorLabel = visitor_name
      ? visitor_email
        ? `${visitor_name} (${visitor_email})`
        : visitor_name
      : "Unknown visitor"
    await adminClient.from("audit_logs").insert({
      user_id: null,
      action: "visitor.sign_out",
      entity_type: "visitor",
      entity_id: visitor_id,
      description: `Visitor signed out: ${visitorLabel}`,
      metadata: {
        sign_in_id,
        visitor_id,
        visitor_name,
        visitor_email,
        badge_number
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[API] Visitor sign-out error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
