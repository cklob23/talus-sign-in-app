import { NextResponse } from "next/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asRequiredUuid } from "@/lib/kiosk-input"
import { recordEmployeeSiteSignIn, type EmployeeSiteSignInMethod } from "@/lib/kiosk-employee-signin"

const METHODS = new Set<EmployeeSiteSignInMethod>(["password", "microsoft_oauth"])

export async function POST(request: Request) {
    try {
        const auth = await requireKioskContext(request)
        if (!auth.ok) return auth.response

        const body = await request.json().catch(() => null)
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
        }

        const raw = body as Record<string, unknown>
        const profile_id = asRequiredUuid(raw.profile_id)
        const location_id = asRequiredUuid(raw.location_id)
        const methodRaw = typeof raw.method === "string" ? raw.method : "password"
        const method: EmployeeSiteSignInMethod = METHODS.has(methodRaw as EmployeeSiteSignInMethod)
            ? (methodRaw as EmployeeSiteSignInMethod)
            : "password"

        if (!profile_id || !location_id) {
            return NextResponse.json(
                { error: "Missing required fields: profile_id and location_id" },
                { status: 400 },
            )
        }

        const staffOverride = raw.staff_override === true && auth.context.source === "receptionist"
        return await recordEmployeeSiteSignIn({
            request,
            profileId: profile_id,
            locationId: location_id,
            rawCoords: raw.coords,
            staffOverride,
            actorUserId: auth.context.source === "receptionist" ? auth.context.session.id : null,
            autoSignedIn: false,
            method,
        })
    } catch (error) {
        console.error("[API] Employee sign-in error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
