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

  // Try to get user, handle errors gracefully
  let user = null
  try {
    const { data, error } = await supabase.auth.getUser()
    
    if (error) {
      // If refresh token is invalid/not found, clear auth cookies
      if (error.message.includes("refresh_token") || error.code === "refresh_token_not_found") {
        // Clear all Supabase auth cookies to force fresh login
        const cookieNames = request.cookies.getAll().map(c => c.name)
        cookieNames.forEach(name => {
          if (name.startsWith("sb-")) {
            supabaseResponse.cookies.delete(name)
          }
        })
      }
      // Don't throw, just treat as no user
      user = null
    } else {
      user = data.user
    }
  } catch {
    // Silently handle any unexpected errors
    user = null
  }

  // Protect admin routes
  if (request.nextUrl.pathname.startsWith("/admin") && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
