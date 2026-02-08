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
    const { visitor_id, visitor_type_id, expires_at } = body

    if (!visitor_id || !visitor_type_id) {
      return NextResponse.json(
        { error: "Missing required fields: visitor_id and visitor_type_id" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Create the training completion record
    const { data: completion, error: completionError } = await adminClient
      .from("training_completions")
      .insert({
        visitor_id,
        visitor_type_id,
        expires_at: expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (completionError) {
      console.error("[API] Training completion insert error:", completionError)
      return NextResponse.json(
        { error: completionError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      completion 
    })
  } catch (error) {
    console.error("[API] Create training completion error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
