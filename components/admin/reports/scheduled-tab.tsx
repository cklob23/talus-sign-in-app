"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, History, Pencil, Plus, Send, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatReportDateTime } from "@/lib/reports/rows"
import {
  FREQUENCY_LABELS,
  DURATION_UNIT_LABELS,
  RANGE_TYPE_LABELS,
  REPORT_KIND_LABELS,
  WEEKDAYS,
  isTalusRecipient,
  type ReportRun,
  type ReportSchedule,
  type ReportScheduleInput,
} from "@/lib/reports/types"
import { showAdminToast } from "@/hooks/admin-notify"
import {
  scheduleDeleteToast,
  scheduleSaveToast,
  scheduleSendNowToast,
  scheduleToggleToast,
} from "@/lib/reports/action-toasts"
import type { FilterOption } from "./filter-bar"
import { ScheduleForm } from "./schedule-form"

function cadenceLabel(schedule: ReportSchedule): string {
  if (schedule.frequency === "weekly") {
    const day = WEEKDAYS.find((item) => item.value === schedule.weekday)?.label || "Monday"
    return `Weekly on ${day} at ${schedule.sendTime}`
  }
  if (schedule.frequency === "monthly") {
    return `Monthly on day ${schedule.monthDay || 1} at ${schedule.sendTime}`
  }
  return `Daily at ${schedule.sendTime}`
}

function rangeLabel(schedule: ReportSchedule): string {
  const range = schedule.rangeType === "last_n_days" ? `Last ${schedule.lastNDays || 7} days` : RANGE_TYPE_LABELS[schedule.rangeType]
  if (schedule.kind === "visitors" || schedule.kind === "employees") {
    return `${range} · ${DURATION_UNIT_LABELS[schedule.durationUnit || "minutes"]}`
  }
  return range
}

