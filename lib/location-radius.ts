/**
 * Sign-in radius rules shared by the admin form, the save API, and the fence.
 *
 * 0 means the admin turned the fence off for that site. Any other saved value
 * must be 25 to 5000 metres. A missing value uses 500 m and keeps the fence on.
 */

export const MIN_RADIUS_METERS = 25
export const MAX_RADIUS_METERS = 5000
export const DEFAULT_RADIUS_METERS = 500

export type RadiusParseOk = {
  ok: true
  meters: number
  enabled: boolean
}

export type RadiusParseResult =
  | RadiusParseOk
  | { ok: false; error: string }

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Validate a radius the admin is trying to save.
 *
 * `previous` lets an already-stored out-of-range value (from before the cap)
 * stay put until someone edits it. New values and edits must be 0 or 25-5000.
 */
export function parseLocationRadius(value: unknown, previous?: number | null): RadiusParseResult {
  if (value === false) {
    return { ok: true, meters: 0, enabled: false }
  }
  if (value === null || value === undefined || value === "") {
    return { ok: true, meters: DEFAULT_RADIUS_METERS, enabled: true }
  }

  const n = asFiniteNumber(value)
  if (n === null) {
    return { ok: false, error: "Radius must be a number of metres." }
  }

  const meters = Math.round(n)
  if (meters === 0) {
    return { ok: true, meters: 0, enabled: false }
  }

  if (
    previous != null &&
    Number.isFinite(previous) &&
    meters === Math.round(previous) &&
    (previous < MIN_RADIUS_METERS || previous > MAX_RADIUS_METERS)
  ) {
    return { ok: true, meters, enabled: true }
  }

  if (meters < MIN_RADIUS_METERS || meters > MAX_RADIUS_METERS) {
    return {
      ok: false,
      error: `Radius must be between ${MIN_RADIUS_METERS} and ${MAX_RADIUS_METERS} m, or 0 to turn the on-site check off.`,
    }
  }

  return { ok: true, meters, enabled: true }
}

/** Metres below 1000 stay in m. 1000 and above use km. */
export function formatRadiusMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "not set"
  const abs = Math.abs(meters)
  if (abs < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  if (Math.abs(km - Math.round(km)) < 0.05) {
    return `${Math.round(km).toLocaleString("en-US")} km`
  }
  return `${km.toFixed(1)} km`
}

export function radiusOverCap(meters: number | null | undefined): boolean {
  return typeof meters === "number" && meters > MAX_RADIUS_METERS
}
