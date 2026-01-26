import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const errorParam = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  const next = searchParams.get("next") ?? "/admin"
  const type = searchParams.get("type") // 'admin' or 'employee'
  const locationId = searchParams.get("location_id")
  const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin

  // Handle OAuth errors from the provider
  if (errorParam) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(errorDescription || errorParam)}`
    )
  }

  if (code) {
    // We need to track cookies that Supabase wants to set
    // and apply them to the final redirect response
    const cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }> = []
    
    // Create Supabase client that collects cookies to set
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookies) {
            // Collect cookies to set on the response
            cookiesToSet.push(...cookies)
          },
        },
      }
    )
    
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    // Helper to create redirect with cookies
    function redirectWithCookies(url: string) {
      const response = NextResponse.redirect(url)
      // Apply all cookies that Supabase wants to set
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options as Record<string, unknown>)
      }
      return response
    }

    if (error) {
      // Redirect to login page with the error message
      return redirectWithCookies(
        `${origin}/auth/login?error=${encodeURIComponent(error.message)}`
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

          // Redirect back to kiosk with success
          return redirectWithCookies(
            `${origin}/kiosk?employee_signed_in=true&profile_id=${profile.id}`
          )
        } else if (!profile) {
          // No profile found - create one with employee role if they signed in with Microsoft
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
            // Record employee sign-in
            await supabase.from("employee_sign_ins").insert({
              profile_id: newProfile.id,
              location_id: locationId,
              auto_signed_in: false,
              device_id: "Microsoft OAuth",
            })

            return redirectWithCookies(
              `${origin}/kiosk?employee_signed_in=true&profile_id=${newProfile.id}`
            )
          }
          
          // Redirect with error if profile creation fails
          return redirectWithCookies(
            `${origin}/kiosk?error=profile_creation_failed`
          )
        } else {
          // User exists but doesn't have employee role
          return redirectWithCookies(
            `${origin}/kiosk?error=not_employee`
          )
        }
      }

      // For admin login, redirect to admin dashboard
      return redirectWithCookies(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/error`)
}
