import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getAdminClient } from "@/lib/supabase/server"
import { logAuditServer } from "@/lib/audit-log"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    try {
        const supabase = await createClient()

        // Check if user is authenticated and is an admin
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single()

        if (!profile || profile.role !== "admin") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 })
        }

        const body = await request.json()
        const { userId, email, password } = body

        if (!userId || !email || !password) {
            return NextResponse.json(
                { error: "User ID, email, and password are required" },
                { status: 400 },
            )
        }

        if (password.length < 8) {
            return NextResponse.json(
                { error: "Password must be at least 8 characters" },
                { status: 400 },
            )
        }

        const adminClient = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } },
        )

        // Use the admin API to update the user's password directly
        const { error } = await adminClient.auth.admin.updateUserById(userId, {
            password,
        })

        if (error) {
            console.error("[Set Temp Password] Supabase error:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Audit log
        await logAuditServer({
            supabase: getAdminClient(),
            userId: user.id,
            action: "password.temporary_set",
            entityType: "user",
            entityId: userId,
            description: `Temporary password set for ${email}`,
            metadata: { targetEmail: email, method: "temporary_password" },
        })

        return NextResponse.json({
            success: true,
            message: "Temporary password set successfully",
        })
    } catch (error) {
        console.error("Set temporary password error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to set temporary password" },
            { status: 500 },
        )
    }
}
