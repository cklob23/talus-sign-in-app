import nodemailer from "nodemailer"
import { getAdminClient } from "@/lib/supabase/server"

/**
 * Shared transactional email sender.
 *
 * The NDA countersign flow needs to send mail with a PDF attachment from
 * several server routes, so the SMTP wiring that used to live inline in the
 * notify-host route is centralised here. Settings come from the same DB-first,
 * env-fallback source the rest of the app already uses, so a single SMTP
 * configuration drives every message.
 */

export interface SmtpConfig {
    host: string
    port: number
    user: string
    pass: string
    fromEmail: string
    companyName: string
}

export async function getSmtpConfig(): Promise<SmtpConfig> {
    const admin = getAdminClient()
    const { data } = await admin
        .from("settings")
        .select("key, value")
        .is("location_id", null)
        .in("key", ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_email", "company_name"])

    const s: Record<string, string> = {}
    for (const row of data ?? []) s[row.key] = String(row.value ?? "")

    const user = s.smtp_user || process.env.SMTP_USER || ""
    return {
        host: s.smtp_host || process.env.SMTP_HOST || "",
        port: Number.parseInt(s.smtp_port || process.env.SMTP_PORT || "587", 10),
        user,
        pass: s.smtp_pass || process.env.SMTP_PASS || "",
        fromEmail: s.smtp_from_email || process.env.SMTP_FROM_EMAIL || user,
        companyName: s.company_name || "Talus Ag",
    }
}

export interface MailAttachment {
    filename: string
    content: Buffer | Uint8Array
    contentType?: string
}

export interface SendEmailArgs {
    to: string | string[]
    subject: string
    html: string
    text?: string
    attachments?: MailAttachment[]
}

/**
 * Sends an email, returning a soft result rather than throwing.
 *
 * Callers in the NDA flow already have a signed record on disk; a mail failure
 * must be surfaced and logged but never roll back the signature itself.
 */
export async function sendEmail(args: SendEmailArgs): Promise<{ sent: boolean; reason?: string }> {
    const cfg = await getSmtpConfig()
    if (!cfg.host || !cfg.user || !cfg.pass || !cfg.fromEmail) {
        console.log("[v0] Email skipped: SMTP not configured")
        return { sent: false, reason: "smtp_not_configured" }
    }

    const recipients = (Array.isArray(args.to) ? args.to : [args.to]).map((r) => r.trim()).filter(Boolean)
    if (recipients.length === 0) return { sent: false, reason: "no_recipients" }

    try {
        const transporter = nodemailer.createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.port === 465,
            auth: { user: cfg.user, pass: cfg.pass },
        })

        await transporter.sendMail({
            from: `"${cfg.companyName}" <${cfg.fromEmail}>`,
            to: recipients.join(", "),
            subject: args.subject,
            html: args.html,
            text: args.text,
            attachments: args.attachments?.map((a) => ({
                filename: a.filename,
                content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
                contentType: a.contentType,
            })),
        })
        return { sent: true }
    } catch (error) {
        console.log("[v0] Email send failed:", error instanceof Error ? error.message : error)
        return { sent: false, reason: "send_failed" }
    }
}

/** A minimal branded wrapper so NDA emails look consistent without duplicating markup. */
export function renderEmailShell(args: {
    companyName: string
    heading: string
    accent?: string
    bodyHtml: string
}): string {
    const accent = args.accent ?? "#059669"
    return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f3f4f6;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr><td style="background:${accent};padding:28px 30px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;font-weight:600;">${args.heading}</h1>
          </td></tr>
          <tr><td style="background:#fff;padding:30px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;color:#374151;font-size:15px;">
            ${args.bodyHtml}
          </td></tr>
          <tr><td style="background:#f9fafb;padding:18px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">Automated message from ${args.companyName} Visitor Management</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}
