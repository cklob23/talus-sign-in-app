/**
 * Extra server-side checks on top of the distance verdict.
 *
 * Browser GPS can be invented. These layers make casual spoofing louder and
 * slower. They cannot prove a device is physically at the site.
 *
 * Remaining limits:
 * - A client can still POST invented coordinates with a fresh timestamp.
 * - There is no device attestation or OS-level proof of GPS.
 * - Rate limits and jump history live in this process (one Render instance).
 * - An optional geofence_sightings table survives restarts when present.
 * - IP geolocation is not used as a hard block (VPNs and shared egress).
 * - The check stops a photo of the poster opened off site. It does not stop a
 *   determined attacker who sends the site's coordinates.
 */

import { distanceMeters, type DeviceCoords } from "@/lib/checkin-geofence"
import { rateLimit } from "@/lib/rate-limit"

/** Readings older than this are treated as stale (or replayed). */
export const MAX_COORDS_AGE_MS = 45_000
/** Allow a little clock skew between the phone and the server. */
export const MAX_COORDS_FUTURE_MS = 10_000
/** Ground travel faster than this between two readings is treated as a spoof. */
export const MAX_JUMP_METERS_PER_SEC = 80
/** Even over a long gap, a teleport this large is rejected. */
export const MAX_JUMP_METERS_ABS = 200_000
export const RATE_LIMIT_WINDOW_MS = 60_000
export const RATE_LIMIT_MAX = 20

export type Sighting = {
  lat: number
  lng: number
  seenAt: number
}

const sightings = new Map<string, Sighting>()

export function resetGeofenceSightings(): void {
  sightings.clear()
}

export function getGeofenceSighting(scopeKey: string): Sighting | undefined {
  return sightings.get(scopeKey)
}

export function recordGeofenceSighting(scopeKey: string, lat: number, lng: number, seenAt: number): void {
  sightings.set(scopeKey, { lat, lng, seenAt })
}

export function rateLimitGeofence(scopeKey: string): { allowed: boolean; remaining: number } {
  return rateLimit(`geofence:${scopeKey}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
}

export type FreshnessReason = "ok" | "no_coords" | "stale_coords"

export function checkCoordsFreshness(coords: DeviceCoords | null, now = Date.now()): FreshnessReason {
  if (!coords) return "no_coords"
  const ts = coords.timestamp
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "stale_coords"
  if (ts > now + MAX_COORDS_FUTURE_MS) return "stale_coords"
  if (now - ts > MAX_COORDS_AGE_MS) return "stale_coords"
  return "ok"
}

export function isImpossibleJump(
  previous: Sighting | null | undefined,
  next: DeviceCoords,
  now = Date.now(),
): boolean {
  if (!previous) return false
  const dtSec = Math.max(0, (now - previous.seenAt) / 1000)
  const moved = distanceMeters(previous.lat, previous.lng, next.lat, next.lng)
  if (moved >= MAX_JUMP_METERS_ABS) return true
  if (dtSec <= 0) return moved > 250
  const speed = moved / dtSec
  return speed > MAX_JUMP_METERS_PER_SEC
}

export function geofenceScopeKey(kind: "qr" | "kiosk", id: string, ip: string): string {
  return `${kind}:${id}:${ip}`
}
