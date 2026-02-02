import { createClient as createAdminClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { visitorId, photoUrl } = await request.json()

    if (!visitorId) {
      return NextResponse.json({ error: "No visitor ID provided" }, { status: 400 })
    }

    if (!photoUrl) {
      return NextResponse.json({ error: "No photo URL provided" }, { status: 400 })
    }

    // Check if service role key is available
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ 
        error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set" 
      }, { status: 500 })
    }

    // Create admin client with service role key to bypass RLS
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Update visitor with photo URL using admin client to bypass RLS
    const { data, error: updateError } = await adminClient
      .from("visitors")
      .update({ photo_url: photoUrl })
      .eq("id", visitorId)
      .select()

    if (updateError) {
      console.error("Error updating visitor photo_url:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Visitor photo update error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update visitor photo" },
      { status: 500 }
    )
  }
}
