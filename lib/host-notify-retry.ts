/**
 * Retry helper for host email and SMS. Arrival notify runs in after(),
 * so a single SMTP connect timeout used to drop the email with no second try.
 *
 * Budget: 3 attempts, backoff of about 2s then 5s, connectionTimeout about 20s.
 * Worst case stays inside the after() window (about 90s).
 */

export const HOST_NOTIFY_MAX_ATTEMPTS = 3
export const HOST_NOTIFY_BACKOFF_MS = [2_000, 5_000] as const
export const HOST_NOTIFY_BUDGET_MS = 90_000

const TRANSIENT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ESOCKET",
  "ECONNECTION",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
])

const TIMEOUT_COMMANDS = new Set(["CONN", "EHLO", "LHLO", "STARTTLS", "GREETING"])

export interface NotifyRetryContext {
  signInId?: string | null
  notificationType: string
  channel: "email" | "sms"
}

export interface NotifyRetryOptions {
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  deadlineAt?: number
  maxAttempts?: number
  backoffMs?: readonly number[]
  onTransient?: (error: unknown) => void
}

type NotifyErrorShape = {
  code?: string
  command?: string
  responseCode?: number
  httpStatus?: number
  message?: string
  name?: string
}

function asNotifyError(error: unknown): NotifyErrorShape {
  if (!error || typeof error !== "object") {
    return { message: String(error) }
  }
  return error as NotifyErrorShape
}

/** Safe one-line summary. Never includes SMTP/Twilio credentials. */
export function notifyErrorMessage(error: unknown): string {
  const e = asNotifyError(error)
  const parts = [
    e.name && e.name !== "Error" ? e.name : null,
    e.code || null,
    e.command || null,
    typeof e.responseCode === "number" ? String(e.responseCode) : null,
    typeof e.httpStatus === "number" ? `http ${e.httpStatus}` : null,
    e.message || null,
  ].filter((part): part is string => Boolean(part))
  return parts.join(" ") || "unknown_error"
}

/**
 * Transient: connect/socket timeouts, connection drops, CONN/greeting
 * timeouts, SMTP 4xx, and Twilio 429/5xx. Permanent 5xx SMTP is never retried.
 */
export function isTransientNotifyError(error: unknown): boolean {
  const e = asNotifyError(error)

  if (typeof e.responseCode === "number") {
    if (e.responseCode >= 500 && e.responseCode < 600) return false
    if (e.responseCode >= 400 && e.responseCode < 500) return true
  }

  if (typeof e.httpStatus === "number") {
    if (e.httpStatus === 429 || e.httpStatus >= 500) return true
    if (e.httpStatus >= 400) return false
  }

  const code = String(e.code || "")
  if (code === "EENVELOPE" || code === "EMESSAGE") return false
  if (TRANSIENT_CODES.has(code)) return true

  const command = String(e.command || "").toUpperCase()
  const message = String(e.message || "")
  const timedOut = /timeout|timed out|never received/i.test(message)
  if (TIMEOUT_COMMANDS.has(command) && timedOut) return true
  if (e.name === "TimeoutError" || e.name === "AbortError") return true
  if (/ETIMEDOUT|ECONNRESET|ESOCKET|ECONNECTION/i.test(message)) return true
  return false
}

function hostNotifyLog(
  context: NotifyRetryContext,
  attempt: number,
  detail: string,
): void {
  const signIn = context.signInId || "none"
  console.log(
    `[Host Notify] sign_in=${signIn} type=${context.notificationType} channel=${context.channel} attempt=${attempt} ${detail}`,
  )
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function sendWithNotifyRetry<T>(
  context: NotifyRetryContext,
  send: () => Promise<T>,
  options: NotifyRetryOptions = {},
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const maxAttempts = options.maxAttempts ?? HOST_NOTIFY_MAX_ATTEMPTS
  const backoff = options.backoffMs ?? HOST_NOTIFY_BACKOFF_MS
  const deadlineAt = options.deadlineAt ?? now() + HOST_NOTIFY_BUDGET_MS

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    hostNotifyLog(context, attempt, "start")
    try {
      const result = await send()
      hostNotifyLog(context, attempt, "sent")
      return result
    } catch (error) {
      lastError = error
      const transient = isTransientNotifyError(error)
      hostNotifyLog(
        context,
        attempt,
        `${transient ? "transient_error" : "permanent_error"} ${notifyErrorMessage(error)}`,
      )
      if (!transient || attempt >= maxAttempts) {
        throw error
      }
      options.onTransient?.(error)
      const delay = backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0
      if (now() + delay >= deadlineAt) {
        hostNotifyLog(context, attempt, "budget_exhausted")
        throw error
      }
      hostNotifyLog(context, attempt, `retry_in_${delay}ms`)
      await sleep(delay)
    }
  }
  throw lastError
}
