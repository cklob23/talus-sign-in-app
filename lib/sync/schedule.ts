import { DEFAULT_DISPLAY_TIMEZONE, formatDateTimeWithZone, localDatetimeToUtc, zonedTimeToUtc } from "@/lib/timezone"

export const SCHEDULE_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "168h": 7 * 24 * 60 * 60 * 1000,
}

/** Sync page datetime-local values are wall clocks in this zone, not UTC. */
export const SYNC_SCHEDULE_TIMEZONE = DEFAULT_DISPLAY_TIMEZONE

const NAIVE_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const HAS_ZONE_RE = /[zZ]|[+-]\d{2}:?\d{2}$/

const SCHEDULE_ALIASES: Record<string, string> = {
  daily: "24h",
  "24hours": "24h",
  every24hours: "24h",
  hourly: "1h",
  everyhour: "1h",
}

export type SyncDueReason =
  | "off"
  | "unknown_schedule"
  | "start_in_future"
  | "never_synced"
  | "due"
  | "not_due"

export interface SyncDueExplanation {
  due: boolean
  reason: SyncDueReason
  schedule: string
  normalizedSchedule: string
  lastSync: string | null
  start: string | null
  nextDueAt: string | null
}

/**
 * Settings.value is jsonb. Strings sometimes arrive already parsed and
 * sometimes as extra-quoted JSON (`"24h"`). Objects are unusual but
 * should not silently become an unknown schedule.
 */
export function unwrapSettingValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "boolean" || typeof value === "number") return String(value)
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed || trimmed === "null") return null
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (typeof parsed === "string") return parsed.trim() || null
      } catch {
        return trimmed.slice(1, -1).trim() || null
      }
    }
    return trimmed
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    if (typeof record.frequency === "string") return unwrapSettingValue(record.frequency)
    if (typeof record.value === "string") return unwrapSettingValue(record.value)
  }
  return null
}

/** Map UI / jsonb / alias values onto SCHEDULE_MS keys. Unknown stays as-is. */
export function normalizeSchedule(schedule: unknown): string {
  const raw = unwrapSettingValue(schedule)?.toLowerCase().replace(/\s+/g, "") ?? ""
  if (!raw) return "off"
  if (raw === "off") return "off"
  if (SCHEDULE_ALIASES[raw]) return SCHEDULE_ALIASES[raw]
  if (SCHEDULE_MS[raw]) return raw
  return raw
}

