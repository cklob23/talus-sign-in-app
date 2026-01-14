"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { TalusAgLogo } from "@/components/talusag-logo"
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Calendar,
  AlertTriangle,
  Settings,
  Building2,
  UserCog,
  FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/visitors", label: "Current Visitors", icon: Users },
  { href: "/admin/history", label: "History", icon: ClipboardList },
  { href: "/admin/bookings", label: "Bookings", icon: Calendar },
  { href: "/admin/reports", label: "Reports", icon: FileText },
  { href: "/admin/evacuations", label: "Evacuations", icon: AlertTriangle },
  { href: "/admin/hosts", label: "Hosts", icon: UserCog },
  { href: "/admin/locations", label: "Locations", icon: Building2 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 border-r bg-sidebar flex flex-col">
      <div className="p-4 border-b">
        <Link href="/admin">
          <TalusAgLogo />
        </Link>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground">Talus Visitor Management</p>
      </div>
    </aside>
  )
}
