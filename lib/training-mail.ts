import { escapeHtml, sanitizePlainText } from "@/lib/html-escape"
import { sendEmail } from "@/lib/email"
import { IT_SUPPORT, detailRow, emailButton as button, emailShell } from "@/lib/email-shell"

export interface TrainingLinkMailArgs {
  lang: "en" | "es"
  visitorFirstName: string
  hostName: string
  companyName: string
  siteName: string
  videoTitle: string
  watchUrl: string
  logoUrl?: string | null
}

export function renderTrainingLinkEmail(args: TrainingLinkMailArgs): { subject: string; html: string; text: string } {
  const first = sanitizePlainText(args.visitorFirstName, 80) || "there"
  const host = sanitizePlainText(args.hostName, 80) || "your host"
  const company = sanitizePlainText(args.companyName, 80) || "Talus Ag"
  const site = sanitizePlainText(args.siteName, 80) || "the site"
  const video = sanitizePlainText(args.videoTitle, 120) || "Site Safety Orientation"
  const url = sanitizePlainText(args.watchUrl, 500)

  if (args.lang === "es") {
    const subject = `Vea su video de seguridad de ${company} antes de llegar`
    const preheader = `3 minutos. Termínelo ahora y quedará autorizado. Sin video y sin código en ${site}.`
    const html = emailShell({
      lang: "es",
      preheader,
      logoUrl: args.logoUrl || "",
      bodyHtml: `<tr><td class="px" style="padding:20px 36px 0 36px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="tint g" bgcolor="#e2f4e9" style="background:#e2f4e9;border-radius:999px;padding:6px 12px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:16px;font-weight:700;color:#00703f;">Antes de llegar</td></tr></table></td></tr>
<tr><td class="px" style="padding:14px 36px 4px 36px;"><h1 class="t h1" style="margin:0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;color:#0f1a13;">Ahórrese la espera: vea su video de seguridad ahora</h1><p class="m" style="margin:8px 0 0 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#55625a;">Hola ${escapeHtml(first)}, ${escapeHtml(host)} lo invitó a <b class="t" style="color:#0f1a13;">${escapeHtml(company)}, ${escapeHtml(site)}</b>. Vea el video de seguridad en su teléfono antes de venir. Al terminarlo queda autorizado y no repite la capacitación al registrarse.</p></td></tr>
<tr><td class="px" style="padding:16px 36px 0 36px;"><table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f8f6" style="background:#f5f8f6;border:1px solid #dce6df;border-radius:12px;"><tr><td style="padding:8px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRow("Video", video)}${detailRow("Sitio", site)}${detailRow("Idioma", "Español o English")}${detailRow("Válido por", "12 meses después de terminarlo")}${detailRow("Al registrarse", "Use este correo. Sin video, sin código.")}</table></td></tr></table></td></tr>
${button(url, "Ver el video de seguridad")}
<tr><td class="px m" style="padding:10px 36px 24px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">Al terminar verá: <b class="t" style="color:#0f1a13;">Está autorizado.</b> Regístrese en el kiosco o con el código QR usando este correo y omitimos el video. No necesita código.</td></tr>`,
    })
    const text = [
      "Ahórrese la espera: vea su video de seguridad ahora",
      "",
      `Hola ${first}, ${host} lo invitó a ${company}, ${site}. Vea el video de seguridad en su teléfono antes de venir. Al terminarlo queda autorizado y no repite la capacitación al registrarse.`,
      "",
      `Video: ${video}`,
      `Sitio: ${site}`,
      "Válido por: 12 meses después de terminarlo",
      "Al registrarse: Use este correo. Sin video, sin código.",
      "",
      `Ver el video de seguridad: ${url}`,
      "",
      "Al terminar verá: \"Está autorizado.\" Regístrese en el kiosco o con el código QR usando este correo y omitimos el video. No necesita código.",
      "",
      "Talus Ag Visitor Management. Mensaje automático.",
      `¿Necesita ayuda? Escriba a IT Support en ${IT_SUPPORT}.`,
    ].join("\n")
    return { subject, html, text }
  }

  const subject = `Watch your ${company} safety video before you arrive`
  const preheader = `3 minutes. Finish it now and you are cleared. No video and no code at ${site}.`
  const html = emailShell({
    lang: "en",
    preheader,
    logoUrl: args.logoUrl || "",
    bodyHtml: `<tr><td class="px" style="padding:20px 36px 0 36px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="tint g" bgcolor="#e2f4e9" style="background:#e2f4e9;border-radius:999px;padding:6px 12px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:16px;font-weight:700;color:#00703f;">Before you arrive</td></tr></table></td></tr>
<tr><td class="px" style="padding:14px 36px 4px 36px;"><h1 class="t h1" style="margin:0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;color:#0f1a13;">Skip the line: watch your safety video now</h1><p class="m" style="margin:8px 0 0 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#55625a;">Hi ${escapeHtml(first)}, ${escapeHtml(host)} invited you to <b class="t" style="color:#0f1a13;">${escapeHtml(company)}, ${escapeHtml(site)}</b>. Watch the safety video on your phone before you come. When it ends you are cleared, and you skip training at sign in.</p></td></tr>
<tr><td class="px" style="padding:16px 36px 0 36px;"><table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f8f6" style="background:#f5f8f6;border:1px solid #dce6df;border-radius:12px;"><tr><td style="padding:8px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRow("Video", video)}${detailRow("Site", site)}${detailRow("Language", "English or Español")}${detailRow("Cleared for", "12 months after you finish")}${detailRow("At sign in", "Use this email. No video, no code.")}</table></td></tr></table></td></tr>
${button(url, "Watch the safety video")}
<tr><td class="px m" style="padding:10px 36px 24px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">When you finish you will see: <b class="t" style="color:#0f1a13;">You are cleared.</b> Sign in at the kiosk or by QR code with this email and we skip the video for you. No code needed.<br><br>¿Prefiere español? Abra el enlace y toque <b>ES</b>.</td></tr>`,
  })
  const text = [
    "Skip the line: watch your safety video now",
    "",
    `Hi ${first}, ${host} invited you to ${company}, ${site}. Watch the safety video on your phone before you come. When it ends you are cleared, and you skip training at sign in.`,
    "",
    `Video: ${video}`,
    `Site: ${site}`,
    "Language: English or Español",
    "Cleared for: 12 months after you finish",
    "At sign in: Use this email. No video, no code.",
    "",
    `Watch the safety video: ${url}`,
    "",
    "When you finish you will see: \"You are cleared.\" Sign in at the kiosk or by QR code with this email and we skip the video for you. No code needed.",
    "",
    "¿Prefiere español? Abra el enlace y toque ES.",
    "",
    "Talus Ag Visitor Management. This is an automated message.",
    `Need help? Contact IT Support at ${IT_SUPPORT}.`,
  ].join("\n")
  return { subject, html, text }
}

