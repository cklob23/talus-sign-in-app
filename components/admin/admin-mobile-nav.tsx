"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calendar, Home, MoreHorizontal, Users } from "lucide-react"
import { cn } from "@/lib/utils"

const items = [
  { href: "/admin", label: "Home", icon: Home, exact: true },
  { href: "/admin/visitors", label: "On site", icon: Users },
  { href: "/admin/bookings", label: "Bookings", icon: Calendar },
]

export function AdminMobileNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
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
}
