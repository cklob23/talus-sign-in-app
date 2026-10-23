import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { enforceServerGeofence, loadLocationFence } from "@/lib/geofence-enforce"

export type EmployeeSiteSignInMethod = "remembered_device" | "password" | "microsoft_oauth"

/**
 * Shared on-site employee sign-in used by remembered-device auto sign-in
 * and the password / Microsoft flows. The fence is the same as visitor QR.
 */
export async function recordEmployeeSiteSignIn(input: {
  request: Request
  profileId: string
  locationId: string
  rawCoords: unknown
  staffOverride: boolean
  actorUserId: string | null
  autoSignedIn: boolean
  method: EmployeeSiteSignInMethod
}): Promise<NextResponse> {
  const locationRow = await loadLocationFence(input.locationId)
  if (!locationRow) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 })
  }

  const geofence = await enforceServerGeofence({
    location: locationRow,
    globallyRequired: true,
    rawCoords: input.rawCoords,
    request: input.request,
    source: "kiosk",
    scopeId: input.locationId,
    staffOverride: input.staffOverride,
    actorUserId: input.actorUserId,
  })
  if (geofence.blocked) return geofence.blocked

  const adminClient = getAdminClient()

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, email, full_name, role, avatar_url, location_id")
    .eq("id", input.profileId)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  }

  if (!["employee", "admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "User is not an employee" }, { status: 403 })
  }

  const { data: existingSignIn } = await adminClient
    .from("employee_sign_ins")
    .select("*")
    .eq("profile_id", input.profileId)
    .is("sign_out_time", null)
    .single()

  let signInTime: string

  if (existingSignIn) {
    signInTime = existingSignIn.sign_in_time
  } else {
    const { data: newSignIn, error: insertError } = await adminClient
      .from("employee_sign_ins")
      .insert({
        profile_id: input.profileId,
        location_id: input.locationId,
        auto_signed_in: input.autoSignedIn,
        device_id: input.request.headers.get("user-agent") || "unknown",
      })
      .select()
      .single()

    if (insertError) {
      console.error("[API] Employee site sign-in insert error:", insertError)
      return NextResponse.json({ error: "Failed to sign in employee" }, { status: 500 })
    }

    signInTime = newSignIn.sign_in_time

    await adminClient.from("audit_logs").insert({
      user_id: input.profileId,
      action: "employee.sign_in",
      entity_type: "employee",
      entity_id: input.profileId,
      description: `Employee signed in: ${profile.full_name || profile.email}`,
      metadata: {
        profile_id: input.profileId,
        location_id: input.locationId,
        auto_signed_in: input.autoSignedIn,
        method: input.method,
      },
    })
  }

  const { data: location } = await adminClient
    .from("locations")
    .select("name, timezone")
    .eq("id", input.locationId)
    .single()

  return NextResponse.json({
    success: true,
    profile: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      avatar_url: profile.avatar_url,
      location_id: profile.location_id,
    },
    signIn: {
      sign_in_time: signInTime,
      location_name: location?.name,
      timezone: location?.timezone,
    },
    alreadySignedIn: !!existingSignIn,
  })
}
