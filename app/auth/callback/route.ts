import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const errorParam = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  const next = searchParams.get("next") ?? "/admin"
  const type = searchParams.get("type") // 'admin' or 'employee'
  const locationId = searchParams.get("location_id")
  const origin = process.env.NEXT_PUBLIC_SITE_URL

  // Handle x-forwarded-host for deployments behind load balancers
  const forwardedHost = request.headers.get("x-forwarded-host")
  const isLocalEnv = process.env.NODE_ENV === "development"

  function getRedirectUrl(path: string) {
    if (isLocalEnv) {
      return `${origin}${path}`
    } else if (origin) {
      return `${origin}${path}`
    }
    return `${origin}${path}`
  }

  // Handle OAuth errors from the provider
  if (errorParam) {
    return NextResponse.redirect(
      getRedirectUrl(`/auth/login?error=${encodeURIComponent(errorDescription || errorParam)}`)
    )
  }

  if (code) {
    const cookieStore = await cookies()
    
    // Track cookies that need to be set on the response
    const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookies) {
            // Collect cookies - we'll set them on the redirect response
            cookies.forEach(({ name, value, options }) => {
              cookiesToSet.push({ name, value, options: options as Record<string, unknown> })
            })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    // Helper function to create redirect with all session cookies
    function createRedirectWithCookies(url: string): NextResponse {
      const response = NextResponse.redirect(url)
      
      // Apply all cookies that Supabase wants to set to the redirect response
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options)
      }
      
      return response
    }

    if (error) {
      return createRedirectWithCookies(
        getRedirectUrl(`/auth/login?error=${encodeURIComponent(error.message)}`)
      )
    }

    if (data.user) {
      // If this is an employee login from kiosk, record the sign-in
      if (type === "employee" && locationId) {
        // Check if user has a profile with employee/admin/staff role
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .single()

        if (profile && ["employee", "admin", "staff"].includes(profile.role)) {
          // Record employee sign-in
          await supabase.from("employee_sign_ins").insert({
            profile_id: profile.id,
            location_id: locationId,
            auto_signed_in: false,
            device_id: "Microsoft OAuth",
          })

          return createRedirectWithCookies(
            getRedirectUrl(`/kiosk?employee_signed_in=true&profile_id=${profile.id}`)
          )
        } else if (!profile) {
          // No profile found - create one with employee role
          const { data: newProfile, error: createError } = await supabase
            .from("profiles")
            .insert({
              id: data.user.id,
              email: data.user.email,
              full_name: data.user.user_metadata?.full_name || data.user.email?.split("@")[0],
              role: "employee",
              location_id: locationId,
            })
            .select()
            .single()

          if (!createError && newProfile) {
            await supabase.from("employee_sign_ins").insert({
              profile_id: newProfile.id,
              location_id: locationId,
              auto_signed_in: false,
              device_id: "Microsoft OAuth",
            })

            return createRedirectWithCookies(
              getRedirectUrl(`/kiosk?employee_signed_in=true&profile_id=${newProfile.id}`)
            )
          }

          return createRedirectWithCookies(
            getRedirectUrl("/kiosk?error=profile_creation_failed")
          )
        } else {
          return createRedirectWithCookies(
            getRedirectUrl("/kiosk?error=not_employee")
          )
        }
      }

      // For admin login, redirect to admin dashboard
      return createRedirectWithCookies(getRedirectUrl(next))
    }
  }

  return NextResponse.redirect(getRedirectUrl("/auth/error"))
}
