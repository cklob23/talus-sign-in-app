"use client"

import type React from "react"
import { useState } from "react"
import { AdminSidebar, SidebarProvider, useSidebar } from "@/components/admin/admin-sidebar"
import { AdminHeader } from "@/components/admin/admin-header"
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav"
import { RouteGuard } from "@/components/admin/route-guard"
import { TimezoneProvider } from "@/contexts/timezone-context"
import { TenantProvider } from "@/contexts/tenant-context"
import { PermissionsProvider } from "@/contexts/permissions-context"
import type { TenantInfo } from "@/lib/tier"

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { collapsed, setCollapsed } = useSidebar()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader mobileOpen={moreOpen} onMobileOpenChange={setMoreOpen} />
        <main className="flex-1 overflow-auto p-3 pb-24 sm:p-4 lg:p-9 lg:pb-6">
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
      <AdminMobileNav onMore={() => setMoreOpen(true)} />
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
      <PermissionsProvider>
        <SidebarProvider>
          <AdminLayoutContent>{children}</AdminLayoutContent>
        </SidebarProvider>
      </PermissionsProvider>
    </TimezoneProvider>
  )

  if (tenant) {
    return <TenantProvider tenant={tenant}>{content}</TenantProvider>
  }

  return content
}
