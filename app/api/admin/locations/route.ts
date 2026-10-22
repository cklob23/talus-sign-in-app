import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isUndefinedColumn } from "@/lib/idempotency"
import { parseLocationRadius } from "@/lib/location-radius"

async function requireSignedIn() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { supabase, userId: user.id }
}

function readLocationBody(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return { error: "Name is required" }
  const address = typeof body.address === "string" && body.address.trim() ? body.address.trim() : null
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "UTC"
  const latitude =
    body.latitude === null || body.latitude === undefined || body.latitude === ""
      ? null
      : Number(body.latitude)
  const longitude =
    body.longitude === null || body.longitude === undefined || body.longitude === ""
      ? null
      : Number(body.longitude)
  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
    return { error: "Latitude must be between -90 and 90." }
  }
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    return { error: "Longitude must be between -180 and 180." }
  }
  const auto_signout_minutes = Number(body.auto_signout_minutes)
  return {
    name,
    address,
    timezone,
    latitude,
    longitude,
    auto_signout_minutes: Number.isFinite(auto_signout_minutes) ? Math.max(0, Math.round(auto_signout_minutes)) : 0,
    radiusValue: body.auto_signin_radius_meters,
    geofenceEnabledInput: body.geofence_enabled,
  }
}

async function insertLocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: Record<string, unknown>,
) {
  const first = await supabase.from("locations").insert(row).select().single()
  if (first.error && isUndefinedColumn(first.error) && "geofence_enabled" in row) {
    const { geofence_enabled: _dropped, ...withoutFlag } = row
    return supabase.from("locations").insert(withoutFlag).select().single()
  }
  return first
}

async function updateLocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  row: Record<string, unknown>,
) {
  const first = await supabase.from("locations").update(row).eq("id", id).select().single()
  if (first.error && isUndefinedColumn(first.error) && "geofence_enabled" in row) {
    const { geofence_enabled: _dropped, ...withoutFlag } = row
    return supabase.from("locations").update(withoutFlag).eq("id", id).select().single()
  }
  return first
}

export async function POST(request: NextRequest) {
  const auth = await requireSignedIn()
  if ("error" in auth) return auth.error

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

  const parsed = readLocationBody(body)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const enabled = parsed.geofenceEnabledInput === false
  const radius = parseLocationRadius(enabled ? 0 : parsed.radiusValue)
  if (!radius.ok) return NextResponse.json({ error: radius.error }, { status: 400 })

  const row = {
    name: parsed.name,
    address: parsed.address,
    timezone: parsed.timezone,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    auto_signin_radius_meters: radius.meters,
    auto_signout_minutes: parsed.auto_signout_minutes,
    geofence_enabled: radius.enabled,
  }

  const { data, error } = await insertLocation(auth.supabase, row)
  if (error || !data) {
    console.error("[locations] insert failed:", error)
    return NextResponse.json({ error: "Failed to create location" }, { status: 500 })
  }

  await auth.supabase.from("audit_logs").insert({
    user_id: auth.userId,
    action: "location.created",
    entity_type: "location",
    entity_id: data.id,
    description: `Location created: ${row.name}`,
    metadata: {
      name: row.name,
      address: row.address,
      radius_meters_old: null,
      radius_meters_new: row.auto_signin_radius_meters,
      latitude: row.latitude,
      longitude: row.longitude,
    },
  })

  return NextResponse.json({ success: true, location: data })
}

export async function PUT(request: NextRequest) {
  const auth = await requireSignedIn()
  if ("error" in auth) return auth.error

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  const id = typeof body.id === "string" ? body.id : ""
  if (!id) return NextResponse.json({ error: "Location id is required" }, { status: 400 })

  const { data: existing, error: loadError } = await auth.supabase
    .from("locations")
    .select("id, name, address, latitude, longitude, auto_signin_radius_meters, geofence_enabled")
    .eq("id", id)
    .maybeSingle()
  if (loadError || !existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 })
  }

  const parsed = readLocationBody(body)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const enabledOff = parsed.geofenceEnabledInput === false
  const radius = parseLocationRadius(
    enabledOff ? 0 : parsed.radiusValue,
    existing.auto_signin_radius_meters,
  )
  if (!radius.ok) return NextResponse.json({ error: radius.error }, { status: 400 })

  const row = {
    name: parsed.name,
    address: parsed.address,
    timezone: parsed.timezone,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    auto_signin_radius_meters: radius.meters,
    auto_signout_minutes: parsed.auto_signout_minutes,
    geofence_enabled: radius.enabled,
  }

  const { data, error } = await updateLocation(auth.supabase, id, row)
  if (error || !data) {
    console.error("[locations] update failed:", error)
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 })
  }

  await auth.supabase.from("audit_logs").insert({
    user_id: auth.userId,
    action: "location.updated",
    entity_type: "location",
    entity_id: id,
    description: `Location updated: ${row.name}`,
    metadata: {
      name: row.name,
      address: row.address,
      radius_meters_old: existing.auto_signin_radius_meters,
      radius_meters_new: row.auto_signin_radius_meters,
      latitude_old: existing.latitude,
      latitude_new: row.latitude,
      longitude_old: existing.longitude,
      longitude_new: row.longitude,
    },
  })

  return NextResponse.json({ success: true, location: data })
}
