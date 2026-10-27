/** Same gate as report send/schedule APIs: built-in admin or super_admin only. */
export function isBuiltInAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin"
}
