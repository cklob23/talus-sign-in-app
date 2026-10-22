import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const tones = {
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  neu: "bg-surface-2 text-muted-foreground",
  danger: "bg-danger-soft text-danger",
} as const

export function StatusPill({
  tone = "neu",
  className,
  children,
}: {
  tone?: keyof typeof tones
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
