import { DEFAULT_DISPLAY_TIMEZONE, startOfDayInTimezone, toIANATimezone, zonedTimeToUtc } from "@/lib/timezone"
import type { RangeType, ReportFrequency } from "./types.ts"

export const ALL_TIME_START = new Date(0)
export const REPORT_PAGE_SIZE = 1000
export const REPORT_VIEW_MAX_ROWS = 10_000
export const REPORT_VIEW_MAX_RANGE_DAYS = 366
export const REPORT_EXPORT_MAX_ROWS = 50_000
export const DEFAULT_REPORT_TIMEZONE = DEFAULT_DISPLAY_TIMEZONE

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
}

export function partsInZone(date: Date, timezone: string): ZonedParts {
  const iana = toIANATimezone(timezone)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: iana,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const map = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  )
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: WEEKDAY_SHORT[map.weekday] ?? 0,
  }
}

export function addCalendarDays(instant: Date, days: number, timezone: string): Date {
  const tz = toIANATimezone(timezone)
  const parts = partsInZone(instant, tz)
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days)
  const rolled = new Date(utc)
  return zonedTimeToUtc(rolled.getUTCFullYear(), rolled.getUTCMonth() + 1, rolled.getUTCDate(), 0, 0, 0, tz)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function parseSendTime(sendTime: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(sendTime.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

export interface ReportPeriod {
  start: Date
  end: Date
  /** Stored on scheduled runs for uniqueness. All-time uses today's local midnight. */
  runStart: Date
}

function period(start: Date, end: Date, runStart = start): ReportPeriod {
  return { start, end, runStart }
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseYmd(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null
  const match = YMD_RE.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dim = daysInMonth(year, month)
  if (day > dim) return null
  return { year, month, day }
}

export function ymdInZone(date: Date, timezone: string): string {
  const parts = partsInZone(date, timezone)
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

export function isAllTimeStart(iso: string | Date | null | undefined): boolean {
  if (!iso) return false
  const ms = iso instanceof Date ? iso.getTime() : Date.parse(iso)
  return Number.isFinite(ms) && ms <= ALL_TIME_START.getTime() + 1000
}

/**
 * Closed-open window [start, end) in the schedule timezone.
 * previous_day and last_n_days end at today's midnight so the current day is excluded.
 * previous_week is the last complete Monday-Sunday week.
 * previous_month is the last complete calendar month.
 */
export function resolveReportPeriod(args: {
  rangeType: RangeType
  lastNDays?: number | null
  timezone: string
  now?: Date
}): ReportPeriod {
  const now = args.now ?? new Date()
  const tz = toIANATimezone(args.timezone || DEFAULT_REPORT_TIMEZONE)
  const todayStart = startOfDayInTimezone(tz, now)

  if (args.rangeType === "all_time") {
    return period(ALL_TIME_START, now, todayStart)
  }

  if (args.rangeType === "today") {
    return period(todayStart, now)
  }

  if (args.rangeType === "previous_day") {
    return period(addCalendarDays(todayStart, -1, tz), todayStart)
  }

  if (args.rangeType === "last_n_days") {
    const n = Math.max(1, Math.min(365, Math.round(args.lastNDays || 7)))
    return period(addCalendarDays(todayStart, -n, tz), todayStart)
  }

  if (args.rangeType === "previous_week") {
    const parts = partsInZone(now, tz)
    const daysSinceMonday = (parts.weekday + 6) % 7
    const thisMonday = addCalendarDays(todayStart, -daysSinceMonday, tz)
    return period(addCalendarDays(thisMonday, -7, tz), thisMonday)
  }

  const parts = partsInZone(now, tz)
  const thisMonthStart = zonedTimeToUtc(parts.year, parts.month, 1, 0, 0, 0, tz)
  const prevYear = parts.month === 1 ? parts.year - 1 : parts.year
  const prevMonth = parts.month === 1 ? 12 : parts.month - 1
  return period(zonedTimeToUtc(prevYear, prevMonth, 1, 0, 0, 0, tz), thisMonthStart)
}

export function computeNextRunAt(
  schedule: {
    frequency: ReportFrequency
    weekday?: number | null
    monthDay?: number | null
    sendTime: string
    timezone: string
  },
  after: Date,
): Date {
  const time = parseSendTime(schedule.sendTime) || { hour: 8, minute: 0 }
  const tz = toIANATimezone(schedule.timezone || DEFAULT_REPORT_TIMEZONE)
  const afterStart = startOfDayInTimezone(tz, after)

  for (let i = 0; i < 400; i++) {
    const day = addCalendarDays(afterStart, i, tz)
    const parts = partsInZone(day, tz)

    if (schedule.frequency === "weekly") {
      const wanted = Number.isInteger(schedule.weekday) ? Number(schedule.weekday) : 1
      if (parts.weekday !== wanted) continue
    }

    if (schedule.frequency === "monthly") {
      const dim = daysInMonth(parts.year, parts.month)
      const wanted = Math.min(Math.max(1, schedule.monthDay || 1), dim)
      if (parts.day !== wanted) continue
    }

    const run = zonedTimeToUtc(parts.year, parts.month, parts.day, time.hour, time.minute, 0, tz)
    if (run.getTime() > after.getTime()) return run
  }

  return new Date(after.getTime() + 24 * 60 * 60 * 1000)
}

/** On-demand rolling window. End is now so today's rows are included. */
export function rollingWindow(periodDays: string, timezone: string, now = new Date()): ReportPeriod {
  return resolveOnDemandWindow({ period: periodDays, timezone, now })
}

export function resolveOnDemandWindow(args: {
  period: string
  timezone: string
  customStart?: string | null
  customEnd?: string | null
  now?: Date
}): ReportPeriod {
  const now = args.now ?? new Date()
  const tz = toIANATimezone(args.timezone || DEFAULT_REPORT_TIMEZONE)
  const todayStart = startOfDayInTimezone(tz, now)

  if (args.period === "1") {
    return period(new Date(now.getTime() - 24 * 60 * 60 * 1000), now)
  }
  if (args.period === "today") {
    return period(todayStart, now)
  }
  if (args.period === "all") {
    return period(ALL_TIME_START, now, todayStart)
  }
  if (args.period === "custom") {
    const startParts = parseYmd(args.customStart)
    const endParts = parseYmd(args.customEnd)
    if (startParts && endParts) {
      const start = zonedTimeToUtc(startParts.year, startParts.month, startParts.day, 0, 0, 0, tz)
      const endDay = zonedTimeToUtc(endParts.year, endParts.month, endParts.day, 0, 0, 0, tz)
      const end = addCalendarDays(endDay, 1, tz)
      if (end.getTime() > start.getTime()) return period(start, end)
    }
  }
  const n = Number.parseInt(args.period, 10)
  const days = Number.isFinite(n) && n > 0 ? n : 7
  return period(addCalendarDays(todayStart, -days, tz), now)
}

export function dashboardPeriodLabel(period: string, customStart?: string | null, customEnd?: string | null): string {
  if (period === "1") return "Last 24 hours"
  if (period === "today") return "Today"
  if (period === "all") return "All time"
  if (period === "custom") {
    if (customStart && customEnd) return `${customStart} to ${customEnd}`
    return "Custom range"
  }
  const n = Number.parseInt(period, 10)
  if (Number.isFinite(n) && n > 0) return `Last ${n} days`
  return "Selected period"
}

export function reportWindowTimezone(args: {
  selectedLocationIds: string[]
  locations: Array<{ id: string; timezone?: string | null }>
}): string {
  if (args.selectedLocationIds.length === 1) {
    const match = args.locations.find((loc) => loc.id === args.selectedLocationIds[0])
    return toIANATimezone(match?.timezone || DEFAULT_REPORT_TIMEZONE)
  }
  return DEFAULT_REPORT_TIMEZONE
}

export function isScheduleDue(enabled: boolean, nextRunAt: string | Date | null, nowMs = Date.now()): boolean {
  if (!enabled || !nextRunAt) return false
  const at = nextRunAt instanceof Date ? nextRunAt.getTime() : new Date(nextRunAt).getTime()
  return Number.isFinite(at) && at <= nowMs
}
