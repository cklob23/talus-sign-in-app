import { escapeHtml, sanitizeAppUrl, sanitizePlainText } from "@/lib/html-escape"
import {
  EMAIL_FOOTER_EN,
  detailRow,
  detailsPanel,
  emailButton,
  emailShell,
  formatMailClock,
  formatMailTime,
  headingBlock,
  pill,
} from "@/lib/email-shell"

export interface HostMailVisitor {
  visitorName: string
  visitorCompany?: string | null
  visitorTypeName?: string | null
  visitorPhotoUrl?: string | null
  purpose?: string | null
  badgeNumber?: string | null
  locationName?: string | null
  locationLabel?: string | null
  signedInBy?: string | null
  trainingLine?: string | null
  arrivedAt?: string | Date | null
  timeZone?: string | null
  visitUrl?: string | null
  logoUrl?: string | null
  appOrigin?: string | null
}

export function renderHostArrivalEmail(args: HostMailVisitor): { subject: string; html: string; text: string; preheader: string } {
  const visitor = sanitizePlainText(args.visitorName, 200) || "A visitor"
  const company = sanitizePlainText(args.visitorCompany, 200)
  const type = sanitizePlainText(args.visitorTypeName, 120)
  const site = sanitizePlainText(args.locationName, 200) || "the site"
  const place = sanitizePlainText(args.locationLabel, 200)
  const badge = sanitizePlainText(args.badgeNumber, 40)
  const purpose = sanitizePlainText(args.purpose, 300)
  const signedInBy = sanitizePlainText(args.signedInBy, 80) || "Kiosk"
  const training = sanitizePlainText(args.trainingLine, 200)
  const when = formatMailTime(args.arrivedAt ?? new Date(), args.timeZone)
  const clock = formatMailClock(args.arrivedAt ?? new Date(), args.timeZone)
  const first = visitor.split(" ")[0] || visitor
  const subject = `${visitor} is here (${site}, ${clock})`
  const preheader = [company && `${company}${type ? ` ${type.toLowerCase()}` : ""}`, place, badge && `Badge ${badge}`, training || "Signed in"]
    .filter(Boolean)
    .join(". ")
  const photo = /^https?:\/\//i.test(String(args.visitorPhotoUrl || ""))
    ? escapeHtml(String(args.visitorPhotoUrl))
    : ""
  const visitUrl = sanitizeAppUrl(args.visitUrl, args.appOrigin || undefined)

  const rows = [
    detailRow("Site", site),
    place ? detailRow("Location", place) : "",
    when ? detailRow("Arrived", when) : "",
    badge ? detailRow("Badge", `<span style="font-family:'Geist Mono',Consolas,monospace;">${escapeHtml(badge)}</span>`, true) : "",
    purpose ? detailRow("Purpose", purpose) : "",
    training ? detailRow("Training", training) : "",
    detailRow("Signed in by", signedInBy),
  ].join("")

  const html = emailShell({
    lang: "en",
    preheader,
    logoUrl: args.logoUrl || "",
    bodyHtml: `${pill("Visitor arrived")}
${headingBlock(`${visitor} is here to see you`, `Signed in at <b class="t" style="color:#0f1a13;">${escapeHtml(site)}</b>${clock ? ` at ${escapeHtml(clock)}` : ""}.`)}
<tr><td class="px" style="padding:18px 36px 0 36px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${photo ? `<td width="84" valign="top" style="width:84px;padding-right:16px;"><img src="${photo}" width="84" height="84" alt="Photo of ${escapeHtml(visitor)}" style="display:block;width:84px;height:84px;border-radius:42px;border:0;"></td>` : ""}<td valign="middle"><div class="t" style="font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;line-height:28px;font-weight:700;color:#0f1a13;">${escapeHtml(visitor)}</div><div class="m" style="font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:22px;color:#55625a;">${escapeHtml([company, type].filter(Boolean).join(" · "))}</div>${training ? `<div class="g" style="font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;font-weight:600;color:#00703f;margin-top:6px;">Safety training done</div>` : ""}</td></tr></table></td></tr>
${detailsPanel(rows)}
${visitUrl ? emailButton(visitUrl, "Open visit details") : ""}
${visitUrl ? `<tr><td class="px m" style="padding:10px 36px 24px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">Not expecting ${escapeHtml(first)}? Open the visit and tap <b>Not my visitor</b>.</td></tr>` : ""}`,
  })

  const text = [
    `${visitor} is here to see you`,
    `Signed in at ${site}${clock ? ` at ${clock}` : ""}.`,
    "",
    `Visitor: ${visitor}`,
    company ? `Company: ${company}` : null,
    type ? `Type: ${type}` : null,
    `Site: ${site}`,
    place ? `Location: ${place}` : null,
    when ? `Arrived: ${when}` : null,
    badge ? `Badge: ${badge}` : null,
    purpose ? `Purpose: ${purpose}` : null,
    training ? `Training: ${training}` : null,
    `Signed in by: ${signedInBy}`,
    visitUrl ? "" : null,
    visitUrl ? `Open visit details: ${visitUrl}` : null,
    visitUrl ? "" : null,
    visitUrl ? `Not expecting ${first}? Open the visit and tap "Not my visitor".` : null,
    "",
    EMAIL_FOOTER_EN,
  ]
    .filter((line) => line !== null)
    .join("\n")

  return { subject, html, text, preheader }
}

