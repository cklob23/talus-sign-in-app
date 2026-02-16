import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse, type NextRequest } from "next/server"

export async function POST(request: NextRequest) {
    try {
        const { profile_id, location_id } = await request.json()

        if (!profile_id) {
            return NextResponse.json({ error: "profile_id is required" }, { status: 400 })
        }

        const supabase = createAdminClient()

        // Find the active (open) sign-in record for this employee
        const query = supabase
            .from("employee_sign_ins")
            .select("*")
            .eq("profile_id", profile_id)
            .is("sign_out_time", null)
            .order("sign_in_time", { ascending: false })
            .limit(1)
            .single()

        const { data: signIn, error: fetchError } = await query

        if (fetchError || !signIn) {
            // No active sign-in found — not necessarily an error, just nothing to sign out
            return NextResponse.json({
                success: true,
                message: "No active sign-in record found",
                signedOut: false,
            })
        }

        // Update the sign-in record with the sign-out time
        const { error: updateError } = await supabase
            .from("employee_sign_ins")
            .update({ sign_out_time: new Date().toISOString() })
            .eq("id", signIn.id)

        if (updateError) {
            console.error("[Employee Sign-Out] Update error:", updateError)
            return NextResponse.json(
                { error: "Failed to update sign-out time" },
                { status: 500 }
            )
        }

        // Log the sign-out in the audit log
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
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
