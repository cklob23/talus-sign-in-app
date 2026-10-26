import { isBuiltInAdminRole } from "@/lib/admin-role"
import type { PermissionKey } from "@/lib/permissions"

export type ReportViewPortalAuth =
  | { ok: true; user: { role: string; permissions: Set<PermissionKey>; userId: string } }
  | { ok: false; status: 401 | 403; error?: string }

export type ReportViewAuth =
  | { ok: true; user: { role: string; permissions: Set<PermissionKey>; userId: string } }
  | { ok: false; status: 401 | 403 }

/** Match report send/schedule APIs: admin and super_admin only. */
export function authorizeReportView(auth: ReportViewPortalAuth): ReportViewAuth {
  if (!auth.ok) return { ok: false, status: auth.status }
  if (!isBuiltInAdminRole(auth.user.role)) return { ok: false, status: 403 }
  return { ok: true, user: auth.user }
}

/** Run the service-role query only after the same check as the report APIs. */
export async function loadReportViewIfAuthorized<T>(
  auth: ReportViewPortalAuth,
  load: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; status: 401 | 403 }> {
  const allowed = authorizeReportView(auth)
  if (!allowed.ok) return { ok: false, status: allowed.status }
  return { ok: true, data: await load() }
}
