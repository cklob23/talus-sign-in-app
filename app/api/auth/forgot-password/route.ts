import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getAdminClient } from "@/lib/supabase/server"
import nodemailer from "nodemailer"
import { NextResponse } from "next/server"

/** Load SMTP + company branding from the settings table */
async function getSmtpSettings() {
    const supabase = getAdminClient()
    const { data } = await supabase
        .from("settings")
        .select("key, value")
        .is("location_id", null)
        .in("key", [
            "smtp_host", "smtp_port", "smtp_user", "smtp_pass",
            "smtp_from_email", "company_name", "company_logo",
        ])

    const s: Record<string, string> = {}
    if (data) for (const row of data) s[row.key] = String(row.value || "")

    return {
        host: s.smtp_host || process.env.SMTP_HOST || "",
        port: Number.parseInt(s.smtp_port || process.env.SMTP_PORT || "587", 10),
        user: s.smtp_user || process.env.SMTP_USER || "",
        pass: s.smtp_pass || process.env.SMTP_PASS || "",
        fromEmail: s.smtp_from_email || process.env.SMTP_FROM_EMAIL || s.smtp_user || process.env.SMTP_USER || "",
        companyName: s.company_name || "Talus Ag",
        companyLogo: s.company_logo || "",
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { email } = body

        if (!email || typeof email !== "string") {
            return NextResponse.json({ error: "Email is required" }, { status: 400 })
        }

        const adminClient = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        // Use generateLink to create a recovery token without sending Supabase's default email
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
            type: "recovery",
            email,
        })

        if (linkError || !linkData?.properties?.hashed_token) {
            // Don't reveal whether the email exists or not for security
            // Return success regardless to prevent email enumeration
            console.error("[Forgot Password] generateLink error:", linkError)
            return NextResponse.json({
                success: true,
                message: "If an account exists with that email, a reset link has been sent.",
            })
        }

        // Build a direct link to OUR verify-recovery endpoint (bypasses Supabase redirect entirely)
        const appOrigin = process.env.NEXT_PUBLIC_APP_URL
            || (process.env.VERCEL_PROJECT_PRODUCTION_URL
                ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
                : request.headers.get("origin")
                || "https://signin.talusag.com")

        const resetLink = `${appOrigin}/api/auth/verify-recovery?token=${encodeURIComponent(linkData.properties.hashed_token)}&type=recovery`

        // Send email via SMTP with company branding
        const smtp = await getSmtpSettings()
        if (!smtp.host || !smtp.user || !smtp.pass) {
            console.error("[Forgot Password] SMTP not configured")
            return NextResponse.json(
                { error: "Email service is not configured. Please contact your administrator." },
                { status: 500 },
            )
        }

        const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.port === 465,
            auth: { user: smtp.user, pass: smtp.pass },
        })

        const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        ${smtp.companyLogo ? `<img src="${smtp.companyLogo}" alt="${smtp.companyName}" style="height:40px;margin-bottom:24px;" />` : `<h2 style="margin-bottom:24px;color:#333;">${smtp.companyName}</h2>`}
        <p style="font-size:16px;color:#333;">Hi,</p>
        <p style="font-size:14px;color:#555;line-height:1.6;">
          We received a request to reset your password. Click the button below to choose a new password.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${resetLink}"
             style="display:inline-block;padding:12px 32px;background:#16a34a;color:#fff;
                    text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
            Reset Password
          </a>
        </div>
        <p style="font-size:12px;color:#888;line-height:1.5;">
          If you did not request this, you can safely ignore this email. This link will expire in 24 hours.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
        <p style="font-size:11px;color:#aaa;">${smtp.companyName} Visitor Management</p>
      </div>
    `

        await transporter.sendMail({
            from: `"${smtp.companyName}" <${smtp.fromEmail}>`,
            to: email,
            subject: `${smtp.companyName} Visitor Management - Reset Your Password`,
            html: htmlBody,
        })

        return NextResponse.json({
            success: true,
            message: "If an account exists with that email, a reset link has been sent.",
        })

    } catch (error) {
        console.error("[Forgot Password] Error:", error)
        // Always return success message to prevent email enumeration
        return NextResponse.json({
            success: true,
            message: "If an account exists with that email, a reset link has been sent.",
        })
    }
}