export interface TrainingCodeMailArgs {
  lang: "en" | "es"
  siteName: string
  code: string
  logoUrl?: string | null
}

export function renderTrainingCodeEmail(args: TrainingCodeMailArgs): { subject: string; html: string; text: string } {
  const site = sanitizePlainText(args.siteName, 80) || "the site"
  const code = sanitizePlainText(args.code, 6)
  const grouped = `${code.slice(0, 3)} ${code.slice(3)}`

  if (args.lang === "es") {
    const subject = `Su código de Talus Ag: ${grouped}`
    const preheader = `Ya tiene la capacitación de seguridad registrada. Escriba este código en el kiosco de ${site} para omitir el video. Vence en 30 minutos.`
    const html = emailShell({
      lang: "es",
      preheader,
      logoUrl: args.logoUrl || "",
      bodyHtml: `<tr><td class="px" style="padding:14px 36px 4px 36px;"><h1 class="t h1" style="margin:0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;color:#0f1a13;">Su código</h1><p class="m" style="margin:8px 0 0 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#55625a;">Escriba este código en el kiosco de <b class="t" style="color:#0f1a13;">${escapeHtml(site)}</b> para confirmar que es usted. Su capacitación de seguridad ya está registrada, así que omite el video.</p></td></tr>
<tr><td class="px" style="padding:20px 36px 0 36px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="code" bgcolor="#f5f8f6" style="background:#f5f8f6;border:2px dashed #00854c;border-radius:14px;padding:16px 28px;font-family:'Geist Mono',Consolas,'Courier New',monospace;font-size:36px;line-height:40px;letter-spacing:10px;font-weight:700;color:#0f1a13;">${escapeHtml(code)}</td></tr></table></td></tr>
<tr><td class="px m" style="padding:10px 36px 24px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">El código vence en 30 minutos y sirve una sola vez.<br><br>¿Por qué un código? Escribió un correo que ya completó la capacitación antes, sin enlace de capacitación. El código confirma que el correo es suyo.<br><br><b class="t" style="color:#0f1a13;">¿No está en un kiosco de Talus Ag?</b> No comparta este código. Puede ignorar este correo.</td></tr>`,
    })
    const text = [
      `Su código: ${code}`,
      "",
      `Escriba este código en el kiosco de ${site} para confirmar que es usted. Su capacitación de seguridad ya está registrada, así que omite el video.`,
      "El código vence en 30 minutos y sirve una sola vez.",
      "",
      "¿Por qué un código? Escribió un correo que ya completó la capacitación antes, sin enlace de capacitación. El código confirma que el correo es suyo.",
      "",
      "¿No está en un kiosco de Talus Ag? No comparta este código. Puede ignorar este correo.",
      "",
      "Talus Ag Visitor Management. Mensaje automático.",
      `¿Necesita ayuda? Escriba a IT Support en ${IT_SUPPORT}.`,
    ].join("\n")
    return { subject, html, text }
  }

  const subject = `Your Talus Ag sign-in code: ${grouped}`
  const preheader = `You already have safety training on file. Enter this code at the ${site} kiosk to skip the video. Expires in 30 minutes.`
  const html = emailShell({
    lang: "en",
    preheader,
    logoUrl: args.logoUrl || "",
    bodyHtml: `<tr><td class="px" style="padding:14px 36px 4px 36px;"><h1 class="t h1" style="margin:0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;color:#0f1a13;">Your sign-in code</h1><p class="m" style="margin:8px 0 0 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#55625a;">Enter this code at the <b class="t" style="color:#0f1a13;">${escapeHtml(site)}</b> kiosk to confirm it is you. Your safety training is already on file, so you skip the video.</p></td></tr>
<tr><td class="px" style="padding:20px 36px 0 36px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="code" bgcolor="#f5f8f6" style="background:#f5f8f6;border:2px dashed #00854c;border-radius:14px;padding:16px 28px;font-family:'Geist Mono',Consolas,'Courier New',monospace;font-size:36px;line-height:40px;letter-spacing:10px;font-weight:700;color:#0f1a13;">${escapeHtml(code)}</td></tr></table></td></tr>
<tr><td class="px m" style="padding:10px 36px 24px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">The code expires in 30 minutes and works once.<br><br>Why a code? You typed an email that finished training before, without a training link. The code proves the email is yours.<br><br><b class="t" style="color:#0f1a13;">Not at a Talus Ag kiosk right now?</b> Do not share this code. Someone may have typed your email by mistake. You can ignore this email.</td></tr>`,
  })
  const text = [
    `Your sign-in code: ${code}`,
    "",
    `Enter this code at the ${site} kiosk to confirm it is you. Your safety training is already on file, so you skip the video.`,
    "The code expires in 30 minutes and works once.",
    "",
    "Why a code? You typed an email that finished training before, without a training link. The code proves the email is yours.",
    "",
    "Not at a Talus Ag kiosk right now? Do not share this code. Someone may have typed your email by mistake. You can ignore this email.",
    "",
    "Talus Ag Visitor Management. This is an automated message.",
    `Need help? Contact IT Support at ${IT_SUPPORT}.`,
  ].join("\n")
  return { subject, html, text }
}

