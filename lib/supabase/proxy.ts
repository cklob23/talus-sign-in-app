import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { loginUrlForProtectedPath } from "@/lib/safe-redirect"

function requestWithPathHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers)
  headers.set("x-talus-pathname", request.nextUrl.pathname)
  headers.set("x-talus-search", request.nextUrl.search)
  return headers
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: { headers: requestWithPathHeaders(request) },
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
            request: { headers: requestWithPathHeaders(request) },
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

  // Protect admin routes. Session existence is a first gate; the admin
  // layout re-checks the verified user and role with getUser().
  if (request.nextUrl.pathname.startsWith("/admin") && (!session || sessionError)) {
    return NextResponse.redirect(new URL(
      loginUrlForProtectedPath(request.nextUrl.pathname, request.nextUrl.search),
      request.nextUrl.origin,
    ))
  }

  return supabaseResponse
}
