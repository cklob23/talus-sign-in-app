import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
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
  const steps = includeTraining
    ? [copy.you, copy.details, copy.safety, copy.photo]
    : [copy.you, copy.details, copy.photo]

  return (
    <ol className="mb-6 flex items-center gap-2" aria-label={copy.stepOf.replace("{current}", String(current + 1)).replace("{total}", String(steps.length))}>
      {steps.map((label, index) => {
        const done = index < current
        const on = index === current
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <div className={cn("flex min-w-0 items-center gap-2", on ? "text-primary-text" : done ? "text-foreground" : "text-muted-foreground")}>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-13 font-semibold",
                  done && "bg-primary text-primary-foreground",
                  on && "bg-primary text-primary-foreground",
                  !done && !on && "bg-surface-2 text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
              </span>
              <span className="truncate text-15 font-semibold">{label}</span>
            </div>
            {index < steps.length - 1 ? (
              <span className={cn("h-1 min-w-4 flex-1 rounded-full", index < current ? "bg-primary" : "bg-border")} />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
