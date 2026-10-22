import { startOfDayInTimezone, toIANATimezone } from "@/lib/timezone"

/** Parse a stored "HH:MM" setting value into minutes-of-day. */
export function parseTimeToMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

/** Coerce a stored boolean setting (JSON true or "true") to a boolean. */
export function asBool(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "true") return true
  if (value === false || value === "false") return false
  return fallback
}

export function getLocalTimeParts(
  timezone: string,
  now: Date = new Date(),
): { hour: number; minute: number; localMinutes: number } {
  try {
    const iana = toIANATimezone(timezone)
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    })
    const parts = formatter.formatToParts(now)
    let hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0)
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
    if (hour === 24) hour = 0
    return { hour, minute, localMinutes: hour * 60 + minute }
  } catch {
    return { hour: 12, minute: 0, localMinutes: 12 * 60 }
  }
}

/**
 * The most recent visitor end-of-day cutoff that has already passed.
 *
 * After today's sign-out time: today's cutoff.
 * Before today's sign-out time: the start of today, so leftovers from
 * yesterday (or earlier) are still signed out on the next cron run.
 */
export function lastElapsedVisitorCutoff(
  now: Date,
  timezone: string,
  targetMinutes: number,
): Date {
  const startToday = startOfDayInTimezone(timezone, now)
  const cutoffToday = new Date(startToday.getTime() + targetMinutes * 60 * 1000)
  if (now.getTime() >= cutoffToday.getTime()) return cutoffToday
  return startToday
}

export function visitorDueForEndOfDaySignOut(
  signInTime: Date,
  now: Date,
  timezone: string,
  targetMinutes: number,
): boolean {
  if (Number.isNaN(signInTime.getTime())) return false
  return signInTime.getTime() < lastElapsedVisitorCutoff(now, timezone, targetMinutes).getTime()
}

export function selectDueVisitorIds(
  signIns: { id: string; sign_in_time: string }[],
  now: Date,
  timezone: string,
  targetMinutes: number,
): string[] {
  return signIns
    .filter((row) => visitorDueForEndOfDaySignOut(new Date(row.sign_in_time), now, timezone, targetMinutes))
    .map((row) => row.id)
}

export function autoSignoutEmailKey(signInId: string): string {
  return `auto-signout:${signInId}`
}

/** True when local time is inside the 15-minute window starting at target. Employees only. */
export function isWithinTriggerWindow(localMinutes: number, targetMinutes: number): boolean {
  const diff = (localMinutes - targetMinutes + 1440) % 1440
  return diff < 15
}