function partsInZone(
  ms: number,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(ms)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/**
 * Parse last_sync / start-date settings.
 * - ISO with Z or an offset stays absolute.
 * - datetime-local from the Sync page (`2026-02-16T16:30`) is America/New_York,
 *   not the Render host timezone (UTC). `new Date("2026-02-16T16:30")` is wrong
 *   on the server.
 */
export function parseSyncInstant(value: unknown): number | null {
  const raw = unwrapSettingValue(value)
  if (!raw) return null
  if (HAS_ZONE_RE.test(raw)) {
    const ms = new Date(raw).getTime()
    return Number.isNaN(ms) ? null : ms
  }
  if (NAIVE_LOCAL_RE.test(raw)) {
    const zoned = localDatetimeToUtc(raw, SYNC_SCHEDULE_TIMEZONE)
    return zoned ? zoned.getTime() : null
  }
  const ms = new Date(raw).getTime()
  return Number.isNaN(ms) ? null : ms
}

function nextMsIntervalSlot(originMs: number, interval: number, afterMs: number): number {
  if (afterMs < originMs) return originMs
  return originMs + (Math.floor((afterMs - originMs) / interval) + 1) * interval
}

/**
 * Next fire time after `afterMs`. Daily/weekly use the start date's wall clock
 * in America/New_York so DST does not drift the 4:30 PM anchor.
 */
export function nextSlotAfter(
  startMs: number | null,
  schedule: string,
  afterMs: number,
): number {
  const interval = SCHEDULE_MS[schedule]
  if (!interval) return afterMs
  if (startMs == null) return afterMs + interval

  if (schedule === "24h" || schedule === "168h") {
    const tz = SYNC_SCHEDULE_TIMEZONE
    const start = partsInZone(startMs, tz)
    const after = partsInZone(afterMs, tz)
    const startWeekday = new Date(Date.UTC(start.year, start.month - 1, start.day)).getUTCDay()
    let year = after.year
    let month = after.month
    let day = after.day
    for (let i = 0; i < 400; i++) {
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
      const slot = zonedTimeToUtc(year, month, day, start.hour, start.minute, start.second, tz)
      const weekdayOk = schedule === "24h" || weekday === startWeekday
      if (weekdayOk && slot.getTime() > afterMs) return slot.getTime()
      const rolled = new Date(Date.UTC(year, month - 1, day + 1))
      year = rolled.getUTCFullYear()
      month = rolled.getUTCMonth() + 1
      day = rolled.getUTCDate()
    }
  }

  return nextMsIntervalSlot(startMs, interval, afterMs)
}

export function explainSyncDue(
  schedule: string,
  lastSyncIso: string | null,
  startDateIso: string | null,
  nowMs = Date.now(),
): SyncDueExplanation {
  const rawSchedule = unwrapSettingValue(schedule) || "off"
  const normalized = normalizeSchedule(rawSchedule)
  const last = unwrapSettingValue(lastSyncIso)
  const start = unwrapSettingValue(startDateIso)
  const base: Omit<SyncDueExplanation, "due" | "reason" | "nextDueAt"> = {
    schedule: rawSchedule,
    normalizedSchedule: normalized,
    lastSync: last,
    start,
  }

  if (normalized === "off") {
    return { ...base, due: false, reason: "off", nextDueAt: null }
  }
  if (!SCHEDULE_MS[normalized]) {
    return { ...base, due: false, reason: "unknown_schedule", nextDueAt: null }
  }

  const startMs = parseSyncInstant(start)
  if (startMs != null && startMs > nowMs) {
    return { ...base, due: false, reason: "start_in_future", nextDueAt: new Date(startMs).toISOString() }
  }

  const lastMs = parseSyncInstant(last)
  if (lastMs == null) {
    const nextDueAt = startMs != null ? new Date(startMs).toISOString() : new Date(nowMs).toISOString()
    return { ...base, due: true, reason: "never_synced", nextDueAt }
  }

  const nextMs = nextSlotAfter(startMs, normalized, lastMs)
  const nextDueAt = new Date(nextMs).toISOString()
  if (nextMs <= nowMs) {
    return { ...base, due: true, reason: "due", nextDueAt }
  }
  return { ...base, due: false, reason: "not_due", nextDueAt }
}

/**
 * Due when the next anchored slot (frequency + start-date clock + last sync)
 * is at or before now. Missed daily slots stay due until a successful run.
 */
export function isSyncDue(
  schedule: string,
  lastSyncIso: string | null,
  startDateIso: string | null,
  nowMs = Date.now(),
): boolean {
  return explainSyncDue(schedule, lastSyncIso, startDateIso, nowMs).due
}

export type SyncProvider = "azure" | "ramp"

export function parseSyncRequest(url: string): {
  provider: SyncProvider | "all"
  dryRun: boolean
} {
  const parsed = new URL(url)
  const raw = (parsed.searchParams.get("provider") || "all").toLowerCase()
  const provider: SyncProvider | "all" = raw === "azure" || raw === "ramp" ? raw : "all"
  const dry = parsed.searchParams.get("dryRun") || parsed.searchParams.get("dryrun")
  const dryRun = dry === "1" || dry === "true"
  return { provider, dryRun }
}

/**
 * Hourly cron respects due checks. `?provider=azure|ramp` forces that
 * provider so production can be validated even when the schedule is off
 * or the interval has not elapsed.
 */
export function shouldRunProvider(
  selected: SyncProvider | "all",
  target: SyncProvider,
  due: boolean,
): boolean {
  if (selected === target) return true
  if (selected === "all") return due
  return false
}

export interface NextSyncAt {
  dueNow: boolean
  at: Date | null
  scheduled: boolean
}

/**
 * Next time this provider is eligible. When overdue, `at` is the missed
 * slot so the Sync page can show a real clock time instead of generic text.
 */
export function getNextSyncAt(
  schedule: string,
  lastSyncIso: string | null,
  startDateIso: string | null,
  nowMs = Date.now(),
): NextSyncAt {
  const explained = explainSyncDue(schedule, lastSyncIso, startDateIso, nowMs)
  if (explained.reason === "off" || explained.reason === "unknown_schedule") {
    return { dueNow: false, at: null, scheduled: false }
  }
  const at = explained.nextDueAt ? new Date(explained.nextDueAt) : null
  return { dueNow: explained.due, at, scheduled: true }
}

export function formatNextSyncLabel(
  schedule: string,
  lastSyncIso: string | null,
  startDateIso: string | null,
  nowMs = Date.now(),
): string {
  const next = getNextSyncAt(schedule, lastSyncIso, startDateIso, nowMs)
  if (!next.scheduled) return "Not scheduled"
  if (next.at) {
    const stamp = formatDateTimeWithZone(next.at.toISOString(), SYNC_SCHEDULE_TIMEZONE)
    return next.dueNow ? `Overdue since ${stamp}` : stamp
  }
  if (next.dueNow) return "Due on the next hourly cron"
  return "Not scheduled"
}

export function graphPageItems<T>(data: { value?: T[]; "@odata.nextLink"?: string }): {
  items: T[]
  next: string | null
} {
  return {
    items: data.value || [],
    next: data["@odata.nextLink"] || null,
  }
}

export function rampPageItems<T>(data: { data?: T[]; page?: { next?: string | null } }): {
  items: T[]
  next: string | null
} {
  return {
    items: data.data || [],
    next: data.page?.next || null,
  }
}

export async function collectPages<T>(
  firstUrl: string,
  fetchPage: (url: string) => Promise<{ items: T[]; next: string | null }>,
): Promise<T[]> {
  const all: T[] = []
  let nextUrl: string | null = firstUrl
  const seen = new Set<string>()

  while (nextUrl) {
    if (seen.has(nextUrl)) break
    seen.add(nextUrl)
    const page = await fetchPage(nextUrl)
    all.push(...page.items)
    nextUrl = page.next
  }

  return all
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => run())
  await Promise.all(workers)
  return results
}

/**
 * Page a 1-based numbered API (Supabase auth.admin.listUsers) until a
 * short page. Stops at maxPages so a stuck endpoint cannot loop forever.
 */
export async function collectNumberedPages<T>(
  fetchPage: (page: number) => Promise<T[]>,
  perPage: number,
  maxPages = 1000,
): Promise<T[]> {
  const all: T[] = []
  const size = Math.max(1, perPage)
  for (let page = 1; page <= maxPages; page++) {
    const items = await fetchPage(page)
    all.push(...items)
    if (items.length < size) break
  }
  return all
}
