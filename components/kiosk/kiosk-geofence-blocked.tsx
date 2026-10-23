"use client"

import { MapPinOff } from "lucide-react"
import { Button } from "@/components/ui/button"

export function KioskGeofenceBlocked({
  title,
  help,
  staffDetail,
  onOverride,
  overrideLabel,
  compact = false,
}: {
  title: string
  help: string
  staffDetail?: string | null
  onOverride?: (() => void) | null
  overrideLabel?: string
  compact?: boolean
}) {
  return (
    <div
      className={
        compact
          ? "rounded-xl border border-warning/40 bg-warning-soft p-4"
          : "v2-hero flex min-h-[280px] flex-col gap-4 border-2 border-warning/40 bg-warning-soft p-8 text-left"
      }
      role="status"
      aria-live="polite"
    >
      {compact ? null : (
        <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-warning text-primary-foreground">
          <MapPinOff className="h-9 w-9" aria-hidden />
        </span>
      )}
      <div>
        <p className={compact ? "font-medium text-warning" : "text-24 font-bold text-warning"}>{title}</p>
        <p className={compact ? "mt-1 text-sm text-warning" : "mt-2 text-muted-foreground"}>{help}</p>
        {staffDetail ? <p className="mt-2 text-sm text-warning">{staffDetail}</p> : null}
      </div>
      {onOverride && overrideLabel ? (
        <Button type="button" variant="outline" className="mt-auto min-h-12" onClick={onOverride}>
          {overrideLabel}
        </Button>
      ) : null}
    </div>
  )
}
