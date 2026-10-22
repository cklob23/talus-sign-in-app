import nodemailer from "nodemailer"

export const SMTP_CONNECTION_TIMEOUT_MS = 10_000
export const SMTP_GREETING_TIMEOUT_MS = 10_000
export const SMTP_SOCKET_TIMEOUT_MS = 20_000

export interface SmtpAuthConfig {
  host: string
  port: number
  user: string
  pass: string
}

type MailTransporter = ReturnType<typeof nodemailer.createTransport>

let cached: { key: string; transporter: MailTransporter } | null = null

/** Shared nodemailer options: short timeouts so a hung SMTP host cannot pin the request. */
export function smtpTransportOptions(cfg: SmtpAuthConfig) {
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  }
}

/**
 * Reuse one pooled transporter per SMTP target. Safe across requests in the
 * same Node process; a settings change (host/user/port) builds a new one.
 */
export function getSharedTransporter(cfg: SmtpAuthConfig): MailTransporter | null {
  if (!cfg.host || !cfg.user || !cfg.pass) return null
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`
  if (cached?.key === key) return cached.transporter
  const transporter = nodemailer.createTransport(smtpTransportOptions(cfg))
  cached = { key, transporter }
  return transporter
}

export const TWILIO_TIMEOUT_MS = 10_000
