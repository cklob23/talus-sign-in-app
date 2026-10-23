"use client"

import { Building2 } from "lucide-react"
import { Label } from "@/components/ui/label"

export function KioskResolvedSite({
  label,
  siteName,
  distanceText,
  pendingText,
}: {
  label?: string
  siteName: string | null
  distanceText?: string | null
  pendingText?: string
}) {
  const name = siteName || pendingText
  if (!name) return null

  return (
    <div className="space-y-2">
      {label ? <Label>{label}</Label> : null}
      <div
        className="space-y-2 rounded-lg bg-muted/50 p-3"
        data-testid="kiosk-resolved-site"
        aria-readonly="true"
      >
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-sm font-medium">{siteName ? `Signing in at ${siteName}` : name}</p>
            {distanceText ? <p className="text-xs text-muted-foreground">{distanceText}</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
