"use client"

import type React from "react"
import { AdminSidebar, SidebarProvider, useSidebar } from "@/components/admin/admin-sidebar"
import { AdminHeader } from "@/components/admin/admin-header"
import { RouteGuard } from "@/components/admin/route-guard"
import { TimezoneProvider } from "@/contexts/timezone-context"
import { TenantProvider } from "@/contexts/tenant-context"
import { PermissionsProvider } from "@/contexts/permissions-context"
import { Toaster } from "@/components/ui/toaster"
import type { TenantInfo } from "@/lib/tier"

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { collapsed, setCollapsed } = useSidebar()

  return (
    <div className="flex min-h-dvh bg-background [contain:none] [filter:none] [transform:none]">
      <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex min-w-0 flex-1 flex-col [contain:none] [filter:none] [transform:none]">
        <AdminHeader />
        {/* Document scrolls; do not use overflow-auto here. Inner overflow + 100vh
            makes iOS treat position:fixed as the bottom of the first screen. */}
        <main className="flex-1 overflow-visible p-3 sm:p-4 lg:overflow-visible lg:p-9 lg:pb-6">
          <RouteGuard>{children}</RouteGuard>
        </main>
        <Toaster />
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
