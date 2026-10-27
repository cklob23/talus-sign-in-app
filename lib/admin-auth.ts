import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolvePermissions, type PermissionKey } from "@/lib/permissions"
import { isBuiltInAdminRole } from "@/lib/admin-role"
import { adminPageLoginRedirect } from "@/lib/safe-redirect"

export { isBuiltInAdminRole }

export interface AdminPortalUser {
  userId: string
  email: string | null
  role: string
  customRoleId: string | null
  permissions: Set<PermissionKey>
}

const PORTAL_ROLES = new Set(["admin", "super_admin", "staff"])

function hasPortalAccess(role: string | null, customRoleId: string | null, permissionCount: number): boolean {
  if (role && PORTAL_ROLES.has(role)) return true
  if (customRoleId && permissionCount > 0) return true
  return false
}

export async function loadPortalUser(): Promise<
  | { ok: true; user: AdminPortalUser }
  | { ok: false; status: 401 | 403; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, custom_role_id, is_active")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || profile.is_active === false) {
    return { ok: false, status: 403, error: "Admin access required" }
  }

  let customPermissions: PermissionKey[] | null = null
  if (profile.custom_role_id) {
    const { data: role } = await supabase
      .from("roles")
      .select("permissions")
      .eq("id", profile.custom_role_id)
      .maybeSingle()
    if (role?.permissions) {
      customPermissions = role.permissions as PermissionKey[]
    }
  }

  const permissions = resolvePermissions(profile.role, customPermissions)
  if (!hasPortalAccess(profile.role, profile.custom_role_id, permissions.size)) {
    return { ok: false, status: 403, error: "Admin access required" }
  }

  return {
    ok: true,
    user: {
      userId: user.id,
      email: user.email ?? null,
      role: profile.role,
      customRoleId: profile.custom_role_id,
      permissions,
    },
  }
}

/** API routes: session plus a privileged role. */
export async function requireAdminApiUser(): Promise<
  { ok: true; user: AdminPortalUser } | { ok: false; response: NextResponse }
> {
  const result = await loadPortalUser()
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: result.error }, { status: result.status }),
    }
  }
  return result
}

/** API routes that must be a built-in admin. */
export async function requireBuiltInAdmin(): Promise<
  { ok: true; user: AdminPortalUser } | { ok: false; response: NextResponse }
> {
  const result = await loadPortalUser()
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: result.error }, { status: result.status }),
    }
  }
  if (!isBuiltInAdminRole(result.user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    }
  }
  return result
}

/** Server pages: redirect away when the caller is not allowed in /admin. */
export async function requireAdminPageUser(): Promise<AdminPortalUser> {
  const result = await loadPortalUser()
  if (result.ok) return result.user
  const headerStore = await headers()
  const pathname = headerStore.get("x-talus-pathname") || "/admin"
  const search = headerStore.get("x-talus-search") || ""
  redirect(adminPageLoginRedirect(result.status, pathname, search))
}
