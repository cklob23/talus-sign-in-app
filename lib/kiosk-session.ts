import { createHmac, timingSafeEqual } from "node:crypto"

export const KIOSK_SESSION_COOKIE = "kiosk-receptionist-session"
export const KIOSK_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24

export interface ReceptionistSession {
  id: string
  email: string
  name: string
  role: string
  loginAt: string
}

function resolveSessionSecret(secret?: string): string {
  const value = secret ?? process.env.KIOSK_SESSION_SECRET
  if (!value || value.length < 16) {
    throw new Error("KIOSK_SESSION_SECRET is not set or is too short (need at least 16 characters)")
  }
  return value
}

function toBase64Url(value: string | Buffer): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value
  return buf.toString("base64url")
}

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url")
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Sign a receptionist session as payload.signature (HMAC-SHA256). */
export function signReceptionistSession(session: ReceptionistSession, secret?: string): string {
  const key = resolveSessionSecret(secret)
  const payload = toBase64Url(JSON.stringify(session))
  return `${payload}.${hmac(payload, key)}`
}

/**
 * Verify a signed receptionist cookie.
 * Returns null when the cookie is missing, malformed, or the secret is unset.
 */
export function verifyReceptionistSession(
  cookieValue: string | undefined | null,
  secret?: string,
): ReceptionistSession | null {
  if (!cookieValue) return null

  let key: string
  try {
    key = resolveSessionSecret(secret)
  } catch {
    return null
  }

  const dot = cookieValue.lastIndexOf(".")
  if (dot <= 0) return null

  const payload = cookieValue.slice(0, dot)
  const signature = cookieValue.slice(dot + 1)
  if (!payload || !signature) return null

  const expected = hmac(payload, key)
  if (!safeEqual(signature, expected)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<ReceptionistSession>
    if (!parsed.id || typeof parsed.id !== "string") return null
    if (!parsed.email || typeof parsed.email !== "string") return null
    return {
      id: parsed.id,
      email: parsed.email,
      name: typeof parsed.name === "string" ? parsed.name : parsed.email,
      role: typeof parsed.role === "string" ? parsed.role : "staff",
      loginAt: typeof parsed.loginAt === "string" ? parsed.loginAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function receptionistCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: KIOSK_SESSION_MAX_AGE_SECONDS,
  }
}
