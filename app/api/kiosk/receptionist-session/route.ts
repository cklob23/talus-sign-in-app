import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server"

const COOKIE_NAME = "kiosk-receptionist-session"
const COOKIE_MAX_AGE = 60 * 60 * 24 // 24 hours

interface ReceptionistSession {
  id: string
  email: string
  name: string
  role: string
  loginAt: string
}

// GET - Check if there's an active receptionist session
export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(COOKIE_NAME)

    if (!sessionCookie?.value) {
      return NextResponse.json({ authenticated: false })
    }

    // Decode and validate session
    let session: ReceptionistSession
    try {
      session = JSON.parse(
        Buffer.from(sessionCookie.value, "base64").toString("utf-8")
      )
    } catch {
      // Invalid cookie, clear it
      const response = NextResponse.json({ authenticated: false })
      response.cookies.delete(COOKIE_NAME)
      return response
    }

    // Verify the profile still exists in the database
    const adminClient = createAdminClient()
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("id", session.id)
      .single()

    if (!profile) {
      const response = NextResponse.json({ authenticated: false })
      response.cookies.delete(COOKIE_NAME)
      return response
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.full_name || profile.email,
        role: profile.role,
      },
    })
  } catch (error) {
    console.error("Error checking receptionist session:", error)
    return NextResponse.json({ authenticated: false })
  }
}

// POST - Create a new receptionist session (login)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { method, email, password } = body

    if (method === "password") {
      // Authenticate via Supabase Auth (just to verify credentials)
      const supabase = await createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        // Immediately sign out to not leave a Supabase session
        await supabase.auth.signOut()
        return NextResponse.json({ error: error.message }, { status: 401 })
      }

      const adminClient = createAdminClient()
      const { data: profile } = await adminClient
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("id", data.user.id)
        .single()

      // Sign out of Supabase auth immediately - we only needed to verify credentials
      await supabase.auth.signOut()

      if (!profile) {
        return NextResponse.json(
          { error: "No profile found for this account." },
          { status: 404 }
        )
      }

      // Create the session cookie
      const session: ReceptionistSession = {
        id: profile.id,
        email: profile.email || email,
        name: profile.full_name || profile.email || email,
        role: profile.role || "staff",
        loginAt: new Date().toISOString(),
      }

      const encodedSession = Buffer.from(JSON.stringify(session)).toString(
        "base64"
      )

      const response = NextResponse.json({
        success: true,
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.full_name || profile.email,
          role: profile.role,
        },
      })

      response.cookies.set(COOKIE_NAME, encodedSession, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      })

      return response
    }

    if (method === "oauth_callback") {
      // Called after Microsoft OAuth - user is already authenticated via Supabase
      // We just need to read the current user and create our own cookie
      const { userId } = body

      const adminClient = createAdminClient()
      const { data: profile } = await adminClient
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("id", userId)
        .single()

      if (!profile) {
        return NextResponse.json(
          { error: "No profile found." },
          { status: 404 }
        )
      }

      const session: ReceptionistSession = {
        id: profile.id,
        email: profile.email || "",
        name: profile.full_name || profile.email || "",
        role: profile.role || "staff",
        loginAt: new Date().toISOString(),
      }

      const encodedSession = Buffer.from(JSON.stringify(session)).toString(
        "base64"
      )

      const response = NextResponse.json({
        success: true,
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.full_name || profile.email,
          role: profile.role,
        },
      })

      response.cookies.set(COOKIE_NAME, encodedSession, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      })

      return response
    }

    return NextResponse.json({ error: "Invalid method" }, { status: 400 })
  } catch (error) {
    console.error("Error creating receptionist session:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE - End receptionist session (lock kiosk / logout)
export async function DELETE() {
  try {
    const response = NextResponse.json({ success: true })
    response.cookies.delete(COOKIE_NAME)
    return response
  } catch (error) {
    console.error("Error deleting receptionist session:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
