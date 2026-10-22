import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asRequiredUuid } from "@/lib/kiosk-input"

export async function POST(request: Request) {
    try {
        const auth = await requireKioskContext(request)
        if (!auth.ok) return auth.response

        const body = await request.json().catch(() => null)
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
        }

        const profile_id = asRequiredUuid((body as { profile_id?: unknown }).profile_id)
        const location_id = asRequiredUuid((body as { location_id?: unknown }).location_id)

        if (!profile_id || !location_id) {
            return NextResponse.json(
                { error: "Missing required fields: profile_id and location_id" },
                { status: 400 },
            )
        }

        const adminClient = getAdminClient()

        const { data: profile, error: profileError } = await adminClient
            .from("profiles")
            .select("id, email, full_name, role, avatar_url, location_id")
            .eq("id", profile_id)
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
            .eq("profile_id", profile_id)
            .is("sign_out_time", null)
            .single()

        let signInTime: string

        if (existingSignIn) {
            signInTime = existingSignIn.sign_in_time
        } else {
            const { data: newSignIn, error: insertError } = await adminClient
                .from("employee_sign_ins")
                .insert({
                    profile_id,
                    location_id,
                    auto_signed_in: true,
                    device_id: request.headers.get("user-agent") || "unknown",
                })
                .select()
                .single()

            if (insertError) {
                console.error("[API] Employee auto sign-in insert error:", insertError)
                return NextResponse.json({ error: "Failed to sign in employee" }, { status: 500 })
            }

            signInTime = newSignIn.sign_in_time

            await adminClient.from("audit_logs").insert({
                user_id: profile_id,
                action: "employee.sign_in",
                entity_type: "employee",
                entity_id: profile_id,
                description: `Employee signed in: ${profile.full_name || profile.email}`,
                metadata: {
                    profile_id,
                    location_id,
                    auto_signed_in: true,
                    method: "remembered_device",
                },
            })
        }

        const { data: location } = await adminClient
            .from("locations")
            .select("name, timezone")
            .eq("id", location_id)
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
    } catch (error) {
        console.error("[API] Employee auto sign-in error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
