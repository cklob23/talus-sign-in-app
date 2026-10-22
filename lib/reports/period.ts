import { startOfDayInTimezone, toIANATimezone, zonedTimeToUtc } from "@/lib/timezone"
import type { RangeType, ReportFrequency } from "./types.ts"

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
  const tz = toIANATimezone(args.timezone || "America/Chicago")
  const todayStart = startOfDayInTimezone(tz, now)

  if (args.rangeType === "previous_day") {
    return { start: addCalendarDays(todayStart, -1, tz), end: todayStart }
  }

  if (args.rangeType === "last_n_days") {
    const n = Math.max(1, Math.min(365, Math.round(args.lastNDays || 7)))
    return { start: addCalendarDays(todayStart, -n, tz), end: todayStart }
  }

  if (args.rangeType === "previous_week") {
    const parts = partsInZone(now, tz)
    const daysSinceMonday = (parts.weekday + 6) % 7
    const thisMonday = addCalendarDays(todayStart, -daysSinceMonday, tz)
    return { start: addCalendarDays(thisMonday, -7, tz), end: thisMonday }
  }

  const parts = partsInZone(now, tz)
  const thisMonthStart = zonedTimeToUtc(parts.year, parts.month, 1, 0, 0, 0, tz)
  const prevYear = parts.month === 1 ? parts.year - 1 : parts.year
  const prevMonth = parts.month === 1 ? 12 : parts.month - 1
  return {
    start: zonedTimeToUtc(prevYear, prevMonth, 1, 0, 0, 0, tz),
    end: thisMonthStart,
  }
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
  const tz = toIANATimezone(schedule.timezone || "America/Chicago")
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
  if (periodDays === "1") {
    return { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now }
  }
  const n = Number.parseInt(periodDays, 10)
  const days = Number.isFinite(n) && n > 0 ? n : 7
  const tz = toIANATimezone(timezone || "America/Chicago")
  const todayStart = startOfDayInTimezone(tz, now)
  return { start: addCalendarDays(todayStart, -days, tz), end: now }
}

export function isScheduleDue(enabled: boolean, nextRunAt: string | Date | null, nowMs = Date.now()): boolean {
  if (!enabled || !nextRunAt) return false
  const at = nextRunAt instanceof Date ? nextRunAt.getTime() : new Date(nextRunAt).getTime()
  return Number.isFinite(at) && at <= nowMs
}
