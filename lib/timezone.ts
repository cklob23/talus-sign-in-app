/**
 * Timezone utilities for converting UTC dates to location-specific times
 * All dates are stored in UTC in the database and converted to local time for display
 */

/**
 * Mapping from Windows timezone names to IANA timezone identifiers
 * JavaScript's Intl.DateTimeFormat requires IANA timezone names
 */
const WINDOWS_TO_IANA: Record<string, string> = {
  // North America
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaska Standard Time": "America/Anchorage",
  "Hawaii-Aleutian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  "Newfoundland Standard Time": "America/St_Johns",
  
  // Europe
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Romance Standard Time": "Europe/Paris",
  "Central European Standard Time": "Europe/Warsaw",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Bucharest",
  "Russian Standard Time": "Europe/Moscow",
  
  // Africa
  "E. Africa Standard Time": "Africa/Nairobi",
  "South Africa Standard Time": "Africa/Johannesburg",
  "Egypt Standard Time": "Africa/Cairo",
  "Morocco Standard Time": "Africa/Casablanca",
  "W. Central Africa Standard Time": "Africa/Lagos",
  
  // Asia
  "Arab Standard Time": "Asia/Riyadh",
  "Arabian Standard Time": "Asia/Dubai",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Korea Standard Time": "Asia/Seoul",
  "Singapore Standard Time": "Asia/Singapore",
  "SE Asia Standard Time": "Asia/Bangkok",
  "West Asia Standard Time": "Asia/Karachi",
  "Pakistan Standard Time": "Asia/Karachi",
  "Bangladesh Standard Time": "Asia/Dhaka",
  
  // Australia & Pacific
  "AUS Eastern Standard Time": "Australia/Sydney",
  "AUS Central Standard Time": "Australia/Darwin",
  "E. Australia Standard Time": "Australia/Brisbane",
  "Cen. Australia Standard Time": "Australia/Adelaide",
  "W. Australia Standard Time": "Australia/Perth",
  "New Zealand Standard Time": "Pacific/Auckland",
  "Fiji Standard Time": "Pacific/Fiji",
  
  // South America
  "E. South America Standard Time": "America/Sao_Paulo",
  "Argentina Standard Time": "America/Buenos_Aires",
  "SA Pacific Standard Time": "America/Bogota",
  "Venezuela Standard Time": "America/Caracas",
  "Central America Standard Time": "America/Guatemala",
  "SA Western Standard Time": "America/La_Paz",
  "SA Eastern Standard Time": "America/Cayenne",
  
  // UTC
  "UTC": "UTC",
  "Coordinated Universal Time": "UTC",
}

/** Used for host emails and the /visit page when a location has no timezone. */
export const DEFAULT_DISPLAY_TIMEZONE = "America/New_York"

/**
 * Convert a Windows timezone name to an IANA timezone identifier
 * Returns the original string if it's already an IANA identifier or unknown
 */
export function toIANATimezone(timezone: string): string {
  if (!timezone) return "UTC"

  if (WINDOWS_TO_IANA[timezone]) {
    return WINDOWS_TO_IANA[timezone]
  }

  return timezone
}

/** Location timezone for display. Empty/missing values use America/New_York, not UTC. */
export function resolveDisplayTimeZone(timezone?: string | null): string {
  const raw = typeof timezone === "string" ? timezone.trim() : ""
  if (!raw) return DEFAULT_DISPLAY_TIMEZONE
  return toIANATimezone(raw)
}

function timezoneParts(
  date: Date,
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
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
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

/** UTC instant for a wall-clock time in the given IANA zone. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string,
): Date {
  const iana = toIANATimezone(timezone)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)
  const asZone = timezoneParts(new Date(utcGuess), iana)
  const asUTC = Date.UTC(asZone.year, asZone.month - 1, asZone.day, asZone.hour, asZone.minute, asZone.second)
  return new Date(utcGuess - (asUTC - utcGuess))
}

/**
 * Start of "today" in a location or display timezone, as a UTC Date.
 * Dashboard counters and charts must use this instead of UTC midnight.
 */
export function startOfDayInTimezone(timezone: string, now: Date = new Date()): Date {
  const iana = toIANATimezone(timezone)
  try {
    const parts = timezoneParts(now, iana)
    return zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, iana)
  } catch {
    const fallback = new Date(now)
    fallback.setUTCHours(0, 0, 0, 0)
    return fallback
  }
}

const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * Parse a datetime-local value (YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss)
 * as a wall clock in `timezone` and return the UTC instant.
 * Do not use `new Date(localDatetime)`: that uses the runtime timezone.
 */
