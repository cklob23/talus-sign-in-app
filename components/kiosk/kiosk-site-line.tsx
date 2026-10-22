"use client"

import { MapPin } from "lucide-react"
import { formatHeaderSiteLine } from "@/lib/kiosk-site"

export function KioskSiteLine({
  siteName,
  meters,
  unavailable,
  copy,
  className = "",
}: {
  siteName: string
  meters: number | null
  unavailable: boolean
  copy: { locationUnavailable: string; siteDistanceAway: string }
  className?: string
}) {
  return (
    <span className={`flex min-w-0 items-center gap-2 text-sm font-medium text-[#0f1a13] ${className}`}>
      <MapPin className="h-4 w-4 shrink-0 text-[#00703f]" aria-hidden />
      <span className="truncate">
        {formatHeaderSiteLine({ siteName, meters, unavailable, copy })}
      </span>
    </span>
  )
}