export function renderHostTrainingEmail(args: HostMailVisitor & { readyAbout?: string | null }): { subject: string; html: string; text: string; preheader: string } {
  const visitor = sanitizePlainText(args.visitorName, 200) || "A visitor"
  const company = sanitizePlainText(args.visitorCompany, 200)
  const type = sanitizePlainText(args.visitorTypeName, 120)
  const site = sanitizePlainText(args.locationName, 200) || "the site"
  const place = sanitizePlainText(args.locationLabel, 200)
  const purpose = sanitizePlainText(args.purpose, 300)
  const signedInBy = sanitizePlainText(args.signedInBy, 80) || "Kiosk"
  const when = formatMailTime(args.arrivedAt ?? new Date(), args.timeZone)
  const clock = formatMailClock(args.arrivedAt ?? new Date(), args.timeZone)
  const ready = sanitizePlainText(args.readyAbout, 80)
  const first = visitor.split(" ")[0] || visitor
  const subject = `${visitor} is arriving: safety training in progress`
  const readyPhrase = ready ? ` Ready in ${ready}.` : ""
  const preheader = `Started${clock ? ` at ${clock}` : ""} at ${site}.${readyPhrase}`
  const visitUrl = sanitizeAppUrl(args.visitUrl, args.appOrigin || undefined)

  const rows = [
    detailRow("Site", site),
    place ? detailRow("Location", place) : "",
    when ? detailRow("Started", when) : "",
    ready ? detailRow("Ready about", ready) : "",
    purpose ? detailRow("Purpose", purpose) : "",
    detailRow("Training", "In progress. Not cleared yet."),
    detailRow("Signing in by", signedInBy),
  ].join("")

  const html = emailShell({
    lang: "en",
    preheader,
    logoUrl: args.logoUrl || "",
    bodyHtml: `${pill("Training in progress")}
${headingBlock(`${visitor} is arriving`, `Watching the safety video at <b class="t" style="color:#0f1a13;">${escapeHtml(site)}</b>. We will email you again when they are signed in.`)}
<tr><td class="px" style="padding:18px 36px 0 36px;"><div class="t" style="font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;line-height:28px;font-weight:700;color:#0f1a13;">${escapeHtml(visitor)}</div><div class="m" style="font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:22px;color:#55625a;">${escapeHtml([company, type].filter(Boolean).join(" · "))}</div></td></tr>
${detailsPanel(rows)}
${visitUrl ? emailButton(visitUrl, "Open visit details") : ""}
${visitUrl ? `<tr><td class="px m" style="padding:10px 36px 24px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">Not expecting ${escapeHtml(first)}? Open the visit and tap <b>Not my visitor</b>.</td></tr>` : ""}`,
  })

  const text = [
    `${visitor} is arriving`,
    "They are watching the safety video. We will email you again when they are signed in.",
    "",
    `Visitor: ${visitor}`,
    company ? `Company: ${company}` : null,
    type ? `Type: ${type}` : null,
    `Site: ${site}`,
    place ? `Location: ${place}` : null,
    when ? `Started: ${when}` : null,
    ready ? `Ready about: ${ready}` : null,
    purpose ? `Purpose: ${purpose}` : null,
    "Training: In progress. Not cleared yet.",
    `Signing in by: ${signedInBy}`,
    visitUrl ? "" : null,
    visitUrl ? `Open visit details: ${visitUrl}` : null,
    visitUrl ? "" : null,
    visitUrl ? `Not expecting ${first}? Open the visit and tap "Not my visitor".` : null,
    "",
    EMAIL_FOOTER_EN,
  ]
    .filter((line) => line !== null)
    .join("\n")

  return { subject, html, text, preheader }
}
