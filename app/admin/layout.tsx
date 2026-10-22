import type React from "react"
import { getTenant } from "@/lib/tenant"
import { AdminLayoutClient } from "@/components/admin/admin-layout-client"
import { requireAdminPageUser } from "@/lib/admin-auth"
import type { TenantInfo } from "@/lib/tier"

/**
 * Server component: require a privileged role, then load tenant config.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPageUser()

  let tenant: TenantInfo | null = null

  try {
    tenant = await getTenant()
  } catch {
    // If tenant loading fails, the client layout defaults to Starter with no add-ons
  }

  return (
    <AdminLayoutClient tenant={tenant}>
      {children}
    </AdminLayoutClient>
  )
}
