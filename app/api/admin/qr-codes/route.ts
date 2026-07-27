import { randomBytes } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { buildCheckinUrl, buildQrSvg } from "@/lib/qr-code"

/**
 * Admin management of per-location visitor check-in QR codes.
 *
 * Tokens are the capability that unlocks the public check-in form, so minting
 * one always requires a verified admin session. Reads and writes then use the
 * service-role client because `location_qr_codes` has RLS enabled with no
 * public policies.
 */

interface QrCodeRow {
    id: string
    location_id: string
    token: string
    created_at: string
}

/** Resolve the public origin so generated links work in preview and production. */
function resolveOrigin(request: NextRequest): string {
    const forwardedHost = request.headers.get("x-forwarded-host")
    const forwardedProto = request.headers.get("x-forwarded-proto")
    if (forwardedHost) {
        return `${forwardedProto ?? "https"}://${forwardedHost}`
    }
    return new URL(request.url).origin
}

function serviceClient() {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null
    return createAdminClient()
}

/** Verify the caller is a signed-in admin. Returns the user id when valid. */
async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || profile.role !== "admin") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }
    return { userId: user.id }
}

/** Shape a row for the settings UI, including a ready-to-render SVG. */
function presentCode(row: QrCodeRow, origin: string) {
    const url = buildCheckinUrl(origin, row.token)
    return {
        id: row.id,
        locationId: row.location_id,
        token: row.token,
        url,
        createdAt: row.created_at,
        // Rendered server-side so the browser never loads the QR matrix generator.
        svg: buildQrSvg({ text: url, size: 320 }),
    }
}

export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const admin = serviceClient()
    if (!admin) {
        return NextResponse.json({ error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 500 })
    }

    const { data, error } = await admin
        .from("location_qr_codes")
        .select("id, location_id, token, created_at")
        .eq("is_active", true)

    if (error) {
        console.log("[v0] QR codes list failed:", error.message)
        return NextResponse.json({ error: "Could not load QR codes" }, { status: 500 })
    }

    const origin = resolveOrigin(request)
    return NextResponse.json({ codes: (data ?? []).map((row) => presentCode(row as QrCodeRow, origin)) })
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const admin = serviceClient()
    if (!admin) {
        return NextResponse.json({ error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 500 })
    }

    let locationId: string | undefined
    try {
        locationId = (await request.json())?.locationId
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    if (!locationId) {
        return NextResponse.json({ error: "locationId is required" }, { status: 400 })
    }

    const { data: location } = await admin.from("locations").select("id, name").eq("id", locationId).single()
    if (!location) {
        return NextResponse.json({ error: "Location not found" }, { status: 404 })
    }

    // Revoke first. The partial unique index allows only one active row per
    // location, so this is what makes a reprinted poster invalidate the old one.
    const { data: previous } = await admin
        .from("location_qr_codes")
        .select("id")
        .eq("location_id", locationId)
        .eq("is_active", true)
        .maybeSingle()

    if (previous) {
        const { error: revokeError } = await admin
            .from("location_qr_codes")
            .update({ is_active: false, revoked_at: new Date().toISOString() })
            .eq("id", previous.id)
        if (revokeError) {
            console.log("[v0] QR revoke failed:", revokeError.message)
            return NextResponse.json({ error: "Could not replace the existing QR code" }, { status: 500 })
        }
    }

    // 32 URL-safe characters of entropy: unguessable by brute force.
    const token = randomBytes(24).toString("base64url")
    const { data: inserted, error: insertError } = await admin
        .from("location_qr_codes")
        .insert({ location_id: locationId, token, created_by: auth.userId })
        .select("id, location_id, token, created_at")
        .single()

    if (insertError || !inserted) {
        console.log("[v0] QR insert failed:", insertError?.message)
        return NextResponse.json({ error: "Could not create the QR code" }, { status: 500 })
    }

    await admin.from("audit_logs").insert({
        user_id: auth.userId,
        action: previous ? "qr_code.regenerated" : "qr_code.generated",
        entity_type: "qr_code",
        entity_id: inserted.id,
        description: `${previous ? "Regenerated" : "Generated"} check-in QR code for ${location.name}`,
        metadata: { location_id: locationId, replaced_code_id: previous?.id ?? null },
    })

    return NextResponse.json({ code: presentCode(inserted as QrCodeRow, resolveOrigin(request)) })
}

export async function PATCH(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const admin = serviceClient()
    if (!admin) {
        return NextResponse.json({ error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 500 })
    }

    let body: { locationId?: string; action?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    if (!body.locationId || body.action !== "deactivate") {
        return NextResponse.json({ error: "locationId and action 'deactivate' are required" }, { status: 400 })
    }

    const { data: active } = await admin
        .from("location_qr_codes")
        .select("id")
        .eq("location_id", body.locationId)
        .eq("is_active", true)
        .maybeSingle()

    if (!active) {
        return NextResponse.json({ error: "No active QR code for this location" }, { status: 404 })
    }

    const { error } = await admin
        .from("location_qr_codes")
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq("id", active.id)

    if (error) {
        console.log("[v0] QR deactivate failed:", error.message)
        return NextResponse.json({ error: "Could not deactivate the QR code" }, { status: 500 })
    }

    const { data: location } = await admin.from("locations").select("name").eq("id", body.locationId).single()

    await admin.from("audit_logs").insert({
        user_id: auth.userId,
        action: "qr_code.deactivated",
        entity_type: "qr_code",
        entity_id: active.id,
        description: `Deactivated check-in QR code for ${location?.name ?? "location"}`,
        metadata: { location_id: body.locationId },
    })

    return NextResponse.json({ success: true })
}