export function ScheduledTab({
  locations,
  visitorTypes,
  previewSchedules,
  previewRuns,
  previewFormOpen,
}: {
  locations: FilterOption[]
  visitorTypes: FilterOption[]
  previewSchedules?: ReportSchedule[]
  previewRuns?: ReportRun[]
  previewFormOpen?: boolean
}) {
  const [schedules, setSchedules] = useState<ReportSchedule[]>(previewSchedules || [])
  const [loading, setLoading] = useState(!previewSchedules)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(Boolean(previewFormOpen))
  const [editing, setEditing] = useState<ReportSchedule | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [historyId, setHistoryId] = useState<string | null>(previewRuns ? previewSchedules?.[0]?.id || "preview" : null)
  const [runs, setRuns] = useState<ReportRun[]>(previewRuns || [])
  const [sendingId, setSendingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (previewSchedules) return
    setLoading(true)
    const res = await fetch("/api/admin/reports/schedules")
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body.error || "Could not load schedules")
      setSchedules([])
    } else {
      setError(null)
      setSchedules(body.schedules || [])
    }
    setLoading(false)
  }, [previewSchedules])

  useEffect(() => {
    load()
  }, [load])

  async function loadRuns(id: string) {
    if (previewRuns) {
      setHistoryId(id)
      return
    }
    setHistoryId(id)
    const res = await fetch(`/api/admin/reports/schedules/${id}/runs`)
    const body = await res.json().catch(() => ({}))
    setRuns(body.runs || [])
  }

  async function save(value: ReportScheduleInput) {
    setSubmitting(true)
    setError(null)
    const path = editing ? `/api/admin/reports/schedules/${editing.id}` : "/api/admin/reports/schedules"
    const res = await fetch(path, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    })
    const body = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok) {
      const message = body.error || "Could not save schedule"
      setError(message)
      showAdminToast(scheduleSaveToast(false, Boolean(editing), message))
      return
    }
    showAdminToast(scheduleSaveToast(true, Boolean(editing)))
    setFormOpen(false)
    setEditing(null)
    await load()
  }

  async function remove(schedule: ReportSchedule) {
    if (!window.confirm(`Delete ${schedule.name}? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/reports/schedules/${schedule.id}`, { method: "DELETE" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const message = body.error || "Could not delete schedule"
      setError(message)
      showAdminToast(scheduleDeleteToast(false, message))
      return
    }
    showAdminToast(scheduleDeleteToast(true))
    if (historyId === schedule.id) {
      setHistoryId(null)
      setRuns([])
    }
    await load()
  }

  async function sendNow(schedule: ReportSchedule) {
    setSendingId(schedule.id)
    setError(null)
    const res = await fetch(`/api/admin/reports/schedules/${schedule.id}/send`, { method: "POST" })
    const body = await res.json().catch(() => ({}))
    setSendingId(null)
    if (!res.ok) {
      const message = body.error || "Could not send report"
      setError(message)
      showAdminToast(scheduleSendNowToast(false, message))
      return
    }
    showAdminToast(scheduleSendNowToast(true))
    if (historyId === schedule.id) await loadRuns(schedule.id)
  }

  async function toggleEnabled(schedule: ReportSchedule, enabled: boolean) {
    const res = await fetch(`/api/admin/reports/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...schedule, enabled }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const message = body.error || "Could not update schedule"
      setError(message)
      showAdminToast(scheduleToggleToast(false, enabled, message))
      return
    }
    showAdminToast(scheduleToggleToast(true, enabled))
    await load()
  }

  const historySchedule = schedules.find((item) => item.id === historyId)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Scheduled reports</h2>
          <p className="text-sm text-muted-foreground">
            Email a CSV, an inline summary, or both. You can also include the table in the email body. Built-in admins only.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          New schedule
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading schedules...</p>
          ) : schedules.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No schedules yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Cadence</TableHead>
                    <TableHead>Range</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Next run</TableHead>
                    <TableHead>On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => {
                    const outside = schedule.recipients.filter((email) => !isTalusRecipient(email))
                    return (
                      <TableRow key={schedule.id}>
                        <TableCell className="font-medium">{schedule.name}</TableCell>
                        <TableCell>{REPORT_KIND_LABELS[schedule.kind]}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {cadenceLabel(schedule)}
                          <div className="text-xs text-muted-foreground">{schedule.timezone}</div>
                        </TableCell>
                        <TableCell>{rangeLabel(schedule)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{schedule.recipients.length} recipient{schedule.recipients.length === 1 ? "" : "s"}</div>
                          {outside.length > 0 && (
                            <Badge variant="outline" className="mt-1 gap-1 border-amber-300 bg-amber-50 text-amber-900">
                              <AlertTriangle className="w-3 h-3" />
                              {outside.length} outside @talusag.com
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {schedule.enabled && schedule.nextRunAt
                            ? formatReportDateTime(schedule.nextRunAt, schedule.timezone)
                            : "Paused"}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={schedule.enabled}
                            onCheckedChange={(checked) => toggleEnabled(schedule, checked)}
                            disabled={Boolean(previewSchedules)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Send now"
                              onClick={() => sendNow(schedule)}
                              disabled={sendingId === schedule.id || Boolean(previewSchedules)}
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Run history" onClick={() => loadRuns(schedule.id)}>
                              <History className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Edit"
                              onClick={() => {
                                setEditing(schedule)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Delete"
                              onClick={() => remove(schedule)}
                              disabled={Boolean(previewSchedules)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {historyId && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Run history</CardTitle>
            <CardDescription>{historySchedule?.name || "Schedule"}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {runs.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground text-sm">No runs yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatReportDateTime(run.startedAt, historySchedule?.timezone)}
                      </TableCell>
                      <TableCell className="capitalize">{run.trigger}</TableCell>
                      <TableCell className="capitalize">{run.status}</TableCell>
                      <TableCell>{run.rowCount ?? "-"}</TableCell>
                      <TableCell className="text-xs">
                        {formatReportDateTime(run.periodStart, historySchedule?.timezone)}
                      </TableCell>
                      <TableCell className="text-xs text-destructive">{run.error || ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit schedule" : "New schedule"}</DialogTitle>
            <DialogDescription>
              Reports include personal data. A warning appears if a recipient is not @talusag.com.
            </DialogDescription>
          </DialogHeader>
          <ScheduleForm
            initial={editing}
            locations={locations}
            visitorTypes={visitorTypes}
            timezones={locations.map((loc) => (loc as FilterOption & { timezone?: string }).timezone).filter(Boolean) as string[]}
            submitting={submitting}
            onSubmit={save}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
