import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

/**
 * GET /api/auth/verify-recovery?token=...&type=recovery
 *
 * This endpoint replaces Supabase's /auth/v1/verify for password recovery.
 * It receives the hashed_token from our custom reset email, verifies it
 * via the Supabase admin API, establishes a session, and redirects the
 * user to /kiosk/reset-password — all server-side so we have full control
 * over the redirect destination regardless of Supabase dashboard config.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")
    const type = searchParams.get("type")

    // Determine the correct origin for redirects
    const forwardedHost = request.headers.get("x-forwarded-host")
    const { origin } = new URL(request.url)
    const isLocal = process.env.NODE_ENV === "development"

    function getRedirectUrl(path: string) {
        if (isLocal) return `${origin}${path}`
        if (forwardedHost) return `https://${forwardedHost}${path}`
        return `${origin}${path}`
    }

    if (!token || type !== "recovery") {
        return NextResponse.redirect(
            getRedirectUrl("/kiosk/forgot-password?error=invalid_link")
        )
    }

    try {
        // Use Supabase's OTP verify to exchange the hashed token for a session
        const cookieStore = await cookies()
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
                        cookies.forEach(({ name, value, options }) => {
                            cookiesToSet.push({ name, value, options: options as Record<string, unknown> })
                        })
                    },
                },
            }
        )

        // Verify the recovery token — this exchanges it for a valid session
        const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: "recovery",
        })

        if (error || !data.session) {
            console.error("[verify-recovery] Token verification failed:", error)
            return NextResponse.redirect(
                getRedirectUrl("/kiosk/forgot-password?error=expired_link")
            )
        }

        // Set the session on the response and redirect to reset-password page
        const response = NextResponse.redirect(getRedirectUrl("/kiosk/reset-password"))

        // Apply all session cookies
        for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
        }

        return response
    } catch (err) {
        console.error("[verify-recovery] Unexpected error:", err)
        return NextResponse.redirect(
            getRedirectUrl("/kiosk/forgot-password?error=verification_failed")
        )
    }
}
