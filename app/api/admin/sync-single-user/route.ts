import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { syncSingleAzureUser } from "@/lib/sync/azure"
import type { PermissionKey } from "@/lib/permissions"
import { logAuditServer } from "@/lib/audit-log"

/** Admin (or custom role with "users" permission) gate — mirrors the profiles route. */
async function checkAdminAccess(supabase: Awaited<ReturnType<typeof createClient>>) {
    const {
        data: { user },
    } = await supabase.auth.getUser()
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
        if (role && (role.permissions as PermissionKey[]).includes("users")) {
            return { authorized: true as const, userId: user.id }
        }
    }
    return { authorized: false as const, error: "Admin access required", status: 403 }
}

/**
 * Re-sync a single profile from Entra ID on demand (the blade's
 * "Sync from Entra ID" button). Pulls the latest directory attributes,
 * photo, enabled/disabled status, and mirrors them onto the linked host.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const access = await checkAdminAccess(supabase)
        if (!access.authorized) {
            return NextResponse.json({ error: access.error }, { status: access.status })
        }

        const { profileId } = await request.json()
        if (!profileId) {
            return NextResponse.json({ error: "profileId is required" }, { status: 400 })
        }

        const adminClient = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } },
        )

        const result = await syncSingleAzureUser(adminClient, profileId)
        if (!result.ok) {
            return NextResponse.json({ error: result.error || "Sync failed" }, { status: 400 })
        }

        // Return the freshly-synced profile so the blade can refresh in place.
        const { data: profile } = await adminClient.from("profiles").select("*").eq("id", profileId).single()

        await logAuditServer({
            supabase,
            userId: access.userId,
            action: "user.synced",
            entityType: "user",
            entityId: profileId,
            description: `Synced user from Entra ID: ${profile?.full_name || profile?.email || profileId}`,
            metadata: { method: "manual_single" },
        })

        return NextResponse.json({ profile })
    } catch (error) {
        console.error("Single-user sync error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to sync user" },
            { status: 500 },
        )
    }
}
