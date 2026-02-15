import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getAdminClient } from "@/lib/supabase/server"
import { logAuditServer } from "@/lib/audit-log"
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
    companyName: s.company_name || "TalusAg",
    companyLogo: s.company_logo || "",
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated and is an admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { userId, email } = body

    if (!userId || !email) {
      return NextResponse.json({ error: "User ID and email are required" }, { status: 400 })
    }

    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Derive origin from the request so it works from localhost and production
    const requestOrigin = request.headers.get("origin")
      || request.headers.get("referer")?.replace(/\/[^/]*$/, "")
      || process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "https://signin.talusag.com")

    const redirectTo = `${requestOrigin}/kiosk/reset-password`

    // ------------------------------------------------------------------
    // generateLink creates a recovery token AND returns the action_link,
    // but does NOT send an email.  We rewrite the link to point to our
    // own /kiosk/reset-password page and send the email ourselves via
    // the configured SMTP so we have full control over the redirect URL.
    // ------------------------------------------------------------------
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[Reset Password] generateLink error:", linkError)
      return NextResponse.json(
        { error: linkError?.message || "Failed to generate recovery link" },
        { status: 500 },
      )
    }

    // The action_link from Supabase goes through their /auth/v1/verify
    // endpoint which then redirects to our redirectTo.  We use it as-is
    // because it carries the hashed_token that Supabase will exchange
    // for a session when the user clicks it.
    let resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/kiosk/reset-password`
    // ---------- send email via SMTP ----------
    const smtp = await getSmtpSettings()
    if (!smtp.host || !smtp.user || !smtp.pass) {
      console.error("[Reset Password] SMTP not configured")
      return NextResponse.json(
        { error: "SMTP is not configured. Please configure email settings first." },
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
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        ${smtp.companyLogo ? `<img src="${smtp.companyLogo}" alt="${smtp.companyName}" style="height:40px;margin-bottom:24px;" />` : `<h2 style="margin-bottom:24px;color:#333;">${smtp.companyName}</h2>`}
        <p style="font-size:16px;color:#333;">Hi,</p>
        <p style="font-size:14px;color:#555;line-height:1.6;">
          A password reset has been requested for your account. Click the button below to choose a new password.
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

    // Audit log
    await logAuditServer({
      supabase: getAdminClient(),
      userId: user.id,
      action: "password.reset_email_sent",
      entityType: "user",
      entityId: userId,
      description: `Password reset email sent to ${email}`,
      metadata: { targetEmail: email, method: "email" },
    })

    return NextResponse.json({
      success: true,
      message: "Password reset email sent successfully",
    })

  } catch (error) {
    console.error("Password reset error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reset password" },
      { status: 500 },
    )
  }
}
