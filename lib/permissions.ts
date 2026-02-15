/**
 * Role-based permissions system.
 *
 * Each admin page maps to a permission key stored in the role's `permissions`
 * JSONB array.  The built-in "admin" role (profiles.role = "admin") is treated
 * as a super-admin that automatically has every permission.  Custom roles are
 * linked via profiles.custom_role_id → roles.permissions.
 */

// Every permissioned admin page
export const ALL_PERMISSIONS = [
    "dashboard",
    "visitors",
    "history",
    "bookings",
    "reports",
    "evacuations",
    "hosts",
    "users",
    "locations",
    "vendors",
    "settings",
    "audit_log",
    "roles",
] as const

export type PermissionKey = (typeof ALL_PERMISSIONS)[number]

// Human-readable labels for the UI
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
    dashboard: "Dashboard",
    visitors: "Current Visitors",
    history: "History",
    bookings: "Bookings",
    reports: "Reports",
    evacuations: "Evacuations",
    hosts: "Hosts",
    users: "User Management",
    locations: "Locations",
    vendors: "Vendors",
    settings: "Settings",
    audit_log: "Audit Log",
    roles: "Role Management",
}

// Map sidebar hrefs to permission keys
export const ROUTE_PERMISSION_MAP: Record<string, PermissionKey> = {
    "/admin": "dashboard",
    "/admin/visitors": "visitors",
    "/admin/history": "history",
    "/admin/bookings": "bookings",
    "/admin/reports": "reports",
    "/admin/evacuations": "evacuations",
    "/admin/hosts": "hosts",
    "/admin/users": "users",
    "/admin/locations": "locations",
    "/admin/vendors": "vendors",
    "/admin/settings": "settings",
    "/admin/audit-log": "audit_log",
    "/admin/roles": "roles",
}

export interface Role {
    id: string
    name: string
    description: string | null
    permissions: PermissionKey[]
    is_system: boolean
    created_at: string
    updated_at: string
}

/**
 * Resolves the set of permissions for a given profile.
 * - "admin" role → all permissions (super-admin)
 * - Custom role with a linked role record → that role's permissions
 * - No role / "user" → empty set (no admin access)
 */
export function resolvePermissions(
    profileRole: string | null,
    customRolePermissions: PermissionKey[] | null,
): Set<PermissionKey> {
    // Built-in admin gets everything
    if (profileRole === "admin") {
        return new Set(ALL_PERMISSIONS)
    }

    // Custom role permissions
    if (customRolePermissions && customRolePermissions.length > 0) {
        return new Set(customRolePermissions)
    }

    return new Set()
}

/**
 * Check if the user has permission for a specific page.
 */
export function hasPermission(
    permissions: Set<PermissionKey> | PermissionKey[],
    key: PermissionKey,
): boolean {
    if (permissions instanceof Set) {
        return permissions.has(key)
    }
    return permissions.includes(key)
}
