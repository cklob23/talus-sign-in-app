import nodemailer from "nodemailer"

export const SMTP_CONNECTION_TIMEOUT_MS = 20_000
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

/** Shared nodemailer options. Connection gets about 20s; retries cover blips. */
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

/** Drop a pooled transporter after a connect timeout so the next try is fresh. */
export function resetSharedTransporter(): void {
  if (!cached) return
  try {
    cached.transporter.close()
  } catch {
    // ignore close errors on a dead socket
  }
  cached = null
}

export const TWILIO_TIMEOUT_MS = 10_000
