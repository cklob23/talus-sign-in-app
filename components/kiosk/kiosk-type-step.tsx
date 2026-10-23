"use client"

import { ArrowLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KioskStepper } from "@/components/kiosk/kiosk-stepper"
import type { VisitorType } from "@/types/database"
import type { VisitorCopy } from "@/lib/visitor-i18n"

export function KioskTypeStep({
  types,
  copy,
  onPick,
  onBack,
}: {
  types: VisitorType[]
  copy: VisitorCopy
  onPick: (id: string) => void
  onBack: () => void
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <KioskStepper current={0} copy={copy} />
      <Button variant="ghost" className="min-h-14 bg-transparent" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {copy.back}
      </Button>
      <div>
        <h1 className="text-32 font-bold">{copy.whyHere}</h1>
        <p className="mt-2 text-muted-foreground">{copy.whyHereHelp}</p>
      </div>
      <div className="flex flex-col gap-3">
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => onPick(type.id)}
            className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 text-left"
          >
            <span className="flex items-center gap-3">
              <span className="h-10 w-1.5 rounded-full" style={{ backgroundColor: type.badge_color }} />
              <span>
                <span className="block text-17 font-semibold">{type.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {[
                    type.requires_host ? copy.host : null,
                    type.requires_company ? copy.company : null,
                    type.requires_training ? copy.safety : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  )
}
