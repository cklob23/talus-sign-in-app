import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * Server-side proof that a visitor actually sat through required training.
 *
 * Neither the kiosk nor the QR flow has a server session while a visitor is
 * watching the video, so the server hands out a signed "training ticket" when
 * the video step starts. The final sign-in must return that ticket together
 * with the visitor's acknowledgement, and the ticket must be at least as old
 * as the video. That stops a client from skipping straight to sign-in while
 * the video is still playing (QA finding V84041).
 *
 * The ticket is an HMAC over a small JSON payload, signed with
 * KIOSK_SESSION_SECRET under a separate domain prefix so it can never be
 * confused with a receptionist session cookie.
 */

const DOMAIN = "talus-training-ticket:v1"

/** A ticket older than this is stale: the visitor walked away mid-training. */
export const TRAINING_TICKET_MAX_AGE_MS = 6 * 60 * 60 * 1000
/** Tolerance for clock skew, buffering and the time it takes to tap Continue. */
export const TRAINING_SLACK_MS = 15_000
/** The kiosk tracks its embedded (iframe) training video on a fixed timer. */
export const KIOSK_TRAINING_SECONDS = 180
/** Upper bound on a client-reported video length, so a ticket can't be parked forever. */
export const MAX_TRAINING_VIDEO_SECONDS = 3 * 60 * 60

export interface TrainingTicketPayload {
  v: 1
  /** Visitor type the training belongs to. */
  t: string
  /** Where the ticket may be redeemed, e.g. "qr:<location id>" or "kiosk". */
  s: string
  /** Issued at, epoch ms. */
  iat: number
  /** Nonce, so two tickets issued in the same millisecond differ. */
  n: string
}

export type TrainingCheck =
  | { ok: true; startedAt: number }
  | { ok: false; code: TrainingFailureCode; message: string }

export type TrainingFailureCode =
  | "training_not_acknowledged"
  | "training_ticket_missing"
  | "training_ticket_invalid"
  | "training_too_early"
  | "training_ticket_expired"

export const TRAINING_MESSAGES: Record<TrainingFailureCode, string> = {
  training_not_acknowledged: "Please confirm you have watched and understood the safety training.",
  training_ticket_missing: "We could not confirm your safety training. Please watch the training video again.",
  training_ticket_invalid: "We could not confirm your safety training. Please watch the training video again.",
  training_too_early: "Please watch the full safety training video before signing in.",
  training_ticket_expired: "Your training session expired. Please watch the training video again.",
}

function fail(code: TrainingFailureCode): TrainingCheck {
  return { ok: false, code, message: TRAINING_MESSAGES[code] }
}

function resolveSecret(secret?: string): string {
  const value = secret ?? process.env.KIOSK_SESSION_SECRET
  if (!value || value.length < 16) {
    throw new Error("KIOSK_SESSION_SECRET is not set or is too short (need at least 16 characters)")
  }
  return value
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${DOMAIN}.${payload}`).digest("base64url")
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function issueTrainingTicket(opts: {
  visitorTypeId: string
  scope: string
  now?: number
  secret?: string
}): string {
  const key = resolveSecret(opts.secret)
  const payload: TrainingTicketPayload = {
    v: 1,
    t: opts.visitorTypeId,
    s: opts.scope,
    iat: opts.now ?? Date.now(),
    n: randomBytes(9).toString("base64url"),
  }
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${encoded}.${sign(encoded, key)}`
}

/** Decode and authenticate a ticket. Null for anything malformed or forged. */
export function readTrainingTicket(ticket: unknown, secret?: string): TrainingTicketPayload | null {
  if (typeof ticket !== "string" || ticket.length > 1024) return null
  let key: string
  try {
    key = resolveSecret(secret)
  } catch {
    return null
  }
  const dot = ticket.lastIndexOf(".")
  if (dot <= 0) return null
  const encoded = ticket.slice(0, dot)
  const signature = ticket.slice(dot + 1)
  if (!signature || !safeEqual(signature, sign(encoded, key))) return null
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<TrainingTicketPayload>
    if (parsed.v !== 1) return null
    if (typeof parsed.t !== "string" || typeof parsed.s !== "string") return null
    if (typeof parsed.iat !== "number" || !Number.isFinite(parsed.iat)) return null
    if (typeof parsed.n !== "string") return null
    return parsed as TrainingTicketPayload
  } catch {
    return null
  }
}

/**
 * Minimum time between ticket issue and sign-in for a video of this length.
 * Null when the reported length is missing or nonsensical, which means the
 * video never loaded and so cannot have been watched.
 */
export function requiredWatchMs(videoSeconds: unknown): number | null {
  if (typeof videoSeconds !== "number" || !Number.isFinite(videoSeconds) || videoSeconds <= 0) return null
  const seconds = Math.min(videoSeconds, MAX_TRAINING_VIDEO_SECONDS)
  return Math.max(0, seconds * 1000 - TRAINING_SLACK_MS)
}

export interface TrainingProof {
  ticket: string | null
  acknowledged: boolean
  /** Length of the video the visitor watched, as reported by the player. */
  videoSeconds: number | null
}

/** Accept a loosely typed `training` object from a request body. */
export function parseTrainingProof(raw: unknown): TrainingProof {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const seconds = typeof value.videoSeconds === "number" && Number.isFinite(value.videoSeconds) ? value.videoSeconds : null
  return {
    ticket: typeof value.ticket === "string" && value.ticket.length > 0 ? value.ticket : null,
    acknowledged: value.acknowledged === true,
    videoSeconds: seconds,
  }
}

/**
 * Verify that this visitor watched the training for `visitorTypeId` in this
 * `scope`. `minWatchMs` is how long the video takes; the ticket must be at
 * least that old.
 */
export function verifyTrainingProof(
  proof: TrainingProof,
  opts: { visitorTypeId: string; scope: string; minWatchMs: number | null; now?: number; secret?: string },
): TrainingCheck {
  if (!proof.acknowledged) return fail("training_not_acknowledged")
  if (!proof.ticket) return fail("training_ticket_missing")
  const payload = readTrainingTicket(proof.ticket, opts.secret)
  if (!payload) return fail("training_ticket_invalid")
  if (payload.t !== opts.visitorTypeId || payload.s !== opts.scope) return fail("training_ticket_invalid")
  const now = opts.now ?? Date.now()
  const age = now - payload.iat
  if (age < 0) return fail("training_ticket_invalid")
  if (age > TRAINING_TICKET_MAX_AGE_MS) return fail("training_ticket_expired")
  if (opts.minWatchMs === null) return fail("training_too_early")
  if (age < opts.minWatchMs) return fail("training_too_early")
  return { ok: true, startedAt: payload.iat }
}

export function qrTrainingScope(locationId: string): string {
  return `qr:${locationId}`
}

export function trainingLinkScope(visitorTypeId: string): string {
  return `link:${visitorTypeId}`
}

export const KIOSK_TRAINING_SCOPE = "kiosk"

export function kioskMinWatchMs(): number {
  return Math.max(0, KIOSK_TRAINING_SECONDS * 1000 - TRAINING_SLACK_MS)
}
