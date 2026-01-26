import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const sbCookies = allCookies.filter(c => c.name.startsWith("sb-"))
  
  const supabase = await createClient()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  return NextResponse.json({
    cookies: {
      total: allCookies.length,
      allCookieNames: allCookies.map(c => c.name),
      supabaseCookies: sbCookies.map(c => ({ name: c.name, valueLength: c.value.length, preview: c.value.substring(0, 50) })),
    },
    session: {
      hasSession: !!session,
      sessionError: sessionError?.message,
      accessTokenLength: session?.access_token?.length,
      refreshTokenLength: session?.refresh_token?.length,
      expiresAt: session?.expires_at,
    },
    user: {
      hasUser: !!user,
      userError: userError?.message,
      email: user?.email,
      id: user?.id,
    }
  })
}
