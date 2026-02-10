"use client"

import type React from "react"
import { AdminSidebar, SidebarProvider, useSidebar } from "@/components/admin/admin-sidebar"
import { AdminHeader } from "@/components/admin/admin-header"
import { TimezoneProvider } from "@/contexts/timezone-context"
import { TenantProvider } from "@/contexts/tenant-context"
import type { TenantInfo } from "@/lib/tier"

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { collapsed, setCollapsed } = useSidebar()

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader />
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

/**
 * Client-side admin layout wrapper.
 * If a tenant is provided (loaded by the server layout), wraps children in TenantProvider.
 * Falls back gracefully if no tenant is loaded (env var fallback in tier.ts).
 */
export function AdminLayoutClient({
  tenant,
  children,
}: {
  tenant: TenantInfo | null
  children: React.ReactNode
}) {
  const content = (
    <TimezoneProvider>
      <SidebarProvider>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </SidebarProvider>
    </TimezoneProvider>
  )

  if (tenant) {
    return <TenantProvider tenant={tenant}>{content}</TenantProvider>
  }

  return content
}
