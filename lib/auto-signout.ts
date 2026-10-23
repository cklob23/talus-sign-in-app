import { startOfDayInTimezone, toIANATimezone } from "@/lib/timezone"

export const DEFAULT_EMPLOYEE_SIGNOUT_TIME = "18:00"
export const DEFAULT_VISITOR_SIGNOUT_TIME = "23:45"
export const DEFAULT_EMPLOYEE_SIGNOUT_MINUTES = 18 * 60
export const DEFAULT_VISITOR_SIGNOUT_MINUTES = 23 * 60 + 45

export const LOCATION_AUTO_SIGNOUT_COLUMNS = [
  "auto_sign_out_employees",
  "auto_sign_out_employees_time",
  "auto_sign_out_visitors",
  "auto_sign_out_visitors_time",
] as const

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

export function formatMinutesAsTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** True when a location override should replace the global value. */
export function isOverrideSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ""
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

export function isEmployeeDailyWindow(now: Date, timezone: string, targetMinutes: number): boolean {
  return isWithinTriggerWindow(getLocalTimeParts(timezone, now).localMinutes, targetMinutes)
}

export type AutoSignOutSource = {
  visitorsEnabled?: unknown
  visitorsTime?: unknown
  employeesEnabled?: unknown
  employeesTime?: unknown
  legacyAutoSignOut?: unknown
}

export type LocationAutoSignOutOverride = {
  visitorsEnabled?: unknown
  visitorsTime?: unknown
  employeesEnabled?: unknown
  employeesTime?: unknown
}

export type ResolvedAutoSignOut = {
  visitorsEnabled: boolean
  visitorsTime: string
  visitorsTargetMinutes: number
  employeesEnabled: boolean
  employeesTime: string
  employeesTargetMinutes: number
}

/**
 * Location override wins when set. Otherwise use the global setting.
 * Missing global values fall back to employees 18:00 / visitors 23:45, both on.
 */
export function resolveAutoSignOutSettings(
  global: AutoSignOutSource = {},
  location?: LocationAutoSignOutOverride | null,
): ResolvedAutoSignOut {
  const globalVisitorsEnabled = asBool(global.visitorsEnabled ?? global.legacyAutoSignOut, true)
  const globalEmployeesEnabled = asBool(global.employeesEnabled, true)
  const globalVisitorsMinutes = parseTimeToMinutes(global.visitorsTime) ?? DEFAULT_VISITOR_SIGNOUT_MINUTES
  const globalEmployeesMinutes = parseTimeToMinutes(global.employeesTime) ?? DEFAULT_EMPLOYEE_SIGNOUT_MINUTES

  const visitorsEnabled = isOverrideSet(location?.visitorsEnabled)
    ? asBool(location?.visitorsEnabled, globalVisitorsEnabled)
    : globalVisitorsEnabled
  const employeesEnabled = isOverrideSet(location?.employeesEnabled)
    ? asBool(location?.employeesEnabled, globalEmployeesEnabled)
    : globalEmployeesEnabled

  const visitorsTargetMinutes = parseTimeToMinutes(location?.visitorsTime) ?? globalVisitorsMinutes
  const employeesTargetMinutes = parseTimeToMinutes(location?.employeesTime) ?? globalEmployeesMinutes

  return {
    visitorsEnabled,
    visitorsTime: formatMinutesAsTime(visitorsTargetMinutes),
    visitorsTargetMinutes,
    employeesEnabled,
    employeesTime: formatMinutesAsTime(employeesTargetMinutes),
    employeesTargetMinutes,
  }
}

export function locationOverrideFromRow(row: {
  auto_sign_out_visitors?: unknown
  auto_sign_out_visitors_time?: unknown
  auto_sign_out_employees?: unknown
  auto_sign_out_employees_time?: unknown
} | null | undefined): LocationAutoSignOutOverride {
  if (!row) return {}
  return {
    visitorsEnabled: row.auto_sign_out_visitors,
    visitorsTime: row.auto_sign_out_visitors_time,
    employeesEnabled: row.auto_sign_out_employees,
    employeesTime: row.auto_sign_out_employees_time,
  }
}

export type ParseOverrideResult<T> =
  | { ok: true; set: false }
  | { ok: true; set: true; value: T }
  | { ok: false; error: string }

export function parseBoolOverride(value: unknown): ParseOverrideResult<boolean | null> {
  if (value === undefined) return { ok: true, set: false }
  if (value === null || value === "") return { ok: true, set: true, value: null }
  if (value === true || value === "true") return { ok: true, set: true, value: true }
  if (value === false || value === "false") return { ok: true, set: true, value: false }
  return { ok: false, error: "Enable override must be on, off, or empty for the global default." }
}

export function parseTimeOverride(value: unknown): ParseOverrideResult<string | null> {
  if (value === undefined) return { ok: true, set: false }
  if (value === null || value === "") return { ok: true, set: true, value: null }
  const minutes = parseTimeToMinutes(value)
  if (minutes === null) return { ok: false, error: "Time override must be HH:MM or empty for the global default." }
  return { ok: true, set: true, value: formatMinutesAsTime(minutes) }
}

export function stripLocationAutoSignOutColumns<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  for (const key of LOCATION_AUTO_SIGNOUT_COLUMNS) {
    delete next[key]
  }
  return next
}
