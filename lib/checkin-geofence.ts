/**
 * Geofence rules for QR self check-in.
 *
 * A poster QR code is just a URL, so anyone who photographs it or saves the
 * link could open the form from anywhere. To stop that, the visitor's device
 * reports its position and the server verifies it lies within the location's
 * sign-in radius before a sign-in or sign-out is written.
 *
 * Everything here is plain arithmetic with no browser or database access, so
 * it can run on the server (where the decision must be made) and on the client
 * (to give the visitor an early, friendly answer).
 */

export interface DeviceCoords {
    lat: number
    lng: number
    /** Reported horizontal accuracy in metres (68% confidence radius). */
    accuracy: number
}

export interface GeofenceTarget {
    latitude: number | null
    longitude: number | null
    auto_signin_radius_meters: number | null
}

/**
 * Cap on how much GPS uncertainty we forgive. Without a cap a spoofed
 * "accuracy: 50000" would let any reading through. 100m covers a poor indoor
 * fix while still keeping someone across town out.
 */
export const MAX_ACCURACY_CREDIT_METERS = 100

/** Readings looser than this are useless for a decision and are rejected outright. */
export const MAX_USABLE_ACCURACY_METERS = 2000

/** Fallback when a location has coordinates but no radius configured. */
export const DEFAULT_RADIUS_METERS = 500

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

export function effectiveRadius(target: GeofenceTarget): number {
    const r = target.auto_signin_radius_meters
    return typeof r === "number" && r > 0 ? r : DEFAULT_RADIUS_METERS
}

export type GeofenceVerdict =
    | { ok: true; distance: number; radius: number }
    | { ok: false; reason: "no_coords" | "poor_accuracy" | "outside"; distance: number | null; radius: number }

/**
 * Decide whether a device reading counts as "on site".
 *
 * The visitor is allowed in when the centre of their reading, minus a capped
 * accuracy allowance, is inside the radius. So a 20m-accurate fix 510m away
 * passes a 500m fence; a 20m fix 600m away does not.
 */
export function evaluateGeofence(
    target: GeofenceTarget & { latitude: number; longitude: number },
    coords: DeviceCoords | null | undefined,
): GeofenceVerdict {
    const radius = effectiveRadius(target)

    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
        return { ok: false, reason: "no_coords", distance: null, radius }
    }

    const accuracy = Number.isFinite(coords.accuracy) && coords.accuracy >= 0 ? coords.accuracy : MAX_USABLE_ACCURACY_METERS
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
    const accuracy = Number(o.accuracy)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    return { lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : MAX_USABLE_ACCURACY_METERS }
}

export function formatMeters(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)} m`
    return `${(meters / 1000).toFixed(1)} km`
}
