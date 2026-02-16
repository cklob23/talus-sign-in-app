import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import type { PermissionKey } from "@/lib/permissions"

async function checkAdminAccess(supabase: Awaited<ReturnType<typeof createClient>>) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { authorized: false as const, error: "Unauthorized", status: 401 }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role, custom_role_id")
        .eq("id", user.id)
        .single()

    if (!profile) return { authorized: false as const, error: "Profile not found", status: 403 }

    if (profile.role === "admin") return { authorized: true as const, userId: user.id }

    if (profile.custom_role_id) {
        const { data: role } = await supabase
            .from("roles")
            .select("permissions")
            .eq("id", profile.custom_role_id)
            .single()

        if (role && (role.permissions as PermissionKey[]).includes("vendors")) {
            return { authorized: true as const, userId: user.id }
        }
    }

    return { authorized: false as const, error: "Admin access required", status: 403 }
}

// DELETE - Bulk delete vendors
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient()
        const access = await checkAdminAccess(supabase)
        if (!access.authorized) {
            return NextResponse.json({ error: access.error }, { status: access.status })
        }

        const body = await request.json()
        const { ids } = body as { ids: string[] }

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "Vendor IDs are required" }, { status: 400 })
        }

        const adminClient = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        // Fetch vendor names before deleting for audit purposes
        const { data: vendorsToDelete } = await adminClient
            .from("vendors")
            .select("id, name")
            .in("id", ids)

        const { error: deleteError, count } = await adminClient
            .from("vendors")
            .delete({ count: "exact" })
            .in("id", ids)

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            deleted: count || ids.length,
            vendors: vendorsToDelete?.map(v => ({ id: v.id, name: v.name })) || [],
        })
    } catch (error) {
        console.error("Vendor bulk deletion error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to delete vendors" },
            { status: 500 }
        )
    }
}
