import {
  TRAINING_LINK_TTL_MS,
  VISIT_TOKEN_TTL_MS,
  issueSignedToken,
  readSignedToken,
} from "@/lib/signed-token"

function appOrigin(request?: { headers: Headers; url: string } | null): string {
  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host")
    const forwardedProto = request.headers.get("x-forwarded-proto")
    if (forwardedHost) return `${forwardedProto ?? "https"}://${forwardedHost}`
    try {
      return new URL(request.url).origin
    } catch {
      // fall through
    }
  }
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, "")
  return ""
}

export interface VisitTokenPayload {
  signInId: string
  hostId?: string | null
}

export function issueVisitToken(opts: {
  signInId: string
  hostId?: string | null
  now?: number
  secret?: string
  ttlMs?: number
}): string {
  const now = opts.now ?? Date.now()
  return issueSignedToken({
    kind: "visit",
    payload: { signInId: opts.signInId, hostId: opts.hostId || null },
    issuedAt: now,
    expiresAt: now + (opts.ttlMs ?? VISIT_TOKEN_TTL_MS),
    secret: opts.secret,
  })
}

export function readVisitToken(
  token: unknown,
  opts?: { now?: number; secret?: string },
): { ok: true; payload: VisitTokenPayload; expiresAt: number } | { ok: false; reason: "invalid" | "expired" } {
  const read = readSignedToken<VisitTokenPayload>(token, "visit", opts)
  if (!read.ok) return read
  if (!read.payload.signInId || typeof read.payload.signInId !== "string") {
    return { ok: false, reason: "invalid" }
  }
  return { ok: true, payload: read.payload, expiresAt: read.expiresAt }
}

export function visitUrlForSignIn(opts: {
  origin: string
  signInId: string
  hostId?: string | null
  now?: number
  secret?: string
}): string {
  const token = issueVisitToken(opts)
  const origin = opts.origin.replace(/\/+$/, "")
  return `${origin}/visit/${encodeURIComponent(token)}`
}

export function visitUrlFromRequest(
  request: { headers: Headers; url: string } | null,
  signInId: string,
  hostId?: string | null,
): string | null {
  const origin = appOrigin(request)
  if (!origin || !signInId) return null
  try {
    return visitUrlForSignIn({ origin, signInId, hostId })
  } catch {
    return null
  }
}

export interface TrainingLinkPayload {
  email: string
  firstName: string
  lastName: string
  company?: string | null
  visitorTypeId: string
  locationId: string
  bookingId?: string | null
  hostId?: string | null
  hostName?: string | null
}

export function issueTrainingLinkToken(opts: {
  payload: TrainingLinkPayload
  now?: number
  secret?: string
  ttlMs?: number
}): string {
  const now = opts.now ?? Date.now()
  return issueSignedToken({
    kind: "training_link",
    payload: opts.payload,
    issuedAt: now,
    expiresAt: now + (opts.ttlMs ?? TRAINING_LINK_TTL_MS),
    secret: opts.secret,
  })
}

export function readTrainingLinkToken(
  token: unknown,
  opts?: { now?: number; secret?: string },
): { ok: true; payload: TrainingLinkPayload; expiresAt: number } | { ok: false; reason: "invalid" | "expired" } {
  const read = readSignedToken<TrainingLinkPayload>(token, "training_link", opts)
  if (!read.ok) return read
  if (!read.payload.email || !read.payload.visitorTypeId || !read.payload.locationId) {
    return { ok: false, reason: "invalid" }
  }
  return { ok: true, payload: read.payload, expiresAt: read.expiresAt }
}
