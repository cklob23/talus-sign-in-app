"use client"

import { MapPin } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { formatHeaderSiteLine } from "@/lib/kiosk-site"

export function KioskSiteLine({
  siteName,
  meters,
  unavailable,
  copy,
  className = "",
  compact = false,
  detecting = false,
}: {
  siteName: string
  meters: number | null
  unavailable: boolean
  copy: { locationUnavailable: string; siteDistanceAway: string; checkingLocation: string }
  className?: string
  compact?: boolean
  detecting?: boolean
}) {
  return (
    <span
      className={`flex min-w-0 items-center gap-2 text-sm font-medium text-[#0f1a13] ${className}`}
      {...(detecting ? { role: "status", "aria-live": "polite", "aria-busy": true } : {})}
    >
      {detecting ? (
        <Spinner className="shrink-0 text-[#00703f]" aria-hidden />
      ) : (
        <MapPin className="h-4 w-4 shrink-0 text-[#00703f]" aria-hidden />
      )}
      <span className="truncate">
        {formatHeaderSiteLine({
          siteName,
          meters,
          unavailable,
          copy,
          includeDistance: !compact,
          detecting,
        })}
      </span>
    </span>
  )
}
