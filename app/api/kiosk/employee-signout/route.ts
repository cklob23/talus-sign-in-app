import { NextResponse, type NextRequest } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalUuid, asRequiredUuid } from "@/lib/kiosk-input"

export async function POST(request: NextRequest) {
    try {
        const auth = await requireKioskContext(request)
        if (!auth.ok) return auth.response

        const body = await request.json().catch(() => null)
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
        }

        const profile_id = asRequiredUuid((body as { profile_id?: unknown }).profile_id)
        const location_id = asOptionalUuid((body as { location_id?: unknown }).location_id)

        if (!profile_id) {
            return NextResponse.json({ error: "profile_id is required" }, { status: 400 })
        }
        if (location_id === undefined) {
            return NextResponse.json({ error: "Invalid location_id" }, { status: 400 })
        }

        const supabase = getAdminClient()

        const { data: signIn, error: fetchError } = await supabase
            .from("employee_sign_ins")
            .select("*")
            .eq("profile_id", profile_id)
            .is("sign_out_time", null)
            .order("sign_in_time", { ascending: false })
            .limit(1)
            .single()

        if (fetchError || !signIn) {
            return NextResponse.json({
                success: true,
                message: "No active sign-in record found",
                signedOut: false,
            })
        }

        const { error: updateError } = await supabase
            .from("employee_sign_ins")
            .update({ sign_out_time: new Date().toISOString() })
            .eq("id", signIn.id)

        if (updateError) {
            console.error("[Employee Sign-Out] Update error:", updateError)
            return NextResponse.json({ error: "Failed to update sign-out time" }, { status: 500 })
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", profile_id)
            .single()

        await supabase.from("audit_logs").insert({
            action: "employee.sign_out",
            entity_type: "employee",
            entity_id: profile_id,
            description: `Employee signed out: ${profile?.full_name || profile?.email || profile_id}`,
            metadata: {
                profile_id,
                sign_in_id: signIn.id,
                location_id: signIn.location_id || location_id,
            },
        })

        return NextResponse.json({
            success: true,
            signedOut: true,
            signIn: {
                id: signIn.id,
                sign_in_time: signIn.sign_in_time,
                sign_out_time: new Date().toISOString(),
            },
        })
    } catch (error) {
        console.error("[Employee Sign-Out] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
