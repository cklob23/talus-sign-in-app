import { isSameLocalDay, localDayBounds, toIANATimezone } from "@/lib/timezone"
import { normalizeVisitorEmail } from "@/lib/training-clearance"

export const DEFAULT_INVITE_LEAD_MINUTES = 2 * 24 * 60
export const INVITE_LEAD_PRESETS_MINUTES = [1440, 2880, 4320, 10080] as const
export const INVITE_COOLDOWN_MS = 5 * 60 * 1000
export const TRAINING_LINK_MIN_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const TRAINING_LINK_MAX_TTL_MS = 60 * 24 * 60 * 60 * 1000

export type InviteMode = "now" | "scheduled" | "manual"
export type InviteStatus = "none" | "scheduled" | "sending" | "sent" | "failed"
export type PreferredLanguage = "en" | "es"

type AnyClient = {
  from: (table: string) => any
}

export function parseInviteMode(value: unknown): InviteMode | null {
  if (value === "now" || value === "scheduled" || value === "manual") return value
  return null
}

export function parsePreferredLanguage(value: unknown): PreferredLanguage {
  return value === "es" ? "es" : "en"
}

export function parseLeadMinutes(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : NaN
  if (!Number.isFinite(n)) return null
  const minutes = Math.round(n)
  if (minutes < 1 || minutes > 60 * 24 * 60) return null
  return minutes
}

export function resolveInvitePlan(args: {
  mode: InviteMode
  expectedArrival: Date
  leadMinutes: number
  now?: Date
}): {
  mode: InviteMode
  status: InviteStatus
  sendAt: string | null
  sendNow: boolean
  leadMinutes: number
} {
  const now = args.now ?? new Date()
  const leadMinutes = args.leadMinutes > 0 ? args.leadMinutes : DEFAULT_INVITE_LEAD_MINUTES

  if (args.mode === "manual") {
    return { mode: "manual", status: "none", sendAt: null, sendNow: false, leadMinutes }
  }

  if (args.mode === "now") {
    return { mode: "now", status: "none", sendAt: now.toISOString(), sendNow: true, leadMinutes }
  }

  const sendAtMs = args.expectedArrival.getTime() - leadMinutes * 60 * 1000
  const sendAt = new Date(sendAtMs)
  if (!Number.isFinite(sendAtMs) || sendAt.getTime() <= now.getTime()) {
    return { mode: "scheduled", status: "none", sendAt: now.toISOString(), sendNow: true, leadMinutes }
  }
  return { mode: "scheduled", status: "scheduled", sendAt: sendAt.toISOString(), sendNow: false, leadMinutes }
}

/**
 * Training link TTL: max(14 days, time until the local day after arrival),
 * capped at 60 days.
 */
export function trainingLinkTtlMs(args: {
  expectedArrival: Date | string
  timezone: string
  now?: number
}): number {
  const now = args.now ?? Date.now()
  const arrival = args.expectedArrival instanceof Date ? args.expectedArrival : new Date(args.expectedArrival)
  if (Number.isNaN(arrival.getTime())) return TRAINING_LINK_MIN_TTL_MS
  const expireAt = arrivalDayPlusOneEnd(arrival, args.timezone)
  const until = expireAt.getTime() - now
  return Math.min(TRAINING_LINK_MAX_TTL_MS, Math.max(TRAINING_LINK_MIN_TTL_MS, until))
}

export function inviteCooldownActive(inviteSentAt: string | null | undefined, now = Date.now()): boolean {
  if (!inviteSentAt) return false
  const at = new Date(inviteSentAt).getTime()
  if (!Number.isFinite(at)) return false
  return now - at < INVITE_COOLDOWN_MS
}

export type LoadedBooking = {
  id: string
  status?: string | null
  visitor_email?: string | null
  visitor_first_name?: string | null
  visitor_last_name?: string | null
  visitor_company?: string | null
  visitor_type_id?: string | null
  location_id?: string | null
  host_id?: string | null
  visitor_id?: string | null
  expected_arrival?: string | null
  preferred_language?: string | null
  invite_mode?: string | null
  invite_lead_minutes?: number | null
  invite_send_at?: string | null
  invite_status?: string | null
  invite_sent_at?: string | null
  invite_count?: number | null
  invite_error?: string | null
  host?: { name?: string | null } | { name?: string | null }[] | null
  visitor_type?: {
    id?: string
    name?: string | null
    requires_training?: boolean | null
    training_title?: string | null
    training_video_url?: string | null
  } | { id?: string; name?: string | null; requires_training?: boolean | null; training_title?: string | null; training_video_url?: string | null }[] | null
  location?: { id?: string; name?: string | null; timezone?: string | null } | { id?: string; name?: string | null; timezone?: string | null }[] | null
}

