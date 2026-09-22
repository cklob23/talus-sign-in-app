import { type NextRequest, NextResponse } from "next/server"
import { createClient, getAdminClient } from "@/lib/supabase/server"
import { parseFieldPositions } from "@/lib/nda-fields"

/** Only signed-in admins may change where signatures land on an NDA. */
async function requireAdmin() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
    const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle()
    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
        return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
    }
    return { ok: true as const, profile }
}

/**
 * Persists the placed field boxes for one NDA version.
 *
 * The payload is validated through `parseFieldPositions` so a malformed box can
 * never reach the stamper, and clamped to the page so a dragged-off-screen field
 * cannot land off the paper.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    let body: { documentId?: string; positions?: unknown }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const documentId = body.documentId?.trim()
    if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 })

    const clean = parseFieldPositions(body.positions).map((f) => ({
        ...f,
        xPct: clamp01(f.xPct),
        yPct: clamp01(f.yPct),
        wPct: clamp(f.wPct, 0.01, 1),
        hPct: clamp(f.hPct, 0.005, 1),
        page: Math.max(0, Math.floor(f.page)),
    }))

    const admin = getAdminClient()
    const { error } = await admin.from("nda_documents").update({ field_positions: clean }).eq("id", documentId)
    if (error) {
        console.log("[v0] NDA fields save failed:", error.message)
        return NextResponse.json({ error: "Could not save field positions" }, { status: 500 })
    }

    await admin.from("audit_logs").insert({
        user_id: auth.profile.id,
        action: "nda.fields_updated",
        entity_type: "nda",
        entity_id: documentId,
        description: `Updated NDA signature field placement (${clean.length} field${clean.length === 1 ? "" : "s"})`,
        metadata: { field_count: clean.length },
    })

    return NextResponse.json({ success: true, positions: clean })
}

function clamp(n: number, min: number, max: number): number {
    return Math.min(Math.max(n, min), max)
}
function clamp01(n: number): number {
    return clamp(n, 0, 1)
}
