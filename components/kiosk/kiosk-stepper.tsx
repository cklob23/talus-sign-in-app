import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { kioskStepperLabels } from "@/lib/kiosk-stepper"
import type { VisitorCopy } from "@/lib/visitor-i18n"

export function KioskStepper({
  current,
  includeTraining = true,
  copy,
}: {
  current: number
  includeTraining?: boolean
  copy: VisitorCopy
}) {
  const steps = kioskStepperLabels(copy, includeTraining)

  return (
    <ol
      className="mb-6 flex items-center"
      aria-label={copy.stepOf.replace("{current}", String(current + 1)).replace("{total}", String(steps.length))}
    >
      {steps.map((label, index) => {
        const done = index < current
        const on = index === current
        const last = index === steps.length - 1
        return (
          <li
            key={`${index}-${label}`}
            className={cn("flex min-w-0 items-center", last ? "shrink-0" : "flex-1")}
            aria-current={on ? "step" : undefined}
          >
            <div className={cn("flex min-w-0 items-center gap-2", on ? "text-primary-text" : done ? "text-foreground" : "text-muted-foreground")}>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-13 font-semibold",
                  done && "bg-primary text-primary-foreground",
                  on && "bg-primary text-primary-foreground",
                  !done && !on && "bg-surface-2 text-muted-foreground",
                )}
                aria-label={`${index + 1}. ${label}`}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : index + 1}
              </span>
              <span className="hidden truncate text-15 font-semibold md:inline">{label}</span>
            </div>
            {last ? null : (
              <span className={cn("mx-2 h-1 min-w-4 flex-1 rounded-full", index < current ? "bg-primary" : "bg-border")} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
