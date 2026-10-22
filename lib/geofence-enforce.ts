import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { clientIp } from "@/lib/rate-limit"
import { isUndefinedColumn, isUndefinedTable } from "@/lib/idempotency"
import {
  effectiveRadius,
  evaluateGeofence,
  formatMeters,
  hasGeofence,
  isGeofenceEnabled,
  parseDeviceCoords,
  type GeofenceTarget,
  type GeofenceVerdict,
} from "@/lib/checkin-geofence"
import {
  checkCoordsFreshness,
  geofenceScopeKey,
  getGeofenceSighting,
  isImpossibleJump,
  rateLimitGeofence,
  recordGeofenceSighting,
} from "@/lib/geofence-guard"

export type EnforceGeofenceResult =
  | { blocked: NextResponse; verdict: Extract<GeofenceVerdict, { ok: false }> }
  | { blocked: null; verdict: GeofenceVerdict | null; override: boolean }

function fail(
  locationName: string,
  verdict: Extract<GeofenceVerdict, { ok: false }>,
): EnforceGeofenceResult {
  let error: string
  switch (verdict.reason) {
    case "no_coords":
      error = `Please allow location access so we can confirm you are at ${locationName}.`
      break
    case "stale_coords":
      error = "Your location reading is too old. Refresh your position and try again."
      break
    case "poor_accuracy":
      error = "We could not get an accurate fix on your location. Move outdoors or near a window and try again."
      break
    case "impossible_jump":
      error = "Your reported location changed too quickly to be trusted. Try again from this device."
      break
    case "rate_limited":
      error = "Too many location checks from this device. Wait a minute and try again."
      break
    default:
      error =
        verdict.distance !== null
          ? `You appear to be about ${formatMeters(verdict.distance)} from ${locationName}. You need to be on site to sign in.`
          : `You need to be at ${locationName} to sign in.`
  }

  const status = verdict.reason === "rate_limited" ? 429 : 403
  return {
    blocked: NextResponse.json(
      { error, code: `geofence_${verdict.reason}`, distance: verdict.distance },
      { status },
    ),
    verdict,
  }
}

async function logSuspicious(input: {
  locationId?: string
  locationName: string
  reason: string
  ip: string
  userAgent: string | null
  coords: ReturnType<typeof parseDeviceCoords>
  verdict: GeofenceVerdict | null
  source: "qr" | "kiosk"
  override?: boolean
  actorUserId?: string | null
}): Promise<void> {
  try {
    const admin = getAdminClient()
    await admin.from("audit_logs").insert({
      user_id: input.actorUserId || null,
      action: input.override ? "geofence.staff_override" : "geofence.suspicious",
      entity_type: "location",
      entity_id: input.locationId || null,
      description: input.override
        ? `Staff overrode the on-site check at ${input.locationName}`
        : `Rejected ${input.source} location check at ${input.locationName} (${input.reason})`,
      metadata: {
        source: input.source,
        reason: input.reason,
        location_name: input.locationName,
        lat: input.coords?.lat ?? null,
        lng: input.coords?.lng ?? null,
        accuracy: input.coords?.accuracy ?? null,
        timestamp: input.coords?.timestamp ?? null,
        distance_meters:
          input.verdict && input.verdict.distance !== null ? Math.round(input.verdict.distance) : null,
        radius_meters: input.verdict?.radius ?? null,
      },
      ip_address: input.ip,
      user_agent: input.userAgent,
    })
  } catch (error) {
    console.error("[geofence] audit log failed:", error)
  }
}

async function persistSighting(scopeKey: string, lat: number, lng: number, seenAt: number): Promise<void> {
  try {
    const admin = getAdminClient()
    const { error } = await admin.from("geofence_sightings").insert({
      scope_key: scopeKey,
      lat,
      lng,
      seen_at: new Date(seenAt).toISOString(),
    })
    if (error && (isUndefinedTable(error) || isUndefinedColumn(error))) return
  } catch {
    // Table is optional until 011-geofence.sql is applied.
  }
}