export function localDatetimeToUtc(localDatetime: string, timezone: string): Date | null {
  if (!localDatetime || typeof localDatetime !== "string") return null
  const match = localDatetime.trim().match(LOCAL_DATETIME_RE)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6] || 0)
  if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) return null
  try {
    return zonedTimeToUtc(year, month, day, hour, minute, second, timezone)
  } catch {
    return null
  }
}

/** Half-open [start, end) UTC range covering the local calendar day of `now`. */
export function localDayBounds(timezone: string, now: Date = new Date()): { start: Date; end: Date } {
  const iana = toIANATimezone(timezone)
  const parts = timezoneParts(now, iana)
  const start = zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, iana)
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1))
  const end = zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, iana)
  return { start, end }
}

/** True when `utcIso` falls on the same local calendar day as `reference` in `timezone`. */
export function isSameLocalDay(utcIso: string, timezone: string, reference: Date = new Date()): boolean {
  const instant = new Date(utcIso)
  if (Number.isNaN(instant.getTime())) return false
  const iana = toIANATimezone(timezone)
  const a = timezoneParts(instant, iana)
  const b = timezoneParts(reference, iana)
  return a.year === b.year && a.month === b.month && a.day === b.day
}

/** Date + time in the site timezone, with a short zone label (CST, EAT, UTC). */
export function formatDateTimeWithZone(utcDateString: string, timezone = "UTC"): string {
  const stamp = formatInTimezone(utcDateString, timezone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  return `${stamp} ${getTimezoneAbbreviation(timezone)}`
}

export function formatTimeWithZone(utcDateString: string, timezone = "UTC"): string {
  return `${formatTime(utcDateString, timezone)} ${getTimezoneAbbreviation(timezone)}`
}

/**
 * Format a UTC date string to a specific timezone
 * @param utcDateString - ISO date string in UTC (from database)
 * @param timezone - IANA timezone string (e.g., "America/Chicago", "Europe/London")
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string in the specified timezone
 */
export function formatInTimezone(
  utcDateString: string,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  try {
    const date = new Date(utcDateString)
    const ianaTimezone = toIANATimezone(timezone)
    return new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimezone,
      ...options,
    }).format(date)
  } catch {
    // Fallback to UTC if timezone is invalid
    const date = new Date(utcDateString)
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      ...options,
    }).format(date)
  }
}

/**
 * Format a UTC date to a short datetime string in the location's timezone
 * Example: "Jan 15, 2:30 PM"
 */
export function formatDateTime(utcDateString: string, timezone = "UTC"): string {
  return formatInTimezone(utcDateString, timezone, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Format a UTC date to a time-only string in the location's timezone
 * Example: "2:30 PM"
 */
export function formatTime(utcDateString: string, timezone = "UTC"): string {
  return formatInTimezone(utcDateString, timezone, {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Format a UTC date to a date-only string in the location's timezone
 * Example: "Jan 15, 2024"
 */
export function formatDate(utcDateString: string, timezone = "UTC"): string {
  return formatInTimezone(utcDateString, timezone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Format a UTC date to a full datetime string in the location's timezone
 * Example: "January 15, 2024 at 2:30 PM"
 */
export function formatFullDateTime(utcDateString: string, timezone = "UTC"): string {
  return formatInTimezone(utcDateString, timezone, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Format a UTC date to a relative time string (e.g., "2 hours ago", "in 5 minutes")
 * This is timezone-aware
 */
export function formatRelativeTime(utcDateString: string): string {
  const date = new Date(utcDateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 0) {
    // Future time
    const absMins = Math.abs(diffMins)
    if (absMins < 60) return `in ${absMins}m`
    const absHours = Math.floor(absMins / 60)
    if (absHours < 24) return `in ${absHours}h`
    return `in ${Math.floor(absHours / 24)}d`
  }

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(utcDateString, "UTC")
}

/**
 * Get the current time in a specific timezone as an ISO string
 * Useful for creating timestamps in local time context
 */
export function getCurrentTimeInTimezone(timezone: string): string {
  const now = new Date()
  return now.toISOString()
}

/**
 * Format the timezone abbreviation (e.g., "CST", "EST", "PST")
 */
export function getTimezoneAbbreviation(timezone: string): string {
  try {
    const date = new Date()
    const ianaTimezone = toIANATimezone(timezone)
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimezone,
      timeZoneName: "short",
    })
    const parts = formatter.formatToParts(date)
    const tzPart = parts.find(part => part.type === "timeZoneName")
    return tzPart?.value || timezone
  } catch {
    return timezone
  }
}

/**
 * Calculate duration between two times
 */
export function formatDuration(startUtc: string, endUtc: string | null): string {
  if (!endUtc) return "Active"
  const start = new Date(startUtc)
  const end = new Date(endUtc)
  const mins = Math.floor((end.getTime() - start.getTime()) / (1000 * 60))
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}