export function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export async function matchPendingBooking(
  admin: AnyClient,
  args: {
    email?: string | null
    locationId: string
    timezone: string
    now?: Date
    bookingId?: string | null
  },
): Promise<{ id: string; visitor_id?: string | null } | null> {
  const now = args.now ?? new Date()

  if (args.bookingId) {
    const { data } = await admin
      .from("bookings")
      .select("id, status, location_id, visitor_email, expected_arrival, visitor_id")
      .eq("id", args.bookingId)
      .maybeSingle()
    if (data?.id && data.status === "pending") {
      if (data.location_id && data.location_id !== args.locationId) return null
      return { id: data.id, visitor_id: data.visitor_id ?? null }
    }
    return null
  }

  const email = normalizeVisitorEmail(args.email)
  if (!email) return null

  const fromSends = await latestBookingIdFromTrainingSends(admin, email)
  if (fromSends) {
    const matched = await matchPendingBooking(admin, {
      ...args,
      bookingId: fromSends,
    })
    if (matched) return matched
  }

  const bounds = localDayBounds(args.timezone, now)
  const { data } = await admin
    .from("bookings")
    .select("id, status, location_id, visitor_email, expected_arrival, visitor_id")
    .eq("status", "pending")
    .eq("location_id", args.locationId)
    .ilike("visitor_email", email)
    .gte("expected_arrival", bounds.start.toISOString())
    .lt("expected_arrival", bounds.end.toISOString())
    .order("expected_arrival", { ascending: true })
    .limit(10)

  const rows = Array.isArray(data) ? data : data ? [data] : []
  const match = rows.find((row: LoadedBooking) => {
    if (!row?.id || row.status !== "pending") return false
    if (row.location_id && row.location_id !== args.locationId) return false
    if (normalizeVisitorEmail(row.visitor_email) !== email) return false
    if (row.expected_arrival && !isSameLocalDay(row.expected_arrival, args.timezone, now)) return false
    return true
  })
  return match?.id ? { id: match.id, visitor_id: match.visitor_id ?? null } : null
}

