import { escapeHtml, sanitizeAppUrl, sanitizePlainText } from "@/lib/html-escape"
import { EMAIL_FOOTER_EN, emailButton, emailShell, headingBlock, pill } from "@/lib/email-shell"

export interface SignoutMailVisitor {
  name: string
  company?: string | null
  badge?: string | null
  signedInAt?: string | null
}

export function renderSignoutSummaryEmail(args: {
  kind: "auto" | "location"
  hostName: string
  locationName: string
  whenLabel: string
  visitors: SignoutMailVisitor[]
  reviewUrl?: string | null
  logoUrl?: string | null
  appOrigin?: string | null
}): { subject: string; html: string; text: string } {
  const site = sanitizePlainText(args.locationName, 200) || "the site"
  const when = sanitizePlainText(args.whenLabel, 120)
  const count = args.visitors.length
  const names = args.visitors.map((v) => sanitizePlainText(v.name, 120)).filter(Boolean)
  const previewNames = names.slice(0, 2).join(" and ")
  const subject =
    args.kind === "auto"
      ? `${count} visitor${count === 1 ? "" : "s"} auto signed out at ${site}`
      : `${site} site sign-out: ${count} of your visitor${count === 1 ? "" : "s"}`
  const preheader =
    args.kind === "auto"
      ? `${previewNames || "Your visitors"} ${count === 1 ? "was" : "were"} signed out${when ? ` at ${when}` : ""}. Still on site? Let us know.`
      : `The${when ? ` ${when}` : ""} site sign-out closed ${count} visit${count === 1 ? "" : "s"}. Still on site? Let us know.`

  const items = args.visitors
    .map((v) => {
      const name = sanitizePlainText(v.name, 120)
      const company = sanitizePlainText(v.company, 120)
      const badge = sanitizePlainText(v.badge, 40)
      const inAt = sanitizePlainText(v.signedInAt, 80)
      const bits = [company, badge ? `badge ${badge}` : "", inAt ? `in at ${inAt}` : ""].filter(Boolean).join(", ")
      return `<tr><td class="t" style="padding:8px 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#0f1a13;font-weight:600;">${escapeHtml(name)}</td></tr>${bits ? `<tr><td class="m" style="padding:0 0 8px 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#55625a;">${escapeHtml(bits)}</td></tr>` : ""}`
    })
    .join("")

  const reviewUrl = sanitizeAppUrl(args.reviewUrl, args.appOrigin || undefined)
  const html = emailShell({
    lang: "en",
    preheader,
    logoUrl: args.logoUrl || "",
    bodyHtml: `${pill(args.kind === "auto" ? "Automatic sign-out" : "Site sign-out")}
${headingBlock(
  `${count} of your visitor${count === 1 ? "" : "s"} ${count === 1 ? "was" : "were"} signed out`,
  `They were still signed in at <b class="t" style="color:#0f1a13;">${escapeHtml(site)}</b> when the ${args.kind === "auto" ? "daily automatic" : "scheduled site"} sign-out ran${when ? ` at ${escapeHtml(when)}` : ""}.`,
)}
<tr><td class="px" style="padding:16px 36px 0 36px;"><table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f8f6" style="background:#f5f8f6;border:1px solid #dce6df;border-radius:12px;"><tr><td style="padding:12px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table></td></tr></table></td></tr>
${reviewUrl ? emailButton(reviewUrl, "Review sign-outs") : ""}
<tr><td class="px m" style="padding:10px 36px 24px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">Anyone still on site? Mark them as still here so the site roster stays correct for safety and evacuations. You get this because you were their host.</td></tr>`,
  })

  const textLines = [
    `${count} of your visitor${count === 1 ? "" : "s"} ${count === 1 ? "was" : "were"} signed out`,
    `They were still signed in at ${site} when the ${args.kind === "auto" ? "daily automatic" : "scheduled site"} sign-out ran${when ? ` at ${when}` : ""}.`,
    "",
    ...args.visitors.map((v) => {
      const name = sanitizePlainText(v.name, 120)
      const company = sanitizePlainText(v.company, 120)
      const badge = sanitizePlainText(v.badge, 40)
      const inAt = sanitizePlainText(v.signedInAt, 80)
      return `- ${name}${company ? `, ${company}` : ""}${badge ? `, badge ${badge}` : ""}${inAt ? `, in at ${inAt}` : ""}`
    }),
    "",
    "Anyone still on site? Mark them as still here so the site roster stays correct for safety and evacuations.",
    reviewUrl ? reviewUrl : null,
    "",
    "You get this because you were their host.",
    "",
    EMAIL_FOOTER_EN,
  ]

  return { subject, html, text: textLines.filter((line) => line !== null).join("\n") }
}
