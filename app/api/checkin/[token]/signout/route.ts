import { NextResponse, type NextRequest } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { resolveCheckinToken } from "@/lib/checkin-token"
import { BADGE_NUMBER_INPUT_RE } from "@/lib/badge-number"

/**
 * Public visitor sign-out from a scanned location QR code.
 *
 * Like the sign-in route, the location comes from the poster token, so a
 * visitor can only ever sign out of the site they physically scanned.
 *
 * A visitor identifies themselves with either their badge number or the email
 * they signed in with. Only sign-ins that are still active at this location are
 * considered, which keeps the lookup narrow: a badge number alone is not enough
 * to reach anyone at another site or on a previous day.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params

    const resolved = await resolveCheckinToken(token)
    if (!resolved.ok) {
        return NextResponse.json({ error: resolved.reason }, { status: resolved.status })
    }
    const { location } = resolved

    let body: { badgeNumber?: string; email?: string; signInId?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const admin = getAdminClient()
    const badgeNumber = body.badgeNumber?.trim().toUpperCase()
    const email = body.email?.trim().toLowerCase()
    const signInId = body.signInId?.trim()

    // Every branch below is constrained to this location and to still-active
    // visits, so the identifier can never expose someone else's record.
    let query = admin
        .from("sign_ins")
        .select("id, badge_number, sign_in_time, visitor:visitors(id, first_name, last_name, email)")
        .eq("location_id", location.id)
        .is("sign_out_time", null)

    if (signInId) {
        query = query.eq("id", signInId)
    } else if (badgeNumber) {
        if (!BADGE_NUMBER_INPUT_RE.test(badgeNumber)) {
            return NextResponse.json(
                { error: "Badge numbers look like V12345. Check the number on your badge." },
                { status: 400 },
            )
        }
        query = query.eq("badge_number", badgeNumber)
    } else if (email) {
        const { data: visitors } = await admin.from("visitors").select("id").eq("email", email)
        if (!visitors || visitors.length === 0) {
            return NextResponse.json({ error: "No active visit found here for those details." }, { status: 404 })
        }
        query = query.in(
            "visitor_id",
            visitors.map((v) => v.id),
        )
    } else {
        return NextResponse.json({ error: "Enter your badge number or email" }, { status: 400 })
    }

    const { data: matches, error: findError } = await query
        .order("sign_in_time", { ascending: false })
        .limit(1)

    if (findError) {
        console.log("[v0] QR sign-out lookup failed:", findError.message)
        return NextResponse.json({ error: "Could not complete sign-out" }, { status: 500 })
    }

    const signIn = matches?.[0]
    if (!signIn) {
        return NextResponse.json(
            { error: `No active visit found at ${location.name} for those details.` },
            { status: 404 },
        )
    }

    const visitorRaw = signIn.visitor as unknown
    const visitor = (Array.isArray(visitorRaw) ? visitorRaw[0] : visitorRaw) as {
        id: string
        first_name: string
        last_name: string
        email: string | null
    } | null

    const signOutTime = new Date().toISOString()
    // Re-assert the active filter so two simultaneous taps can't double-write.
    const { data: updated, error: updateError } = await admin
        .from("sign_ins")
        .update({ sign_out_time: signOutTime })
        .eq("id", signIn.id)
        .is("sign_out_time", null)
        .select("id")

    if (updateError) {
        console.log("[v0] QR sign-out update failed:", updateError.message)
        return NextResponse.json({ error: "Could not complete sign-out" }, { status: 500 })
    }

    const visitorName = visitor ? `${visitor.first_name} ${visitor.last_name}`.trim() : "Visitor"

    // An empty result means another request signed them out first. Treat it as
    // success so the visitor sees a confirmation rather than a confusing error.
    if (updated && updated.length > 0) {
        await admin.from("audit_logs").insert({
            user_id: null,
            action: "visitor.sign_out",
            entity_type: "visitor",
            entity_id: visitor?.id ?? null,
            description: `Visitor signed out via QR code: ${visitorName}`,
            metadata: {
                visitor_id: visitor?.id ?? null,
                sign_in_id: signIn.id,
                location_id: location.id,
                badge_number: signIn.badge_number,
                source: "qr_checkin",
            },
        })
    }

    return NextResponse.json({
        success: true,
        visitorName,
        badgeNumber: signIn.badge_number,
        locationName: location.name,
        signOutTime,
    })
}
