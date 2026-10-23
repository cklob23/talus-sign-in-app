import { escapeHtml, sanitizeAppUrl, sanitizePlainText } from "@/lib/html-escape"
import {
  IT_SUPPORT,
  detailRow,
  detailsPanel,
  emailButton,
  emailShell,
  headingBlock,
  pill,
} from "@/lib/email-shell"
import { getTimezoneAbbreviation, resolveDisplayTimeZone, toIANATimezone } from "@/lib/timezone"

export type BookingInviteTraining =
  | { kind: "none" }
  | { kind: "cleared"; until: string }
  | { kind: "link"; watchUrl: string; videoTitle?: string | null }

export interface BookingInviteMailArgs {
  lang: "en" | "es"
  visitorFirstName: string
  hostName: string
  siteName: string
  expectedArrival: string | Date
  timezone?: string | null
  training: BookingInviteTraining
  logoUrl?: string | null
  appOrigin?: string
}

export function formatBookingWhen(iso: string | Date, timezone: string | null | undefined, lang: "en" | "es"): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const zone = toIANATimezone(resolveDisplayTimeZone(timezone))
  const locale = lang === "es" ? "es-US" : "en-US"
  const stamp = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
  return `${stamp} ${getTimezoneAbbreviation(zone)}`
}

export function renderBookingInviteEmail(args: BookingInviteMailArgs): { subject: string; html: string; text: string } {
  const first = sanitizePlainText(args.visitorFirstName, 80) || (args.lang === "es" ? "visitante" : "there")
  const host = sanitizePlainText(args.hostName, 80) || (args.lang === "es" ? "su anfitrión" : "your host")
  const site = sanitizePlainText(args.siteName, 80) || (args.lang === "es" ? "el sitio" : "the site")
  const when = formatBookingWhen(args.expectedArrival, args.timezone, args.lang)
  const watchUrl =
    args.training.kind === "link" ? sanitizeAppUrl(args.training.watchUrl, args.appOrigin) : ""

  if (args.lang === "es") {
    const subject = `Está registrado en ${site}`
    const preheader = when ? `${when}. Anfitrión: ${host}.` : `Anfitrión: ${host}.`
    const trainingHtml = trainingHtmlEs(args.training, watchUrl)
    const trainingText = trainingTextEs(args.training, watchUrl)
    const html = emailShell({
      lang: "es",
      preheader,
      logoUrl: args.logoUrl || "",
      bodyHtml: `${pill("Registro previo")}
${headingBlock("Está registrado", `Hola ${escapeHtml(first)}, ya tiene una visita reservada en <b class="t" style="color:#0f1a13;">${escapeHtml(site)}</b>.`)}
${detailsPanel(`${detailRow("Sitio", site)}${when ? detailRow("Cuándo", when) : ""}${detailRow("Anfitrión", host)}`)}
${trainingHtml}
<tr><td class="px" style="padding:20px 36px 24px 36px;"><p class="t" style="margin:0 0 8px 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;font-weight:700;color:#0f1a13;">Cómo registrarse</p><p class="m" style="margin:0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#55625a;">En el kiosco, toque <b class="t" style="color:#0f1a13;">Tengo una reserva</b> y escriba este correo.<br>O escanee el código QR en recepción.</p></td></tr>`,
    })
    const text = [
      "Está registrado",
      "",
      `Hola ${first}, ya tiene una visita reservada en ${site}.`,
      `Sitio: ${site}`,
      when ? `Cuándo: ${when}` : null,
      `Anfitrión: ${host}`,
      "",
      ...trainingText,
      "Cómo registrarse",
      "En el kiosco, toque Tengo una reserva y escriba este correo.",
      "O escanee el código QR en recepción.",
      "",
      "Talus Ag Visitor Management. Mensaje automático.",
      `¿Necesita ayuda? Escriba a IT Support en ${IT_SUPPORT}.`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
    return { subject, html, text }
  }

  const subject = `You are registered at ${site}`
  const preheader = when ? `${when}. Host: ${host}.` : `Host: ${host}.`
  const trainingHtml = trainingHtmlEn(args.training, watchUrl)
  const trainingText = trainingTextEn(args.training, watchUrl)
  const html = emailShell({
    lang: "en",
    preheader,
    logoUrl: args.logoUrl || "",
    bodyHtml: `${pill("Pre-registration")}
${headingBlock("You are registered", `Hi ${escapeHtml(first)}, you have a visit booked at <b class="t" style="color:#0f1a13;">${escapeHtml(site)}</b>.`)}
${detailsPanel(`${detailRow("Site", site)}${when ? detailRow("When", when) : ""}${detailRow("Host", host)}`)}
${trainingHtml}
<tr><td class="px" style="padding:20px 36px 24px 36px;"><p class="t" style="margin:0 0 8px 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;font-weight:700;color:#0f1a13;">How to sign in</p><p class="m" style="margin:0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#55625a;">At the kiosk, tap <b class="t" style="color:#0f1a13;">I have a booking</b> and enter this email.<br>Or scan the QR code at reception.</p></td></tr>`,
  })
  const text = [
    "You are registered",
    "",
    `Hi ${first}, you have a visit booked at ${site}.`,
    "",
    `Site: ${site}`,
    when ? `When: ${when}` : "",
    `Host: ${host}`,
    "",
    ...trainingText,
    "How to sign in",
    "At the kiosk, tap I have a booking and enter this email.",
    "Or scan the QR code at reception.",
    "",
    "Talus Ag Visitor Management. This is an automated message.",
    `Need help? Contact IT Support at ${IT_SUPPORT}.`,
  ]
    .filter((line) => line !== "")
    .join("\n")
  return { subject, html, text }
}

function trainingHtmlEn(training: BookingInviteTraining, watchUrl: string): string {
  if (training.kind === "none") return ""
  if (training.kind === "cleared") {
    const until = training.until
      ? `Your safety training is cleared until <b class="t" style="color:#0f1a13;">${escapeHtml(training.until)}</b>.`
      : "Your safety training is cleared."
    return `<tr><td class="px m" style="padding:16px 36px 0 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#55625a;">${until}</td></tr>`
  }
  const video = sanitizePlainText(training.videoTitle, 120)
  return `<tr><td class="px m" style="padding:16px 36px 0 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#55625a;">Please watch the safety video before you arrive${video ? `: <b class="t" style="color:#0f1a13;">${escapeHtml(video)}</b>` : "."}</td></tr>
${watchUrl ? emailButton(watchUrl, "Watch the safety video") : ""}`
}

function trainingHtmlEs(training: BookingInviteTraining, watchUrl: string): string {
  if (training.kind === "none") return ""
  if (training.kind === "cleared") {
    const until = training.until
      ? `Su capacitación de seguridad está vigente hasta <b class="t" style="color:#0f1a13;">${escapeHtml(training.until)}</b>.`
      : "Su capacitación de seguridad está vigente."
    return `<tr><td class="px m" style="padding:16px 36px 0 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#55625a;">${until}</td></tr>`
  }
  const video = sanitizePlainText(training.videoTitle, 120)
  return `<tr><td class="px m" style="padding:16px 36px 0 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#55625a;">Vea el video de seguridad antes de llegar${video ? `: <b class="t" style="color:#0f1a13;">${escapeHtml(video)}</b>` : "."}</td></tr>
${watchUrl ? emailButton(watchUrl, "Ver el video de seguridad") : ""}`
}

function trainingTextEn(training: BookingInviteTraining, watchUrl: string): string[] {
  if (training.kind === "none") return []
  if (training.kind === "cleared") {
    return [training.until ? `Your safety training is cleared until ${training.until}.` : "Your safety training is cleared.", ""]
  }
  return [
    "Please watch the safety video before you arrive.",
    watchUrl ? `Watch the safety video: ${watchUrl}` : "",
    "",
  ]
}

function trainingTextEs(training: BookingInviteTraining, watchUrl: string): string[] {
  if (training.kind === "none") return []
  if (training.kind === "cleared") {
    return [training.until ? `Su capacitación de seguridad está vigente hasta ${training.until}.` : "Su capacitación de seguridad está vigente.", ""]
  }
  return [
    "Vea el video de seguridad antes de llegar.",
    watchUrl ? `Ver el video de seguridad: ${watchUrl}` : "",
    "",
  ]
}

export async function sendBookingInviteEmail(args: BookingInviteMailArgs & { to: string }) {
  const { sendEmail } = await import("@/lib/email")
  const rendered = renderBookingInviteEmail(args)
  return sendEmail({ to: args.to, ...rendered })
}
