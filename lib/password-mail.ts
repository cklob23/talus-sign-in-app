import { escapeHtml, sanitizeAppUrl, sanitizePlainText } from "@/lib/html-escape"
import { EMAIL_FOOTER_EN, emailButton, emailShell, headingBlock } from "@/lib/email-shell"

export function renderPasswordResetEmail(args: {
  email: string
  resetUrl: string
  logoUrl?: string | null
  appOrigin?: string
}): { subject: string; html: string; text: string } {
  const address = sanitizePlainText(args.email, 200)
  const url = sanitizeAppUrl(args.resetUrl, args.appOrigin)
  const subject = "Reset your Talus Ag Visitor Management password"
  const preheader = "Use the button inside within 24 hours. If you did not ask for this, ignore this email."
  const html = emailShell({
    lang: "en",
    preheader,
    logoUrl: args.logoUrl || "",
    bodyHtml: `${headingBlock("Reset your password", `We got a request to reset the password for <b class="t" style="color:#0f1a13;">${escapeHtml(address)}</b>.`)}
${url ? emailButton(url, "Choose a new password") : ""}
<tr><td class="px m" style="padding:10px 36px 24px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">This link works once and expires in 24 hours.<br>Did not ask for this? You can ignore this email. Your password stays the same. If you keep getting these, tell your administrator.</td></tr>`,
  })
  const text = [
    "Reset your password",
    "",
    `We got a request to reset the password for ${address}.`,
    "",
    url ? `Choose a new password: ${url}` : null,
    "",
    "This link works once and expires in 24 hours.",
    "Did not ask for this? You can ignore this email. Your password stays the same. If you keep getting these, tell your administrator.",
    "",
    EMAIL_FOOTER_EN,
  ]
    .filter((line) => line !== null)
    .join("\n")
  return { subject, html, text }
}
