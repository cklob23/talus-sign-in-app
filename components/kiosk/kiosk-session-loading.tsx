"use client"

import { Loader2 } from "lucide-react"
import { TalusAgLogo } from "@/components/talusag-logo"

/** Neutral splash while /kiosk checks for an existing receptionist session. */
export function KioskSessionLoading() {
  return (
    <div
      className="kiosk-touch flex min-h-screen flex-col items-center justify-center bg-[#f5f8f6]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <TalusAgLogo />
      <Loader2 className="mt-8 h-8 w-8 animate-spin text-[#00854c]" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  )
}
