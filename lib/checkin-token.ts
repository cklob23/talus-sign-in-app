import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { isUndefinedColumn } from "@/lib/idempotency"
import { hasGeofence, type GeofenceVerdict } from "@/lib/checkin-geofence"
import { enforceServerGeofence } from "@/lib/geofence-enforce"

/**
 * Shared resolution of a public check-in token.
 *
 * Both the check-in page and the sign-in API go through this so the rules
 * (token must be active, feature must be enabled) can never drift apart.
 */

export interface CheckinLocation {
  id: string
  name: string
  address: string | null
  timezone: string | null
  latitude: number | null
  longitude: number | null
  auto_signin_radius_meters: number | null
  geofence_enabled?: boolean | null
}

export type CheckinTokenResult =
  | { ok: true; location: CheckinLocation; geofenceRequired: boolean }
  | { ok: false; reason: string; status: number; kind: "invalid" | "disabled" }

async function readGlobalFlag(key: string, fallback: boolean): Promise<boolean> {
  const admin = getAdminClient()
  const { data } = await admin.from("settings").select("value").eq("key", key).is("location_id", null).maybeSingle()
  if (data === null || data === undefined) return fallback
  return data.value === true || data.value === "true"
}

/** True when QR check-in is switched on globally in Settings. */
export async function isQrCheckinEnabled(): Promise<boolean> {
  return readGlobalFlag("qr_checkin_enabled", false)
}

/**
 * True when visitors must prove they are physically at the site.
 *
 * Defaults to on: the whole point of a poster is that you have to be standing
 * in front of it. Admins can switch it off in Settings if a site has no GPS
 * coverage.
 */
export async function isQrGeofenceEnabled(): Promise<boolean> {
  return readGlobalFlag("qr_checkin_geofence_enabled", true)
}

/**
 * Server-side gate shared by the sign-in and sign-out routes.
 *
 * Returns a ready-to-send error response when the visitor must be turned
 * away, or the verdict (for audit metadata) when they may proceed. A location
 * without coordinates cannot be fenced, so it is allowed through with a null
 * verdict; the admin UI flags those sites.
 */
export async function enforceCheckinGeofence(
  location: CheckinLocation,
  geofenceRequired: boolean,
  rawCoords: unknown,
  request: Request,
  token: string,
): Promise<{ blocked: NextResponse | null; verdict: GeofenceVerdict | null }> {
  const result = await enforceServerGeofence({
    location,
    globallyRequired: geofenceRequired,
    rawCoords,
    request,
    source: "qr",
    scopeId: token,
  })
  return { blocked: result.blocked, verdict: result.verdict }
}

export async function resolveCheckinToken(token: string): Promise<CheckinTokenResult> {
  // Cheap sanity check before touching the database.
  if (!token || token.length < 16 || token.length > 128) {
    return { ok: false, reason: "This QR code is not valid.", status: 404, kind: "invalid" }
  }

  const admin = getAdminClient()
  const selectWithFlag =
    "location_id, locations ( id, name, address, timezone, latitude, longitude, auto_signin_radius_meters, geofence_enabled )"
  const selectLegacy =
    "location_id, locations ( id, name, address, timezone, latitude, longitude, auto_signin_radius_meters )"

  let data: { location_id?: string; locations?: unknown } | null = null
  let error: { code?: string; message?: string } | null = null
  const first = await admin
    .from("location_qr_codes")
    .select(selectWithFlag)
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle()
  data = first.data
  error = first.error
  if (error && isUndefinedColumn(error)) {
    const retry = await admin
      .from("location_qr_codes")
      .select(selectLegacy)
      .eq("token", token)
      .eq("is_active", true)
      .maybeSingle()
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.log("[v0] Check-in token lookup failed:", error.message)
    return { ok: false, reason: "Sign-in is temporarily unavailable.", status: 500, kind: "invalid" }
  }

  const joined = data?.locations
  const location = (Array.isArray(joined) ? joined[0] : joined) as CheckinLocation | undefined
  if (!location) {
    return {
      ok: false,
      reason: "This QR code is no longer active. Please ask reception to sign you in.",
      status: 404,
      kind: "invalid",
    }
  }

  const [enabled, geofenceRequired] = await Promise.all([isQrCheckinEnabled(), isQrGeofenceEnabled()])
  if (!enabled) {
    return {
      ok: false,
      reason: "Self sign-in is currently turned off. Please ask reception to sign you in.",
      status: 403,
      kind: "disabled",
    }
  }

  return { ok: true, location, geofenceRequired }
}

export { hasGeofence }
