import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  KIOSK_SESSION_COOKIE,
  receptionistCookieOptions,
  signReceptionistSession,
  verifyReceptionistSession,
  type ReceptionistSession,
} from "@/lib/kiosk-session"

function sessionFromProfile(profile: {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
}, fallbackEmail = ""): ReceptionistSession {
  return {
    id: profile.id,
    email: profile.email || fallbackEmail,
    name: profile.full_name || profile.email || fallbackEmail,
    role: profile.role || "staff",
    loginAt: new Date().toISOString(),
  }
}

function withSessionCookie(response: NextResponse, session: ReceptionistSession): NextResponse {
  response.cookies.set(KIOSK_SESSION_COOKIE, signReceptionistSession(session), receptionistCookieOptions())
  return response
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(KIOSK_SESSION_COOKIE)
    const session = verifyReceptionistSession(sessionCookie?.value)

    if (!session) {
      const response = NextResponse.json({ authenticated: false })
      if (sessionCookie?.value) response.cookies.delete(KIOSK_SESSION_COOKIE)
      return response
    }

    const adminClient = createAdminClient()
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("id", session.id)
      .single()

    if (!profile) {
      const response = NextResponse.json({ authenticated: false })
      response.cookies.delete(KIOSK_SESSION_COOKIE)
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

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { method, email, password } = body

    if (method === "password") {
      if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
        return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
      }

      const supabase = await createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        await supabase.auth.signOut()
        return NextResponse.json({ error: error.message }, { status: 401 })
      }

      const adminClient = createAdminClient()
      const { data: profile } = await adminClient
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("id", data.user.id)
        .single()

      await supabase.auth.signOut()

      if (!profile) {
        return NextResponse.json(
          { error: "No profile found for this account." },
          { status: 404 },
        )
      }

      const session = sessionFromProfile(profile, email)
      const response = NextResponse.json({
        success: true,
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.full_name || profile.email,
          role: profile.role,
        },
      })
      return withSessionCookie(response, session)
    }

    if (method === "oauth_callback") {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.json({ error: "Not signed in" }, { status: 401 })
      }

      const adminClient = createAdminClient()
      const { data: profile } = await adminClient
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("id", user.id)
        .single()

      if (!profile) {
        return NextResponse.json({ error: "No profile found." }, { status: 404 })
      }

      const session = sessionFromProfile(profile, user.email || "")
      const response = NextResponse.json({
        success: true,
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.full_name || profile.email,
          role: profile.role,
        },
      })
      return withSessionCookie(response, session)
    }

    return NextResponse.json({ error: "Invalid method" }, { status: 400 })
  } catch (error) {
    console.error("Error creating receptionist session:", error)
    const message = error instanceof Error && error.message.includes("KIOSK_SESSION_SECRET")
      ? "Server is not configured: KIOSK_SESSION_SECRET is not set."
      : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const response = NextResponse.json({ success: true })
    response.cookies.delete(KIOSK_SESSION_COOKIE)
    return response
  } catch (error) {
    console.error("Error deleting receptionist session:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
