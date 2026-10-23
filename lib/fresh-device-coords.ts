/**
 * Fresh GPS read used immediately before a QR (and kiosk) geofence POST.
 *
 * The location gate / kiosk watch often stops once the visitor is verified.
 * Filling in details, host, training, and a photo takes minutes, so that first
 * fix is older than the server's 45 s freshness window by the time they submit.
 *
 * Call this right before POST. Prefer a new getCurrentPosition; if that fails,
 * reuse the latest watch fix only when it is still under 45 s old.
 */

import type { DeviceCoords } from "@/lib/checkin-geofence"
import { MAX_COORDS_AGE_MS } from "@/lib/geofence-guard"

/** Matches the navigator.geolocation.getCurrentPosition options we pass. */
export const FRESH_POSITION_TIMEOUT_MS = 10_000

export const FRESH_POSITION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: FRESH_POSITION_TIMEOUT_MS,
} as const

/** Same wording the server returns for geofence_stale_coords. */
export const STALE_LOCATION_MESSAGE =
  "Your location reading is too old. Refresh your position and try again."

export type PositionLike = {
  coords: { latitude: number; longitude: number; accuracy: number }
  timestamp: number
}

export type GeoReader = {
  getCurrentPosition: (
    successCallback: (position: PositionLike) => void,
    errorCallback?: (error: { code?: number; message?: string }) => void,
    options?: { enableHighAccuracy?: boolean; maximumAge?: number; timeout?: number },
  ) => void
}

export type ResolveFreshCoordsResult =
  | { ok: true; coords: DeviceCoords; source: "fresh" | "fallback" }
  | { ok: false; reason: "unavailable" }

export function coordsFromPosition(position: PositionLike): DeviceCoords {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  }
}

/** True when a watch fix is still young enough for the server 45 s check. */
export function isWatchFixFresh(coords: DeviceCoords | null | undefined, now = Date.now()): coords is DeviceCoords {
  if (!coords) return false
  const ts = coords.timestamp
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false
  if (ts > now + 10_000) return false
  return now - ts <= MAX_COORDS_AGE_MS
}

function defaultGeo(): GeoReader | null {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null
  return navigator.geolocation
}

function readCurrentPosition(geo: GeoReader, timeoutMs: number): Promise<DeviceCoords | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: DeviceCoords | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs + 250)
    try {
      geo.getCurrentPosition(
        (position) => {
          clearTimeout(timer)
          finish(coordsFromPosition(position))
        },
        () => {
          clearTimeout(timer)
          finish(null)
        },
        { ...FRESH_POSITION_OPTIONS, timeout: timeoutMs },
      )
    } catch {
      clearTimeout(timer)
      finish(null)
    }
  })
}

/**
 * Resolve coordinates to POST for QR sign-in or QR sign-out.
 *
 * `action` is documented so tests can cover each call site; both use the same
 * read-then-fallback rule.
 */
export async function resolveFreshDeviceCoords(input: {
  fallback?: DeviceCoords | null
  geo?: GeoReader | null
  now?: number
  timeoutMs?: number
  /** Which POST this read is for. Does not change behaviour. */
  action?: "signin" | "signout"
}): Promise<ResolveFreshCoordsResult> {
  const now = input.now ?? Date.now()
  const geo = input.geo === undefined ? defaultGeo() : input.geo
  const timeoutMs = input.timeoutMs ?? FRESH_POSITION_TIMEOUT_MS

  if (geo) {
    const fresh = await readCurrentPosition(geo, timeoutMs)
    if (fresh) return { ok: true, coords: fresh, source: "fresh" }
  }

  if (isWatchFixFresh(input.fallback ?? null, now)) {
    return { ok: true, coords: input.fallback, source: "fallback" }
  }

  return { ok: false, reason: "unavailable" }
}
