import { NextResponse, type NextRequest } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { resolveCheckinToken } from "@/lib/checkin-token"
import { generateUniqueBadgeNumber } from "@/lib/badge-number"
import { sendHostNotification } from "@/lib/host-notification"

/**
 * Public visitor sign-in from a scanned location QR code.
 *
 * Security model: the poster token is the only credential. The location is
 * always derived from that token server-side, so a visitor cannot sign
 * themselves in at a site they did not physically scan. No session or cookie is
 * issued, so this route grants no access to the admin app.
 */

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params

    const resolved = await resolveCheckinToken(token)
    if (!resolved.ok) {
        return NextResponse.json({ error: resolved.reason }, { status: resolved.status })
    }
    const { location } = resolved

    let body: {
        firstName?: string
        lastName?: string
        email?: string
        phone?: string
        company?: string
        visitorTypeId?: string
        hostId?: string
        photoDataUrl?: string
    }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const firstName = body.firstName?.trim()
    const lastName = body.lastName?.trim()
    if (!firstName || !lastName) {
        return NextResponse.json({ error: "First and last name are required" }, { status: 400 })
    }

    const admin = getAdminClient()

    // Re-validate the visitor type against this location so a tampered request
    // cannot select a type belonging to a different site.
    let visitorType: { id: string; name: string; requires_host: boolean; requires_company: boolean } | null = null
    if (body.visitorTypeId) {
        const { data } = await admin
            .from("visitor_types")
            .select("id, name, requires_host, requires_company")
            .eq("id", body.visitorTypeId)
            .eq("location_id", location.id)
            .maybeSingle()
        if (!data) {
            return NextResponse.json({ error: "Invalid visitor type for this location" }, { status: 400 })
        }
        visitorType = data
    }

    const company = body.company?.trim() || null
    if (visitorType?.requires_company && !company) {
        return NextResponse.json({ error: "Company is required for this visitor type" }, { status: 400 })
    }

    // Same for the host: it must belong to this location and be active.
    let hostId: string | null = null
    if (body.hostId) {
        const { data } = await admin
            .from("hosts")
            .select("id")
            .eq("id", body.hostId)
            .eq("location_id", location.id)
            .eq("is_active", true)
            .maybeSingle()
        if (!data) {
            return NextResponse.json({ error: "Invalid host for this location" }, { status: 400 })
        }
        hostId = data.id
    }
    if (visitorType?.requires_host && !hostId) {
        return NextResponse.json({ error: "A host is required for this visitor type" }, { status: 400 })
    }

    // Optional self-taken photo, stored alongside kiosk photos.
    let photoUrl: string | null = null
    if (body.photoDataUrl?.startsWith("data:image/")) {
        try {
            const base64 = body.photoDataUrl.split(",")[1] ?? ""
            const buffer = Buffer.from(base64, "base64")
            // Guard against oversized uploads (roughly 4MB decoded).
            if (buffer.byteLength <= 4_000_000) {
                const path = `visitors/qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
                const { error: uploadError } = await admin.storage
                    .from("avatars")
                    .upload(path, buffer, { contentType: "image/jpeg", upsert: true })
                if (!uploadError) {
                    photoUrl = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl
                }
            }
        } catch (error) {
            console.log("[v0] QR check-in photo upload failed:", error)
        }
    }

    const { data: visitor, error: visitorError } = await admin
        .from("visitors")
        .insert({
            first_name: firstName,
            last_name: lastName,
            email: body.email?.trim() || null,
            phone: body.phone?.trim() || null,
            company,
            photo_url: photoUrl,
        })
        .select("id, first_name, last_name")
        .single()

    if (visitorError || !visitor) {
        console.log("[v0] QR check-in visitor insert failed:", visitorError?.message)
        return NextResponse.json({ error: "Could not complete sign-in" }, { status: 500 })
    }

    // Scope the collision check to visitors still on site at this location, so a
    // number can be reused freely once its holder has signed out.
    const badgeNumber = await generateUniqueBadgeNumber(async (candidate) => {
        const { count } = await admin
            .from("sign_ins")
            .select("*", { count: "exact", head: true })
            .eq("location_id", location.id)
            .eq("badge_number", candidate)
            .is("sign_out_time", null)
        return (count ?? 0) > 0
    })

    const { data: signIn, error: signInError } = await admin
        .from("sign_ins")
        .insert({
            visitor_id: visitor.id,
            location_id: location.id,
            visitor_type_id: visitorType?.id ?? null,
            host_id: hostId,
            badge_number: badgeNumber,
            photo_url: photoUrl,
            timezone: location.timezone ?? "UTC",
        })
        .select("id, sign_in_time")
        .single()

    if (signInError || !signIn) {
        console.log("[v0] QR check-in sign-in insert failed:", signInError?.message)
        return NextResponse.json({ error: "Could not complete sign-in" }, { status: 500 })
    }

    const visitorName = `${visitor.first_name} ${visitor.last_name}`
    await admin.from("audit_logs").insert({
        user_id: null,
        action: "visitor.sign_in",
        entity_type: "visitor",
        entity_id: visitor.id,
        description: `Visitor signed in via QR code: ${visitorName}`,
        metadata: {
            visitor_id: visitor.id,
            sign_in_id: signIn.id,
            location_id: location.id,
            badge_number: badgeNumber,
            host_id: hostId,
            visitor_type_id: visitorType?.id ?? null,
            source: "qr_checkin",
        },
    })

    // "arrived" is the completion email: the visitor has finished any required
    // training and is now on site. Mirrors the kiosk's post-training notification.
    await sendHostNotification({
        hostId,
        locationId: location.id,
        locationName: location.name,
        notificationType: "arrived",
        visitorName,
        visitorCompany: company,
        visitorTypeName: visitorType?.name ?? null,
        badgeNumber,
        visitorPhotoUrl: photoUrl,
    })

    return NextResponse.json({
        success: true,
        signInId: signIn.id,
        badgeNumber,
        visitorName,
        locationName: location.name,
        signInTime: signIn.sign_in_time,
    })
}
