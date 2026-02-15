"use client"

import { usePathname } from "next/navigation"
import { usePermissions } from "@/contexts/permissions-context"
import { ROUTE_PERMISSION_MAP } from "@/lib/permissions"
import { ShieldX } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Centralized route-level permission guard for all admin pages.
 *
 * Wraps the admin layout's {children} and checks the current pathname
 * against the user's permissions. Built-in admins bypass all checks.
 * While permissions are loading, children are rendered normally to
 * avoid a flash (the sidebar already handles its own loading state).
 */
export function RouteGuard({ children }: { children: ReactNode }) {
    const pathname = usePathname()
    const { permissions, isLoading, profileRole } = usePermissions()

    // While loading, render children (avoids blank flash; pages have their own loading states)
    if (isLoading) return <>{children}</>

    // Built-in admins bypass all permission checks
    if (profileRole === "admin") return <>{children}</>

    // Find the matching route permission
    // Check exact match first, then check prefix matches for nested routes (e.g. /admin/reports/timesheets)
    let requiredPermission = ROUTE_PERMISSION_MAP[pathname]
    if (!requiredPermission) {
        // Check parent routes for nested pages
        const segments = pathname.split("/")
        while (segments.length > 2 && !requiredPermission) {
            segments.pop()
            requiredPermission = ROUTE_PERMISSION_MAP[segments.join("/")]
        }
    }

    // If no permission mapping exists for this route, allow access (shouldn't happen)
    if (!requiredPermission) return <>{children}</>

    // Check if user has the required permission
    if (!permissions.has(requiredPermission)) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                    <ShieldX className="w-10 h-10 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold">Access Denied</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    You do not have permission to access this page. Contact your administrator to request access.
                </p>
            </div>
        )
    }

    return <>{children}</>
}
