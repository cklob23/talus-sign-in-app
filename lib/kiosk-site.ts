import { formatRadiusMeters } from "@/lib/location-radius"
import { fill } from "@/lib/visitor-i18n"

export const KIOSK_STAFF_SITE_KEY = "talus_kiosk_staff_site"

const VISITOR_FLOW_MODES = new Set([
  "visitor-type",
  "sign-in",
  "booking",
  "training",
  "cleared",
  "code",
  "nda",
  "photo",
  "sign-out",
])

export function isVisitorFlowMode(mode: string): boolean {
  return VISITOR_FLOW_MODES.has(mode)
}

const EMPLOYEE_NEAREST_SITE_MODES = new Set([
  "employee-login",
  "receptionist-login",
])

/** Employee unlock + staff sign-in: nearest/resolved site only, never a full picker. */
export function isEmployeeNearestSiteOnly(mode: string): boolean {
  return EMPLOYEE_NEAREST_SITE_MODES.has(mode)
}

export function nearestOnlyLocations<T extends { id: string }>(
  locations: T[],
  resolvedId: string | null,
): T[] {
  if (!resolvedId) return []
  return locations.filter((location) => location.id === resolvedId)
}

export function readStaffSite(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(KIOSK_STAFF_SITE_KEY)
  } catch {
    return null
  }
}

export function writeStaffSite(id: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KIOSK_STAFF_SITE_KEY, id)
  } catch {
    // localStorage can be blocked in kiosk lockdown
  }
}

export function formatSiteDistance(meters: number): string {
  return formatRadiusMeters(meters)
}

export function formatHeaderSiteLine(opts: {
  siteName: string
  meters: number | null
  unavailable: boolean
  copy: { locationUnavailable: string; siteDistanceAway: string; checkingLocation: string }
  includeDistance?: boolean
  detecting?: boolean
}): string {
  if (opts.detecting) return opts.siteName || opts.copy.checkingLocation
  if (opts.unavailable) return `${opts.siteName} · ${opts.copy.locationUnavailable}`
  if (opts.includeDistance === false || opts.meters == null || !Number.isFinite(opts.meters)) {
    return opts.siteName
  }
  return fill(opts.copy.siteDistanceAway, {
    site: opts.siteName,
    distance: formatSiteDistance(opts.meters),
  })
}

export type KioskSiteSource = "nearest" | "persisted" | "current" | "default" | "none"

export function resolveKioskSite(input: {
  locations: { id: string }[]
  nearestId: string | null
  persistedId: string | null
  currentId: string | null
  gpsReady: boolean
  freeze: boolean
}): { id: string | null; source: KioskSiteSource } {
  if (input.locations.length === 0) return { id: null, source: "none" }
  const ids = new Set(input.locations.map((location) => location.id))
  const valid = (id: string | null | undefined) => (id && ids.has(id) ? id : null)

  if (input.freeze && valid(input.currentId)) {
    return { id: input.currentId, source: "current" }
  }
  if (input.gpsReady && valid(input.nearestId)) {
    return { id: input.nearestId, source: "nearest" }
  }
  if (valid(input.persistedId)) {
    return { id: input.persistedId, source: "persisted" }
  }
  if (valid(input.currentId)) {
    return { id: input.currentId, source: "current" }
  }
  return { id: input.locations[0].id, source: "default" }
}

export type HeaderLocationKind = "none" | "detecting" | "unavailable" | "distance" | "name-only"

export function headerLocationKind(input: {
  hasLocations: boolean
  geoError: string | null
  hasFix: boolean
  isDetecting: boolean
  meters: number | null
}): HeaderLocationKind {
  // Show the header spinner while GPS is still settling, including the brief
  // window before the locations list arrives.
  if (!input.geoError && input.isDetecting && !input.hasFix) return "detecting"
  if (!input.hasLocations) return "none"
  if (input.geoError === "permission_denied" || input.geoError) return "unavailable"
  if (!input.hasFix) return "unavailable"
  if (input.meters != null && Number.isFinite(input.meters)) return "distance"
  return "name-only"
}

/** One unlocked header site line, shown on mobile and desktop when a site exists or GPS is settling. */
export function shouldShowUnlockedHeaderSiteLine(input: {
  siteKind: HeaderLocationKind
  hasLocation: boolean
}): boolean {
  if (input.siteKind === "none") return false
  if (input.siteKind === "detecting") return true
  return input.hasLocation
}

/** Wrapper classes for that single site line. Must stay visible at ~390px — never `hidden`. */
export function unlockedHeaderSiteLineClassName(): string {
  return "min-w-0 max-w-[42%] md:max-w-none"
}
