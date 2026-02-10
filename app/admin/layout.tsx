import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"
import { AdminLayoutClient } from "@/components/admin/admin-layout-client"
import type { TenantInfo } from "@/lib/tier"

/**
 * Server component: loads this instance's tenant config from the DB,
 * then passes it to the client layout wrapper.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
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
