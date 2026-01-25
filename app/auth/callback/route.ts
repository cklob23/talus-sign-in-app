import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/admin"
  const type = searchParams.get("type") // 'admin' or 'employee'
  const locationId = searchParams.get("location_id")
  const origin = "http://localhost:3000"

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error("[Auth Callback] Error exchanging code for session:", error.message)
      // Redirect to error page with the error message
      return NextResponse.redirect(
        `${origin}/auth/error?message=${encodeURIComponent(error.message)}`
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
          return NextResponse.redirect(
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

            return NextResponse.redirect(
              `${origin}/kiosk?employee_signed_in=true&profile_id=${newProfile.id}`
            )
          }
          
          // Redirect with error if profile creation fails
          return NextResponse.redirect(
            `${origin}/kiosk?error=profile_creation_failed`
          )
        } else {
          // User exists but doesn't have employee role
          return NextResponse.redirect(
            `${origin}/kiosk?error=not_employee`
          )
        }
      }

      // For admin login, redirect to admin dashboard
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/error`)
}
