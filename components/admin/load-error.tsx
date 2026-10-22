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
    <div className="rounded-2xl border border-[#fdecec] bg-[#fdecec] p-6" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#b3000a]" />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-[#b3000a]">{title}</p>
          <p className="text-sm text-[#55625a]">Your data is safe. Nothing was deleted.</p>
          {detail ? <p className="text-sm text-[#0f1a13]">{detail}</p> : null}
          <Button type="button" onClick={onRetry} className="mt-2 min-h-11 bg-[#00854c] hover:bg-[#00703f]">
            Try again
          </Button>
        </div>
      </div>
    </div>
  )
}
