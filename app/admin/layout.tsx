"use client"

import type React from "react"
import { AdminSidebar, SidebarProvider, useSidebar } from "@/components/admin/admin-sidebar"
import { AdminHeader } from "@/components/admin/admin-header"
import { TimezoneProvider } from "@/contexts/timezone-context"

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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <TimezoneProvider>
      <SidebarProvider>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </SidebarProvider>
    </TimezoneProvider>
  )
}