export async function loadLocationFence(
  locationId: string,
): Promise<(GeofenceTarget & { id: string; name: string }) | null> {
  const admin = getAdminClient()
  const full = await admin
    .from("locations")
    .select("id, name, latitude, longitude, auto_signin_radius_meters, geofence_enabled")
    .eq("id", locationId)
    .maybeSingle()
  if (full.error && isUndefinedColumn(full.error)) {
    const fallback = await admin
      .from("locations")
      .select("id, name, latitude, longitude, auto_signin_radius_meters")
      .eq("id", locationId)
      .maybeSingle()
    return (fallback.data as (GeofenceTarget & { id: string; name: string }) | null) ?? null
  }
  if (full.error) return null
  return (full.data as (GeofenceTarget & { id: string; name: string }) | null) ?? null
}

/**
 * Server-side gate shared by QR and kiosk sign-in routes.
 */
export async function enforceServerGeofence(input: {
  location: GeofenceTarget & { id?: string; name: string }
  globallyRequired: boolean
  rawCoords: unknown
  request: Request
  source: "qr" | "kiosk"
  scopeId: string
  staffOverride?: boolean
  actorUserId?: string | null
}): Promise<EnforceGeofenceResult> {
  const { location, globallyRequired, rawCoords, request, source, scopeId } = input
  const ip = clientIp(request)
  const userAgent = request.headers.get("user-agent")

  if (!globallyRequired || !hasGeofence(location) || !isGeofenceEnabled(location)) {
    return { blocked: null, verdict: null, override: false }
  }

  if (input.staffOverride && source === "kiosk") {
    await logSuspicious({
      locationId: location.id,
      locationName: location.name,
      reason: "staff_override",
      ip,
      userAgent,
      coords: parseDeviceCoords(rawCoords),
      verdict: null,
      source,
      override: true,
      actorUserId: input.actorUserId,
    })
    return { blocked: null, verdict: null, override: true }
  }

  const radius = effectiveRadius(location)
  const limit = rateLimitGeofence(geofenceScopeKey(source, scopeId, ip))
  if (!limit.allowed) {
    const verdict: Extract<GeofenceVerdict, { ok: false }> = {
      ok: false,
      reason: "rate_limited",
      distance: null,
      radius,
    }
    await logSuspicious({
      locationId: location.id,
      locationName: location.name,
      reason: "rate_limited",
      ip,
      userAgent,
      coords: parseDeviceCoords(rawCoords),
      verdict,
      source,
    })
    return fail(location.name, verdict)
  }

  const coords = parseDeviceCoords(rawCoords)
  const freshness = checkCoordsFreshness(coords)
  if (freshness !== "ok" || !coords) {
    const verdict: Extract<GeofenceVerdict, { ok: false }> = {
      ok: false,
      reason: freshness === "stale_coords" ? "stale_coords" : "no_coords",
      distance: null,
      radius,
    }
    await logSuspicious({
      locationId: location.id,
      locationName: location.name,
      reason: verdict.reason,
      ip,
      userAgent,
      coords,
      verdict,
      source,
    })
    return fail(location.name, verdict)
  }

  const now = Date.now()
  const scopeKey = geofenceScopeKey(source, scopeId, ip)
  const previous = getGeofenceSighting(scopeKey)
  if (isImpossibleJump(previous, coords, now)) {
    const distance = evaluateGeofence(location, coords).distance
    const verdict: Extract<GeofenceVerdict, { ok: false }> = {
      ok: false,
      reason: "impossible_jump",
      distance: distance,
      radius,
    }
    await logSuspicious({
      locationId: location.id,
      locationName: location.name,
      reason: "impossible_jump",
      ip,
      userAgent,
      coords,
      verdict,
      source,
    })
    return fail(location.name, verdict)
  }

  recordGeofenceSighting(scopeKey, coords.lat, coords.lng, now)
  void persistSighting(scopeKey, coords.lat, coords.lng, now)

  const verdict = evaluateGeofence(location, coords)
  if (verdict.ok) return { blocked: null, verdict, override: false }

  await logSuspicious({
    locationId: location.id,
    locationName: location.name,
    reason: verdict.reason,
    ip,
    userAgent,
    coords,
    verdict,
    source,
  })
  return fail(location.name, verdict)
}
