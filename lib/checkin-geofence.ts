/**
 * Shared on-site check for QR self check-in and the kiosk.
 *
 * A poster QR code is just a URL, so anyone who photographs it or saves the
 * link could open the form from anywhere. To stop that, the device reports its
 * position and the server verifies it lies within the location's sign-in
 * radius before a sign-in or sign-out is written.
 *
 * Everything in this file is plain arithmetic with no browser or database
 * access, so it can run on the server (where the decision must be made) and
 * on the client (to give an early, friendly answer).
 *
 * Extra anti-spoof layers (fresh timestamp, jump detection, rate limit) live
 * in lib/geofence-guard.ts and run only on the server.
 *
 * Remaining limits, honestly:
 * - A client can still POST invented coordinates with a fresh timestamp.
 * - There is no device attestation or OS-level proof of GPS.
 * - Rate limits and jump history are per process unless 011-geofence.sql
 *   has been applied.
 * - The check stops casual misuse (a photo of the poster opened off site).
 *   It does not stop a determined attacker who sends the site's coordinates.
 */

import { DEFAULT_RADIUS_METERS, formatRadiusMeters } from "@/lib/location-radius"

export { DEFAULT_RADIUS_METERS, formatRadiusMeters, MAX_RADIUS_METERS, MIN_RADIUS_METERS } from "@/lib/location-radius"

export interface DeviceCoords {
  lat: number
  lng: number
  /** Reported horizontal accuracy in metres (68% confidence radius). */
  accuracy: number
  /** GeolocationPosition.timestamp (ms). Required on the server. */
  timestamp?: number
}

export interface GeofenceTarget {
  latitude: number | null
  longitude: number | null
  auto_signin_radius_meters: number | null
  /** Present after 011-geofence.sql. false is an explicit off. */
  geofence_enabled?: boolean | null
}

/**
 * Cap on how much GPS uncertainty we forgive. Without a cap a spoofed
 * "accuracy: 50000" would let any reading through. 100 m covers a poor indoor
 * fix while still keeping someone across town out.
 */
export const MAX_ACCURACY_CREDIT_METERS = 100

/** Readings looser than this are useless for a decision and are rejected outright. */
export const MAX_USABLE_ACCURACY_METERS = 2000

/** Haversine great-circle distance in metres. Accurate to well under 0.5%. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371008.8
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** True when the location has coordinates, i.e. a geofence can be evaluated. */
export function hasGeofence(target: GeofenceTarget): target is GeofenceTarget & {
  latitude: number
  longitude: number
} {
  return (
    typeof target.latitude === "number" &&
    Number.isFinite(target.latitude) &&
    typeof target.longitude === "number" &&
    Number.isFinite(target.longitude)
  )
}

/**
 * Missing or zero radius means the fence is off only when the admin turned
 * it off: geofence_enabled === false, or radius exactly 0. A null radius
 * keeps the fence on and uses the 500 m default.
 */
export function isGeofenceEnabled(target: GeofenceTarget): boolean {
  if (target.geofence_enabled === false) return false
  if (target.geofence_enabled === true) return true
  return target.auto_signin_radius_meters !== 0
}

export function shouldEnforceGeofence(target: GeofenceTarget, globallyRequired = true): boolean {
  return globallyRequired && hasGeofence(target) && isGeofenceEnabled(target)
}

export function effectiveRadius(target: GeofenceTarget): number {
  const r = target.auto_signin_radius_meters
  return typeof r === "number" && r > 0 ? r : DEFAULT_RADIUS_METERS
}

export type GeofenceFailReason =
  | "no_coords"
  | "stale_coords"
  | "poor_accuracy"
  | "outside"
  | "impossible_jump"
  | "rate_limited"

export type GeofenceVerdict =
  | { ok: true; distance: number; radius: number }
  | { ok: false; reason: GeofenceFailReason; distance: number | null; radius: number }

/**
 * Decide whether a device reading counts as "on site".
 *
 * The visitor is allowed in when the centre of their reading, minus a capped
 * accuracy allowance, is inside the radius. So a 20 m-accurate fix 510 m away
 * passes a 500 m fence; a 20 m fix 600 m away does not.
 *
 * Missing or negative accuracy gets no credit (0 m). It used to be treated as
 * 2000 m, which still received the full 100 m credit.
 */
export function evaluateGeofence(
  target: GeofenceTarget & { latitude: number; longitude: number },
  coords: DeviceCoords | null | undefined,
): GeofenceVerdict {
  const radius = effectiveRadius(target)

  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    return { ok: false, reason: "no_coords", distance: null, radius }
  }

  const accuracy = Number.isFinite(coords.accuracy) && coords.accuracy >= 0 ? coords.accuracy : 0
  if (accuracy > MAX_USABLE_ACCURACY_METERS) {
    return { ok: false, reason: "poor_accuracy", distance: null, radius }
  }

  const distance = distanceMeters(coords.lat, coords.lng, target.latitude, target.longitude)
  const credit = Math.min(accuracy, MAX_ACCURACY_CREDIT_METERS)

  if (distance - credit <= radius) {
    return { ok: true, distance, radius }
  }
  return { ok: false, reason: "outside", distance, radius }
}

/** Parse an untrusted request body field into DeviceCoords, or null. */
export function parseDeviceCoords(input: unknown): DeviceCoords | null {
  if (!input || typeof input !== "object") return null
  const o = input as Record<string, unknown>
  const lat = Number(o.lat)
  const lng = Number(o.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const accuracyRaw = o.accuracy
  const accuracy =
    accuracyRaw === undefined || accuracyRaw === null
      ? 0
      : Number(accuracyRaw)
  const timestampRaw = o.timestamp
  const timestamp =
    timestampRaw === undefined || timestampRaw === null
      ? undefined
      : Number(timestampRaw)
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : 0,
    timestamp: typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : undefined,
  }
}

export function formatMeters(meters: number): string {
  return formatRadiusMeters(meters)
}

export function kioskClientGate(input: {
  target: GeofenceTarget | null | undefined
  coords: DeviceCoords | null
  geoError: string | null
  isDetecting: boolean
  staffOverride?: boolean
}): {
  blocked: boolean
  reason: "off" | "checking" | "denied" | "no_fix" | "outside" | "poor_accuracy" | "ok"
  verdict: GeofenceVerdict | null
} {
  const { target, coords, geoError, isDetecting, staffOverride } = input
  if (!target || !shouldEnforceGeofence(target)) {
    return { blocked: false, reason: "off", verdict: null }
  }
  if (staffOverride) {
    return { blocked: false, reason: "ok", verdict: null }
  }
  if (geoError === "permission_denied") {
    return { blocked: true, reason: "denied", verdict: null }
  }
  if (isDetecting && !coords) {
    return { blocked: true, reason: "checking", verdict: null }
  }
  if (!coords) {
    return { blocked: true, reason: "no_fix", verdict: null }
  }
  if (!hasGeofence(target)) {
    return { blocked: false, reason: "off", verdict: null }
  }
  const verdict = evaluateGeofence(target, coords)
  if (verdict.ok) return { blocked: false, reason: "ok", verdict }
  if (verdict.reason === "poor_accuracy") {
    return { blocked: true, reason: "poor_accuracy", verdict }
  }
  return { blocked: true, reason: "outside", verdict }
}
