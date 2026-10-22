"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { formatElapsedSince, type SyncLogEntry } from "@/lib/sync/history"

function providerLabel(provider: string) {
  return provider === "ramp" ? "Ramp" : "Entra ID"
}

function triggerLabel(trigger: string) {
  return trigger === "cron" ? "Hourly cron" : "Manual"
}

function statusLabel(status: SyncLogEntry["status"]) {
  if (status === "running" || status === "queued") return "In progress"
  if (status === "succeeded") return "Succeeded"
  if (status === "stale") return "Stale (no heartbeat)"
  return "Failed"
}

export function SyncLiveCard({ run }: { run: SyncLogEntry }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (run.status !== "running" && run.status !== "queued") return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [run.status, run.id])

  const total = run.progressTotal
  const current = run.progressCurrent ?? 0
  const determinate = typeof total === "number" && total > 0
  const pct = determinate ? Math.min(100, Math.round((current / total) * 100)) : 0
  const live = run.status === "running" || run.status === "queued"

  return (
    <Card className={live ? "border-primary/40" : undefined}>
      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
          {live ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : run.status === "succeeded" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <XCircle className="w-5 h-5 text-destructive" />
          )}
          <span>{providerLabel(run.provider)} sync</span>
          <Badge variant="outline">{triggerLabel(run.trigger)}</Badge>
          <Badge
            variant={run.status === "failed" || run.status === "stale" ? "destructive" : "secondary"}
            className="ml-auto"
          >
            {statusLabel(run.status)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            {run.phase || (live ? "Starting" : "Finished")}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {live
              ? `Elapsed ${formatElapsedSince(run.startedAt, now)}`
              : run.finishedAt
                ? `Finished after ${formatElapsedSince(run.startedAt, new Date(run.finishedAt).getTime())}`
                : "Elapsed n/a"}
          </p>
        </div>

        {determinate ? (
          <div className="space-y-1.5">
            <Progress value={pct} className="h-2" />
            <p className="text-xs text-muted-foreground tabular-nums">
              {current} of {total} ({pct}%)
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-primary/20">
              <div className={`h-full rounded-full bg-primary/70 ${live ? "w-full animate-pulse" : "w-0"}`} />
            </div>
            <p className="text-xs text-muted-foreground">
              {live ? "Counting items from the connector" : "Total was not reported"}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <Count label="Synced" value={run.synced} />
          <Count label="Created" value={run.created} />
          <Count label="Updated" value={run.updated} />
          <Count label="Deactivated" value={run.deactivated} />
          <Count label="Errors" value={run.errorCount} warn={run.errorCount > 0} />
        </div>
      </CardContent>
    </Card>
  )
}

function Count({ label, value, warn }: { label: string; value: number | null; warn?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${warn ? "text-destructive" : ""}`}>
        {value ?? 0}
      </p>
    </div>
  )
}
