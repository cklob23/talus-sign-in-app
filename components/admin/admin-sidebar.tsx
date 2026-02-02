"use client"

import React from "react"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, createContext, useContext } from "react"
import { TalusAgLogo, TalusAgLogoIcon } from "@/components/talusag-logo"
import { useBranding } from "@/hooks/use-branding"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
  PanelLeftClose,
  PanelLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { UsersRound } from "lucide-react"

const SIDEBAR_COLLAPSED_KEY = "admin-sidebar-collapsed"

// Context to share collapsed state
const SidebarContext = createContext<{
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}>({
  collapsed: false,
  setCollapsed: () => {},
})

export function useSidebar() {
  return useContext(SidebarContext)
}

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

function NavContent({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname()
  const { branding } = useBranding()

  return (
    <>
      <nav className={cn("flex-1 space-y-1", collapsed ? "p-2" : "p-4")}>
        <TooltipProvider delayDuration={0}>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))
            
            const linkContent = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors",
                  collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!collapsed && item.label}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    {linkContent}
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return linkContent
          })}
        </TooltipProvider>
      </nav>
      {!collapsed && (
        <div className="p-4 border-t">
          <p className="text-xs text-muted-foreground">{branding.companyName} Visitor Management</p>
        </div>
      )}
    </>
  )
}

// Desktop sidebar
export function AdminSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside 
      className={cn(
        "hidden lg:flex border-r bg-sidebar flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className={cn("border-b flex items-center", collapsed ? "p-2 justify-center" : "p-4 justify-between")}>
        <Link href="/admin">
          {collapsed ? <TalusAgLogoIcon className="w-8 h-8" /> : <TalusAgLogo />}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn("shrink-0", collapsed && "hidden")}
        >
          <PanelLeftClose className="w-5 h-5" />
          <span className="sr-only">Collapse sidebar</span>
        </Button>
      </div>
      {collapsed && (
        <div className="p-2 border-b">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="w-full"
          >
            <PanelLeft className="w-5 h-5" />
            <span className="sr-only">Expand sidebar</span>
          </Button>
        </div>
      )}
      <NavContent collapsed={collapsed} />
    </aside>
  )
}

// Sidebar provider to manage state
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (stored !== null) {
      setCollapsed(stored === "true")
    }
    setMounted(true)
  }, [])

  const handleSetCollapsed = (value: boolean) => {
    setCollapsed(value)
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value))
  }

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <SidebarContext.Provider value={{ collapsed: false, setCollapsed: handleSetCollapsed }}>
        {children}
      </SidebarContext.Provider>
    )
  }

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed: handleSetCollapsed }}>
      {children}
    </SidebarContext.Provider>
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
