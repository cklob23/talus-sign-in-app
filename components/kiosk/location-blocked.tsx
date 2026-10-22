"use client"

import { AlertTriangle, MapPinOff, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatMeters } from "@/lib/checkin-geofence"

export type KioskBlockReason = "denied" | "no_fix" | "checking" | "outside" | "poor_accuracy"

export function kioskBlockCopy(
  reason: KioskBlockReason,
  locationName: string,
  distance: number | null,
  radius: number | null,
): { title: string; body: string } {
  switch (reason) {
    case "denied":
      return {
        title: "Location permission is off",
        body: `This kiosk has not shared its location, so sign-in at ${locationName} is blocked. A staff member should allow location access in the browser, or use staff override if the visitor is on site.`,
      }
    case "no_fix":
      return {
        title: "No location reading",
        body: `This kiosk has not reported a position yet. Wait for a fix, or use staff override if the visitor is on site at ${locationName}.`,
      }
    case "checking":
      return {
        title: "Checking kiosk location",
        body: `Waiting for a location reading before anyone can sign in at ${locationName}.`,
      }
    case "poor_accuracy":
      return {
        title: "Location is too coarse",
        body: `The kiosk could not get a usable fix. Move it near a window, tap Refine, or use staff override if the visitor is on site at ${locationName}.`,
      }
    default:
      return {
        title: "This kiosk is outside the site",
        body:
          distance !== null && radius !== null
            ? `This device is about ${formatMeters(distance)} from ${locationName}. Sign-in is limited to ${formatMeters(radius)}. Move closer, or use staff override if the visitor is on site.`
            : `This device is not inside the ${locationName} radius. Move closer, or use staff override if the visitor is on site.`,
      }
  }
}

export function LocationBlockedPanel({
  reason,
  locationName,
  distance = null,
  radius = null,
  onOverride,
  overrideBusy = false,
}: {
  reason: KioskBlockReason
  locationName: string
  distance?: number | null
  radius?: number | null
  onOverride?: () => void
  overrideBusy?: boolean
}) {
  const copy = kioskBlockCopy(reason, locationName, distance, radius)
  const Icon = reason === "denied" || reason === "no_fix" ? MapPinOff : AlertTriangle

  return (
    <div
      className="mb-4 sm:mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:p-4"
      data-testid="kiosk-location-blocked"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800">{copy.title}</p>
          <p className="text-xs text-amber-700 mt-1">{copy.body}</p>
          {reason !== "checking" && onOverride ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 bg-white text-amber-900 border-amber-300"
              onClick={onOverride}
              disabled={overrideBusy}
            >
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              Staff override
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