async function latestBookingIdFromTrainingSends(admin: AnyClient, email: string): Promise<string | null> {
  const { data, error } = await admin
    .from("training_link_sends")
    .select("booking_id, created_at")
    .ilike("visitor_email", email)
    .not("booking_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(5)
  if (error || !data) return null
  const rows = Array.isArray(data) ? data : [data]
  for (const row of rows) {
    if (row && typeof row.booking_id === "string" && row.booking_id) return row.booking_id
  }
  return null
}

export async function checkInMatchedBooking(
  admin: AnyClient,
  args: {
    bookingId?: string | null
    visitorId: string
    email?: string | null
    locationId: string
    timezone: string
    now?: Date
  },
): Promise<{ id: string } | null> {
  const matched = await matchPendingBooking(admin, {
    bookingId: args.bookingId,
    email: args.email,
    locationId: args.locationId,
    timezone: args.timezone,
    now: args.now,
  })
  if (!matched) return null
  const { error } = await admin
    .from("bookings")
    .update({
      status: "checked_in",
      visitor_id: args.visitorId,
      updated_at: (args.now ?? new Date()).toISOString(),
    })
    .eq("id", matched.id)
    .eq("status", "pending")
  if (error) return null
  return { id: matched.id }
}

export type BookingInviteStore = {
  listDue: (now: Date) => Promise<LoadedBooking[]>
  claim: (id: string, now: Date) => Promise<LoadedBooking | null>
  markSent: (id: string, now: Date, count: number) => Promise<void>
  markFailed: (id: string, now: Date, error: string) => Promise<void>
  audit: (entry: Record<string, unknown>) => Promise<void>
}

export function supabaseInviteStore(admin: AnyClient): BookingInviteStore {
  const select =
    "id, status, visitor_email, visitor_first_name, visitor_last_name, visitor_company, visitor_type_id, location_id, host_id, visitor_id, expected_arrival, preferred_language, invite_mode, invite_lead_minutes, invite_send_at, invite_status, invite_sent_at, invite_count, invite_error, host:hosts(name), visitor_type:visitor_types(id, name, requires_training, training_title, training_video_url), location:locations(id, name, timezone)"

  return {
    async listDue(now) {
      const { data } = await admin
        .from("bookings")
        .select(select)
        .eq("invite_status", "scheduled")
        .eq("status", "pending")
        .lte("invite_send_at", now.toISOString())
        .order("invite_send_at", { ascending: true })
        .limit(50)
      return Array.isArray(data) ? data : []
    },
    async claim(id, now) {
      const { data } = await admin
        .from("bookings")
        .update({ invite_status: "sending", updated_at: now.toISOString() })
        .eq("id", id)
        .eq("invite_status", "scheduled")
        .select(select)
        .maybeSingle()
      return data?.id ? (data as LoadedBooking) : null
    },
    async markSent(id, now, count) {
      await admin
        .from("bookings")
        .update({
          invite_status: "sent",
          invite_sent_at: now.toISOString(),
          invite_count: count,
          invite_error: null,
          updated_at: now.toISOString(),
        })
        .eq("id", id)
    },
    async markFailed(id, now, error) {
      await admin
        .from("bookings")
        .update({
          invite_status: "failed",
          invite_error: error.slice(0, 500),
          updated_at: now.toISOString(),
        })
        .eq("id", id)
    },
    async audit(entry) {
      await admin.from("audit_logs").insert(entry)
    },
  }
}

export async function processDueBookingInvites(opts: {
  store: BookingInviteStore
  now?: Date
  send: (booking: LoadedBooking) => Promise<{ sent: boolean; error?: string }>
}): Promise<{ claimed: number; sent: number; failed: number; skipped: number }> {
  const now = opts.now ?? new Date()
  const due = await opts.store.listDue(now)
  let claimed = 0
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const row of due) {
    if (!row?.id) continue
    const locked = await opts.store.claim(row.id, now)
    if (!locked) {
      skipped += 1
      continue
    }
    claimed += 1
    const payload = { ...row, ...locked }
    try {
      const result = await opts.send(payload)
      if (result.sent) {
        const nextCount = (payload.invite_count ?? 0) + 1
        await opts.store.markSent(row.id, now, nextCount)
        await opts.store.audit({
          user_id: null,
          action: "booking.invite_sent",
          entity_type: "booking",
          entity_id: row.id,
          description: `Booking invite sent to ${payload.visitor_email || "visitor"}`,
          metadata: { source: "cron", email: payload.visitor_email },
        })
        sent += 1
      } else {
        const error = result.error || "send_failed"
        await opts.store.markFailed(row.id, now, error)
        await opts.store.audit({
          user_id: null,
          action: "booking.invite_failed",
          entity_type: "booking",
          entity_id: row.id,
          description: `Booking invite failed for ${payload.visitor_email || "visitor"}`,
          metadata: { source: "cron", email: payload.visitor_email, error },
        })
        failed += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "send_failed"
      await opts.store.markFailed(row.id, now, message)
      await opts.store.audit({
        user_id: null,
        action: "booking.invite_failed",
        entity_type: "booking",
        entity_id: row.id,
        description: `Booking invite failed for ${payload.visitor_email || "visitor"}`,
        metadata: { source: "cron", email: payload.visitor_email, error: message },
      })
      failed += 1
    }
  }

  return { claimed, sent, failed, skipped }
}

/** Calendar-correct exclusive end of (arrival local date + 1 day). */
export function arrivalDayPlusOneEnd(expectedArrival: Date, timezone: string): Date {
  const iana = toIANATimezone(timezone)
  const bounds = localDayBounds(iana, expectedArrival)
  const midNext = new Date(bounds.end.getTime() + 12 * 60 * 60 * 1000)
  const nextBounds = localDayBounds(iana, midNext)
  return nextBounds.end
}
