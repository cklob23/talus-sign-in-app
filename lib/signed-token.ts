import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * HMAC-signed, expiring tokens for public pages (training links and host
 * visit pages). Uses KIOSK_SESSION_SECRET with a per-kind domain prefix so a
 * training ticket, receptionist cookie, training link, or visit token can
 * never be confused with one another.
 */

export type SignedTokenKind = "training_link" | "visit" | "training_code"

const DOMAINS: Record<SignedTokenKind, string> = {
  training_link: "talus-training-link:v1",
  visit: "talus-visit:v1",
  training_code: "talus-training-code:v1",
}

export const TRAINING_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const VISIT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const TRAINING_CODE_PROOF_TTL_MS = 30 * 60 * 1000

function resolveSecret(secret?: string): string {
  const value = secret ?? process.env.KIOSK_SESSION_SECRET
  if (!value || value.length < 16) {
    throw new Error("KIOSK_SESSION_SECRET is not set or is too short (need at least 16 characters)")
  }
  return value
}

function sign(domain: string, payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${domain}.${payload}`).digest("base64url")
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function issueSignedToken<T extends Record<string, unknown>>(opts: {
  kind: SignedTokenKind
  payload: T
  expiresAt: number
  issuedAt?: number
  secret?: string
}): string {
  const key = resolveSecret(opts.secret)
  const body = {
    v: 1 as const,
    k: opts.kind,
    iat: opts.issuedAt ?? Date.now(),
    exp: opts.expiresAt,
    p: opts.payload,
  }
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url")
  return `${encoded}.${sign(DOMAINS[opts.kind], encoded, key)}`
}

export type ReadSignedTokenResult<T> =
  | { ok: true; payload: T; issuedAt: number; expiresAt: number }
  | { ok: false; reason: "invalid" | "expired" }

export function readSignedToken<T extends Record<string, unknown>>(
  token: unknown,
  kind: SignedTokenKind,
  opts?: { now?: number; secret?: string },
): ReadSignedTokenResult<T> {
  if (typeof token !== "string" || token.length < 16 || token.length > 4096) {
    return { ok: false, reason: "invalid" }
  }
  let key: string
  try {
    key = resolveSecret(opts?.secret)
  } catch {
    return { ok: false, reason: "invalid" }
  }
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return { ok: false, reason: "invalid" }
  const encoded = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!signature || !safeEqual(signature, sign(DOMAINS[kind], encoded, key))) {
    return { ok: false, reason: "invalid" }
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      v?: unknown
      k?: unknown
      iat?: unknown
      exp?: unknown
      p?: unknown
    }
    if (parsed.v !== 1 || parsed.k !== kind) return { ok: false, reason: "invalid" }
    if (typeof parsed.iat !== "number" || !Number.isFinite(parsed.iat)) return { ok: false, reason: "invalid" }
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return { ok: false, reason: "invalid" }
    if (!parsed.p || typeof parsed.p !== "object") return { ok: false, reason: "invalid" }
    const now = opts?.now ?? Date.now()
    if (now > parsed.exp) return { ok: false, reason: "expired" }
    return {
      ok: true,
      payload: parsed.p as T,
      issuedAt: parsed.iat,
      expiresAt: parsed.exp,
    }
  } catch {
    return { ok: false, reason: "invalid" }
  }
}
