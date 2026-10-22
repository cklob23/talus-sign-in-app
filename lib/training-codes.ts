import { createHash, randomInt, timingSafeEqual } from "node:crypto"
import {
  TRAINING_CODE_PROOF_TTL_MS,
  issueSignedToken,
  readSignedToken,
} from "@/lib/signed-token"
import { normalizeVisitorEmail } from "@/lib/training-clearance"

export const TRAINING_CODE_TTL_MS = 30 * 60 * 1000
export const TRAINING_CODE_MAX_ATTEMPTS = 5
export const TRAINING_CODE_ISSUE_LIMIT = 3
export const TRAINING_CODE_ISSUE_WINDOW_MS = 30 * 60 * 1000

type AnyClient = {
  from: (table: string) => any
}

export interface TrainingCodeRow {
  id: string
  email_normalized: string
  visitor_type_id: string
  location_id: string | null
  code_hash: string
  expires_at: string
  used_at: string | null
  attempts: number
  created_at: string
}

export interface IssuedTrainingCode {
  code: string
  expiresAt: string
  id: string
}

function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex")
}

function parseStoredHash(stored: string): { salt: string; digest: string } | null {
  const sep = stored.indexOf("$")
  if (sep <= 0) return null
  return { salt: stored.slice(0, sep), digest: stored.slice(sep + 1) }
}

function storeHash(code: string): string {
  const salt = createHash("sha256").update(`${Date.now()}:${randomInt(1e9)}`).digest("hex").slice(0, 32)
  return `${salt}$${hashCode(code, salt)}`
}

function codesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function generateTrainingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export function hashTrainingCode(code: string): string {
  return storeHash(code)
}

export function verifyTrainingCodeHash(code: string, stored: string): boolean {
  const parsed = parseStoredHash(stored)
  if (!parsed) return false
  return codesEqual(hashCode(code, parsed.salt), parsed.digest)
}

export function normalizeTrainingCode(value: unknown): string | null {
  if (typeof value !== "string") return null
  const digits = value.replace(/\s+/g, "")
  if (!/^\d{6}$/.test(digits)) return null
  return digits
}

export async function issueTrainingCode(
  admin: AnyClient,
  args: {
    email: string
    visitorTypeId: string
    locationId?: string | null
    now?: number
    secret?: string
  },
): Promise<
  | { ok: true; issued: IssuedTrainingCode }
  | { ok: false; reason: "invalid_email" | "rate_limited" | "store_failed"; message: string }
> {
  const email = normalizeVisitorEmail(args.email)
  if (!email) return { ok: false, reason: "invalid_email", message: "A valid email is required." }

  const now = args.now ?? Date.now()
  const windowStart = new Date(now - TRAINING_CODE_ISSUE_WINDOW_MS).toISOString()
  const { data: recent, error: recentError } = await admin
    .from("training_codes")
    .select("id, created_at")
    .eq("email_normalized", email)
    .eq("visitor_type_id", args.visitorTypeId)
    .gte("created_at", windowStart)
    .limit(10)

  if (recentError && recentError.code !== "42P01") {
    return { ok: false, reason: "store_failed", message: "Could not send a code right now." }
  }
  if (Array.isArray(recent) && recent.length >= TRAINING_CODE_ISSUE_LIMIT) {
    return {
      ok: false,
      reason: "rate_limited",
      message: "We already sent a code. Wait a few minutes, or watch the video.",
    }
  }

  const code = generateTrainingCode()
  const expiresAt = new Date(now + TRAINING_CODE_TTL_MS).toISOString()
  const row = {
    email_normalized: email,
    visitor_type_id: args.visitorTypeId,
    location_id: args.locationId || null,
    code_hash: hashTrainingCode(code),
    expires_at: expiresAt,
    used_at: null,
    attempts: 0,
  }
  const { data, error } = await admin.from("training_codes").insert(row).select("id").single()
  if (error || !data?.id) {
    return { ok: false, reason: "store_failed", message: "Could not send a code right now." }
  }
  return { ok: true, issued: { code, expiresAt, id: data.id } }
}

export type VerifyTrainingCodeResult =
  | { ok: true; proof: string }
  | {
      ok: false
      reason: "invalid" | "expired" | "used" | "locked" | "store_failed"
      message: string
    }

export async function verifyTrainingCode(
  admin: AnyClient,
  args: {
    email: string
    visitorTypeId: string
    code: string
    now?: number
    secret?: string
  },
): Promise<VerifyTrainingCodeResult> {
  const email = normalizeVisitorEmail(args.email)
  const code = normalizeTrainingCode(args.code)
  if (!email || !code) {
    return { ok: false, reason: "invalid", message: "Enter the 6 digit code from your email." }
  }

  const now = args.now ?? Date.now()
  const { data: rows, error } = await admin
    .from("training_codes")
    .select("id, email_normalized, visitor_type_id, code_hash, expires_at, used_at, attempts")
    .eq("email_normalized", email)
    .eq("visitor_type_id", args.visitorTypeId)
    .order("created_at", { ascending: false })
    .limit(5)

  if (error) {
    return { ok: false, reason: "store_failed", message: "Could not check that code. Watch the video instead." }
  }
  const row = Array.isArray(rows) ? (rows[0] as TrainingCodeRow | undefined) : undefined
  if (!row) {
    return { ok: false, reason: "invalid", message: "That code is not valid. Watch the video, or request a new code." }
  }

  if (row.used_at) {
    return { ok: false, reason: "used", message: "That code was already used. Watch the video, or request a new code." }
  }
  if (row.attempts >= TRAINING_CODE_MAX_ATTEMPTS) {
    return {
      ok: false,
      reason: "locked",
      message: "Too many tries. Watch the safety video to continue.",
    }
  }
  if (new Date(row.expires_at).getTime() < now) {
    return { ok: false, reason: "expired", message: "That code expired. Watch the video, or request a new code." }
  }

  if (!verifyTrainingCodeHash(code, row.code_hash)) {
    await admin
      .from("training_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id)
    const nextAttempts = row.attempts + 1
    if (nextAttempts >= TRAINING_CODE_MAX_ATTEMPTS) {
      return {
        ok: false,
        reason: "locked",
        message: "Too many tries. Watch the safety video to continue.",
      }
    }
    return { ok: false, reason: "invalid", message: "That code is not right. Try again, or watch the video." }
  }

  await admin
    .from("training_codes")
    .update({ used_at: new Date(now).toISOString() })
    .eq("id", row.id)

  const proof = issueSignedToken({
    kind: "training_code",
    payload: {
      email,
      visitorTypeId: args.visitorTypeId,
      codeId: row.id,
    },
    issuedAt: now,
    expiresAt: now + TRAINING_CODE_PROOF_TTL_MS,
    secret: args.secret,
  })
  return { ok: true, proof }
}

export function readTrainingCodeProof(
  token: unknown,
  opts?: { email?: string; visitorTypeId?: string; now?: number; secret?: string },
): { ok: true } | { ok: false; reason: "invalid" | "expired" } {
  const read = readSignedToken<{ email?: string; visitorTypeId?: string }>(token, "training_code", {
    now: opts?.now,
    secret: opts?.secret,
  })
  if (!read.ok) return read
  if (opts?.email && read.payload.email !== normalizeVisitorEmail(opts.email)) {
    return { ok: false, reason: "invalid" }
  }
  if (opts?.visitorTypeId && read.payload.visitorTypeId !== opts.visitorTypeId) {
    return { ok: false, reason: "invalid" }
  }
  return { ok: true }
}
