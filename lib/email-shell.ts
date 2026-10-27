import { escapeHtml } from "@/lib/html-escape"
import { formatDateTimeWithZone, resolveDisplayTimeZone, toIANATimezone } from "@/lib/timezone"

export const IT_SUPPORT = "it_support@talusag.com"

export const EMAIL_FOOTER_EN =
  `Talus Ag Visitor Management. This is an automated message.\nNeed help? Contact IT Support at ${IT_SUPPORT}.`

export const EMAIL_FOOTER_ES =
  `Talus Ag Visitor Management. Mensaje automático.\n¿Necesita ayuda? Escriba a IT Support en ${IT_SUPPORT}.`

function preheaderPad(text: string): string {
  return `${escapeHtml(text)}${"&#8199;&#847;".repeat(8)}`
}

export function emailShell(args: {
  lang: "en" | "es"
  preheader: string
  logoUrl: string
  bodyHtml: string
  colorScheme?: "light-dark" | "light-only"
}): string {
  const footer =
    args.lang === "es"
      ? `Talus Ag Visitor Management. Mensaje automático.<br>¿Necesita ayuda? Escriba a IT Support en <a class="g" href="mailto:${IT_SUPPORT}" style="color:#00703f;text-decoration:underline;font-weight:600;">${IT_SUPPORT}</a>.`
      : `Talus Ag Visitor Management. This is an automated message.<br>Need help? Contact IT Support at <a class="g" href="mailto:${IT_SUPPORT}" style="color:#00703f;text-decoration:underline;font-weight:600;">${IT_SUPPORT}</a>.`

  const lightOnly = args.colorScheme === "light-only"
  const scheme = lightOnly ? "light only" : "light dark"
  const supported = lightOnly ? "light" : "light dark"
  const darkMedia = lightOnly
    ? ""
    : `@media (prefers-color-scheme: dark){
 .bg{background:#0a110d!important} .card{background:#111a15!important;border-color:#263429!important}
 .t{color:#e8efea!important} .m{color:#a0afa5!important} .g{color:#4fd68f!important}
 .panel{background:#17231c!important;border-color:#263429!important} .tint{background:#123a26!important}
 .warnp{background:#3a2a0e!important} .w{color:#f6b44c!important} .line{border-color:#263429!important}
 .code{background:#17231c!important;color:#e8efea!important;border-color:#4fd68f!important}
}
`
  const rtRules = `.rt{border-collapse:collapse;table-layout:auto;width:100%;max-width:528px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;color:#0f1a13;background-color:#ffffff}
.rt th,.rt td{border:1px solid #dce6df;padding:4px 6px;text-align:left;vertical-align:top;color:#0f1a13;background-color:#ffffff;word-break:normal;overflow-wrap:normal}
.rt th{background:#f5f8f6;font-weight:700;white-space:normal}
.rt .rt-em{display:block;word-break:normal;overflow-wrap:anywhere}
.rt .rt-time,.rt .rt-host{white-space:normal;min-width:64px;word-break:normal;overflow-wrap:normal}
`

  return `<!DOCTYPE html><html lang="${args.lang}" xmlns:v="urn:schemas-microsoft-com:vml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="${scheme}"><meta name="supported-color-schemes" content="${supported}"><title></title><style>
:root{color-scheme:${scheme};supported-color-schemes:${supported}}
${darkMedia}${rtRules}@media (max-width:480px){.px{padding-left:20px!important;padding-right:20px!important}.rt-box{padding-left:12px!important;padding-right:12px!important}.rt th,.rt td{padding:3px 3px!important}.h1{font-size:24px!important;line-height:30px!important}.stk{display:block!important;width:100%!important}.btnw{width:100%!important}td.stk.m{padding-bottom:0!important;padding-top:12px!important}td.stk.t{padding-top:2px!important}}
</style></head>
<body class="bg" style="margin:0;padding:0;background:#eef4f0;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheaderPad(args.preheader)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef4f0" style="background:#eef4f0;"><tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;background:#ffffff;border:1px solid #dce6df;border-radius:16px;">
<tr><td height="6" bgcolor="#00b162" style="height:6px;line-height:6px;font-size:0;background:#00b162;border-radius:16px 16px 0 0;">&nbsp;</td></tr>
<tr><td class="px" style="padding:24px 36px 4px 36px;">
${args.logoUrl ? `<img src="${escapeHtml(args.logoUrl)}" width="124" alt="Talus Ag" style="display:block;border:0;width:124px;margin-left:-6px;height:auto;">` : `<div class="t" style="font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#0f1a13;">Talus Ag</div>`}
</td></tr>
${args.bodyHtml}
<tr><td class="px" style="padding:0 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="line" style="border-top:1px solid #dce6df;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td class="px m" style="padding:18px 36px 26px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#55625a;">${footer}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`
}

export function detailRow(label: string, value: string, htmlValue = false): string {
  const safeValue = htmlValue ? value : escapeHtml(value)
  return `<tr><td class="m stk" valign="top" style="padding:9px 12px 9px 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#55625a;width:132px;">${escapeHtml(label)}</td><td class="t stk" valign="top" style="padding:9px 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:20px;color:#0f1a13;font-weight:600;">${safeValue}</td></tr>`
}

/** Escape a href for the button. Never slice or cap the URL. */
export function emailButton(href: string, label: string): string {
  return `<tr><td class="px" style="padding:24px 36px 8px 36px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btnw"><tr><td align="center" bgcolor="#00854c" style="border-radius:12px;background:#00854c;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtml(href)}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="24%" stroke="f" fillcolor="#00854c"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escapeHtml(label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${escapeHtml(href)}" style="display:inline-block;padding:15px 28px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a><!--<![endif]--></td></tr></table></td></tr>`
}

export function headingBlock(title: string, subtitleHtml: string): string {
  return `<tr><td class="px" style="padding:14px 36px 4px 36px;"><h1 class="t h1" style="margin:0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;color:#0f1a13;">${escapeHtml(title)}</h1><p class="m" style="margin:8px 0 0 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#55625a;">${subtitleHtml}</p></td></tr>`
}

export function pill(label: string): string {
  return `<tr><td class="px" style="padding:20px 36px 0 36px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="tint g" bgcolor="#e2f4e9" style="background:#e2f4e9;border-radius:999px;padding:6px 12px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:16px;font-weight:700;color:#00703f;">${escapeHtml(label)}</td></tr></table></td></tr>`
}

export function detailsPanel(rowsHtml: string): string {
  return `<tr><td class="px" style="padding:16px 36px 0 36px;"><table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f8f6" style="background:#f5f8f6;border:1px solid #dce6df;border-radius:12px;"><tr><td style="padding:8px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}</table></td></tr></table></td></tr>`
}

function mailDate(iso: string | Date | undefined): Date | null {
  const date = iso instanceof Date ? iso : iso ? new Date(iso) : new Date()
  return Number.isNaN(date.getTime()) ? null : date
}

/** Full stamp for email body rows, matching the /visit Arrived line. */
export function formatMailTime(iso: string | Date | undefined, timeZone?: string | null): string {
  const date = mailDate(iso)
  if (!date) return ""
  return formatDateTimeWithZone(date.toISOString(), resolveDisplayTimeZone(timeZone))
}

/** Subject/preheader clock: "9:13 AM EDT". Missing timezone falls back to America/New_York. */
export function formatMailClock(iso: string | Date | undefined, timeZone?: string | null): string {
  const date = mailDate(iso)
  if (!date) return ""
  const zone = toIANATimezone(resolveDisplayTimeZone(timeZone))
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date)
}
