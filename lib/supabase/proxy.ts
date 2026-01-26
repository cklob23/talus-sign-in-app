import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  // Use getSession() which reads from cookies directly without API call
  // This is faster and works immediately after OAuth callback sets cookies
  // Note: getSession() is less secure than getUser() but appropriate for middleware
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  
  if (sessionError) {
    // If there's a session error, clear stale cookies
    const cookieNames = request.cookies.getAll().map(c => c.name)
    cookieNames.forEach(name => {
      if (name.startsWith("sb-")) {
        supabaseResponse.cookies.delete(name)
      }
    })
  }

  // Protect admin routes - require a valid session
  if (request.nextUrl.pathname.startsWith("/admin") && !session) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
