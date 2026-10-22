"use client"

import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AdminLoadError({
  title,
  detail,
  onRetry,
}: {
  title: string
  detail?: string | null
  onRetry: () => void
}) {
  return (
    <div className="rounded-2xl border border-danger/35 bg-danger-soft p-6" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-danger">{title}</p>
          <p className="text-sm text-muted-foreground">Your data is safe. Nothing was deleted.</p>
          {detail ? <p className="text-sm text-foreground">{detail}</p> : null}
          <Button type="button" onClick={onRetry} className="mt-2 min-h-11">
            Try again
          </Button>
        </div>
      </div>
    </div>
  )
}
