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
  copy: { locationUnavailable: string; siteDistanceAway: string }
}): string {
  if (opts.unavailable) return `${opts.siteName} · ${opts.copy.locationUnavailable}`
  if (opts.meters == null || !Number.isFinite(opts.meters)) return opts.siteName
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
  if (!input.hasLocations) return "none"
  if (input.geoError === "permission_denied" || input.geoError) return "unavailable"
  if (input.isDetecting && !input.hasFix) return "detecting"
  if (!input.hasFix) return "unavailable"
  if (input.meters != null && Number.isFinite(input.meters)) return "distance"
  return "name-only"
}
