"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calendar, Home, MoreHorizontal, Users } from "lucide-react"
import { cn } from "@/lib/utils"

const items = [
  { href: "/admin", label: "Home", icon: Home, exact: true },
  { href: "/admin/visitors", label: "On site", icon: Users },
  { href: "/admin/bookings", label: "Bookings", icon: Calendar },
]

/**
 * Viewport-pinned iOS styles. Inline so no ancestor / Tailwind layer can
 * demote `position:fixed` to the first 100vh box (Safari PWA quirk).
 */
const pinStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 50,
  paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
}

export function AdminMobileNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const nav = (
    <nav
      data-testid="admin-mobile-nav"
      aria-label="Admin"
      className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-card px-2 pt-2 lg:hidden"
      style={pinStyle}
    >
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold",
              active ? "bg-accent text-primary-text" : "text-muted-foreground",
            )}
          >
            <item.icon className="h-[22px] w-[22px]" />
            {item.label}
          </Link>
        )
      })}
      <button
        type="button"
        onClick={onMore}
        className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold text-muted-foreground"
      >
        <MoreHorizontal className="h-[22px] w-[22px]" />
        More
      </button>
    </nav>
  )

  // Portal to <body> so overflow/transform/filter/contain on layout ancestors
  // cannot create a containing block for position:fixed on iOS Safari.
  if (mounted && typeof document !== "undefined") {
    return createPortal(nav, document.body)
  }

  return nav
}
