"use client"

import { Fragment, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronDown, ChevronRight } from "lucide-react"
import { formatDuration, type SyncLogEntry } from "@/lib/sync/history"
import type { SyncRunDisplayStatus, SyncRunProvider } from "@/lib/sync/runs"

function providerLabel(provider: string) {
  return provider === "ramp" ? "Ramp" : "Entra ID"
}

function statusVariant(status: SyncLogEntry["status"]): "secondary" | "destructive" | "outline" {
  if (status === "failed" || status === "stale") return "destructive"
  if (status === "succeeded") return "secondary"
  return "outline"
}

function formatWhen(iso: string | null) {
  if (!iso) return "n/a"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "n/a"
  return date.toLocaleString()
}

export function SyncLogsTable({
  logs,
  provider,
  status,
  onProviderChange,
  onStatusChange,
}: {
  logs: SyncLogEntry[]
  provider: SyncRunProvider | "all"
  status: SyncRunDisplayStatus | "all"
  onProviderChange: (value: SyncRunProvider | "all") => void
  onStatusChange: (value: SyncRunDisplayStatus | "all") => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={provider} onValueChange={(value) => onProviderChange(value as SyncRunProvider | "all")}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="azure">Entra ID</SelectItem>
              <SelectItem value="ramp">Ramp</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => onStatusChange(value as SyncRunDisplayStatus | "all")}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="stale">Stale</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Newer rows come from sync runs. Older cron history is filled in from audit logs.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Provider</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Finished</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Synced</TableHead>
            <TableHead className="text-right">Created</TableHead>
            <TableHead className="text-right">Updated</TableHead>
            <TableHead className="text-right">Deactivated</TableHead>
            <TableHead className="text-right">Errors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-sm text-muted-foreground py-8">
                No sync runs yet. Cron history will appear here after the next scheduled run, or after you sync now.
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => {
              const expandable = log.errors.length > 0
              const open = openId === log.id
              return (
                <Fragment key={log.id}>
                  <TableRow
                    className={expandable ? "cursor-pointer" : undefined}
                    onClick={() => expandable && setOpenId(open ? null : log.id)}
                  >
                    <TableCell>
                      {expandable ? (
                        open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                      ) : null}
                    </TableCell>
                    <TableCell>{providerLabel(log.provider)}</TableCell>
                    <TableCell className="capitalize">{log.trigger === "cron" ? "Cron" : "Manual"}</TableCell>
                    <TableCell>{formatWhen(log.startedAt)}</TableCell>
                    <TableCell>{formatWhen(log.finishedAt)}</TableCell>
                    <TableCell>{formatDuration(log.startedAt, log.finishedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(log.status)} className="capitalize">
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{log.synced ?? "n/a"}</TableCell>
                    <TableCell className="text-right tabular-nums">{log.created ?? "n/a"}</TableCell>
                    <TableCell className="text-right tabular-nums">{log.updated ?? "n/a"}</TableCell>
                    <TableCell className="text-right tabular-nums">{log.deactivated ?? "n/a"}</TableCell>
                    <TableCell className="text-right tabular-nums">{log.errorCount}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow key={`${log.id}-errors`}>
                      <TableCell colSpan={12} className="bg-destructive/5">
                        <div className="max-h-40 overflow-y-auto space-y-1 py-1">
                          {log.errors.map((error, index) => (
                            <p key={`${log.id}-err-${index}`} className="text-xs font-mono text-destructive break-all">
                              {error}
                            </p>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