export async function sendTrainingLinkEmail(args: TrainingLinkMailArgs & { to: string }) {
  const rendered = renderTrainingLinkEmail(args)
  return sendEmail({ to: args.to, ...rendered })
}

export async function sendTrainingCodeEmail(args: TrainingCodeMailArgs & { to: string }) {
  const rendered = renderTrainingCodeEmail(args)
  return sendEmail({ to: args.to, ...rendered })
}

export function renderDisputeEmail(args: {
  visitorName: string
  hostName: string
  siteName: string
  company?: string | null
  badgeNumber?: string | null
  visitUrl: string
}): { subject: string; html: string; text: string } {
  const visitor = sanitizePlainText(args.visitorName, 120) || "A visitor"
  const host = sanitizePlainText(args.hostName, 80) || "A host"
  const site = sanitizePlainText(args.siteName, 80) || "a site"
  const company = sanitizePlainText(args.company, 80)
  const badge = sanitizePlainText(args.badgeNumber, 40)
  const subject = `${host} marked ${visitor} as not their visitor`
  const text = [
    `${host} opened the visit page and tapped "Not my visitor".`,
    "",
    `Visitor: ${visitor}`,
    company ? `Company: ${company}` : null,
    `Site: ${site}`,
    badge ? `Badge: ${badge}` : null,
    "",
    `Visit: ${args.visitUrl}`,
    "",
    "Talus Ag Visitor Management. This is an automated message.",
    `Need help? Contact IT Support at ${IT_SUPPORT}.`,
  ]
    .filter(Boolean)
    .join("\n")
  const html = emailShell({
    lang: "en",
    preheader: `${host} said ${visitor} is not their visitor at ${site}.`,
    logoUrl: "",
    bodyHtml: `<tr><td class="px" style="padding:14px 36px 4px 36px;"><h1 class="t h1" style="margin:0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;color:#0f1a13;">Not this host's visitor</h1><p class="m" style="margin:8px 0 0 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#55625a;">${escapeHtml(host)} opened the visit page and tapped <b>Not my visitor</b>.</p></td></tr>
<tr><td class="px" style="padding:16px 36px 0 36px;"><table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f8f6" style="background:#f5f8f6;border:1px solid #dce6df;border-radius:12px;"><tr><td style="padding:8px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRow("Visitor", visitor)}${company ? detailRow("Company", company) : ""}${detailRow("Site", site)}${badge ? detailRow("Badge", badge) : ""}</table></td></tr></table></td></tr>
${button(args.visitUrl, "Open visit details")}`,
  })
  return { subject, html, text }
}
