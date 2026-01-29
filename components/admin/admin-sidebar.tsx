"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { TalusAgLogo } from "@/components/talusag-logo"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
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
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { UsersRound } from "lucide-react"

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/visitors", label: "Current Visitors", icon: Users },
  { href: "/admin/history", label: "History", icon: ClipboardList },
  { href: "/admin/bookings", label: "Bookings", icon: Calendar },
  { href: "/admin/reports", label: "Reports", icon: FileText },
  { href: "/admin/evacuations", label: "Evacuations", icon: AlertTriangle },
  { href: "/admin/hosts", label: "Hosts", icon: UserCog },
  { href: "/admin/users", label: "User Management", icon: UsersRound },
  { href: "/admin/locations", label: "Locations", icon: Building2 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
]

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground">Talus Visitor Management</p>
      </div>
    </>
  )
}

// Desktop sidebar
export function AdminSidebar() {
  return (
    <aside className="hidden lg:flex w-64 border-r bg-sidebar flex-col">
      <div className="p-4 border-b">
        <Link href="/admin">
          <TalusAgLogo />
        </Link>
      </div>
      <NavContent />
    </aside>
  )
}

// Mobile sidebar trigger and sheet
export function MobileSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar">
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <div className="p-4 border-b">
          <Link href="/admin" onClick={() => setOpen(false)}>
            <TalusAgLogo />
          </Link>
        </div>
        <NavContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
