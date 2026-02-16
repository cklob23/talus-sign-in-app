import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Service-role admin client to bypass RLS (no auth session required)
function getAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Missing Supabase environment variables")
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
    })
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { profile_id, location_id } = body

        if (!profile_id || !location_id) {
            return NextResponse.json(
                { error: "Missing required fields: profile_id and location_id" },
                { status: 400 },
            )
        }

        const adminClient = getAdminClient()

        // Verify the profile exists and is an employee/staff/admin
        const { data: profile, error: profileError } = await adminClient
            .from("profiles")
            .select("id, email, full_name, role, avatar_url, location_id")
            .eq("id", profile_id)
            .single()

        if (profileError || !profile) {
            return NextResponse.json(
                { error: "Employee not found" },
                { status: 404 },
            )
        }

        if (!["employee", "admin", "staff"].includes(profile.role)) {
            return NextResponse.json(
                { error: "User is not an employee" },
                { status: 403 },
            )
        }

        // Check if already signed in today (has an open sign-in record with no sign-out)
        const { data: existingSignIn } = await adminClient
            .from("employee_sign_ins")
            .select("*")
            .eq("profile_id", profile_id)
            .is("sign_out_time", null)
            .single()

        let signInTime: string

        if (existingSignIn) {
            // Already signed in — return the existing record
            signInTime = existingSignIn.sign_in_time
        } else {
            // Insert a new sign-in record
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
                return NextResponse.json(
                    { error: insertError.message },
                    { status: 500 },
                )
            }

            signInTime = newSignIn.sign_in_time

            // Log the audit entry
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

        // Get location details for the response
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
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 },
        )
    }
}
