import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// POST - Create a new profile
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has admin role
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!currentProfile || currentProfile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Get profile data from request
    const body = await request.json()
    const { email, full_name, role, location_id, department, avatar_url } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    // Use admin client to bypass RLS
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Check if profile with this email already exists
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single()

    if (existingProfile) {
      // Update existing profile
      const { data: updated, error: updateError } = await adminClient
        .from("profiles")
        .update({
          full_name: full_name || null,
          role: role || "employee",
          location_id: location_id || null,
          department: department || null,
          avatar_url: avatar_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingProfile.id)
        .select()
        .single()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ profile: updated, updated: true })
    }

    // Check if an auth user with this email already exists
    const { data: authUsers } = await adminClient.auth.admin.listUsers()
    const existingAuthUser = authUsers?.users?.find(u => u.email === email)

    let authUserId: string

    if (existingAuthUser) {
      // Use existing auth user's ID
      authUserId = existingAuthUser.id
    } else {
      // Create a new auth user via Admin API
      // This user will sign in via Microsoft OAuth, so we create with a random password
      // The password won't be used since they authenticate via OAuth
      const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true, // Auto-confirm email since admin is creating
        user_metadata: {
          full_name: full_name || null,
          role: role || "employee",
        },
      })

      if (authError) {
        return NextResponse.json({ error: `Failed to create auth user: ${authError.message}` }, { status: 500 })
      }

      authUserId = newAuthUser.user.id
    }

    // Now create or update the profile with the auth user's ID
    const { data: newProfile, error: insertError } = await adminClient
      .from("profiles")
      .upsert({
        id: authUserId,
        email,
        full_name: full_name || null,
        role: role || "employee",
        location_id: location_id || null,
        department: department || null,
        avatar_url: avatar_url || null,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ profile: newProfile, created: true })
  } catch (error) {
    console.error("Profile creation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create profile" },
      { status: 500 }
    )
  }
}

// PUT - Update an existing profile
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has admin role
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!currentProfile || currentProfile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Get profile data from request
    const body = await request.json()
    const { id, email, full_name, role, location_id, department, avatar_url } = body

    if (!id) {
      return NextResponse.json({ error: "Profile ID is required" }, { status: 400 })
    }

    // Use admin client to bypass RLS
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { data: updated, error: updateError } = await adminClient
      .from("profiles")
      .update({
        email: email || null,
        full_name: full_name || null,
        role: role || "employee",
        location_id: location_id || null,
        department: department || null,
        avatar_url: avatar_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ profile: updated })
  } catch (error) {
    console.error("Profile update error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update profile" },
      { status: 500 }
    )
  }
}

// DELETE - Delete a profile
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has admin role
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!currentProfile || currentProfile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Profile ID is required" }, { status: 400 })
    }

    // Use admin client to bypass RLS
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { error: deleteError } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Profile deletion error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete profile" },
      { status: 500 }
    )
  }
}
