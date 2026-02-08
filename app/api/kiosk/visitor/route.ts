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
    const { first_name, last_name, email, phone, company, photo_url } = body

    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: "Missing required fields: first_name and last_name" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Create the visitor record
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
      return NextResponse.json(
        { error: visitorError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      visitor 
    })
  } catch (error) {
    console.error("[API] Create visitor error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

// Update visitor (for photo, etc.)
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, photo_url } = body

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    const updateData: Record<string, string | null> = {}
    if (photo_url !== undefined) updateData.photo_url = photo_url

    const { data: visitor, error: updateError } = await adminClient
      .from("visitors")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("[API] Visitor update error:", updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      visitor 
    })
  } catch (error) {
    console.error("[API] Update visitor error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
