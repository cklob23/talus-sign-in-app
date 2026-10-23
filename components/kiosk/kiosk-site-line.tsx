"use client"

import { MapPin } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { formatHeaderSiteLine, formatHeaderSiteParts } from "@/lib/kiosk-site"

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
  const label = formatHeaderSiteLine({
    siteName,
    meters,
    unavailable,
    copy,
    includeDistance: !compact,
    detecting,
  })
  const parts = formatHeaderSiteParts({
    siteName,
    meters,
    unavailable,
    copy,
    detecting,
  })
  const spinnerOnly = detecting && !siteName

  return (
    <span
      data-testid="kiosk-site-line"
      className={`flex min-w-0 items-start gap-2 text-sm font-medium text-foreground md:items-center ${className}`}
      {...(detecting ? { role: "status", "aria-live": "polite", "aria-busy": true } : {})}
    >
      {detecting ? (
        <Spinner className="mt-0.5 shrink-0 text-primary-text md:mt-0" aria-hidden />
      ) : (
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-text md:mt-0" aria-hidden />
      )}
      {spinnerOnly ? (
        <>
          <span className="sr-only">{copy.checkingLocation}</span>
          <span className="hidden truncate md:inline">{copy.checkingLocation}</span>
        </>
      ) : (
        <>
          <span className="flex min-w-0 flex-col md:hidden">
            <span className="break-words">{parts.name}</span>
            {parts.detail ? (
              <span className="break-words font-normal text-muted-foreground">{parts.detail}</span>
            ) : null}
          </span>
          <span className="hidden truncate md:inline">{label}</span>
        </>
      )}
    </span>
  )
}
