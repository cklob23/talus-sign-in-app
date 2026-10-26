"use client"

import { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import type { FilterOption } from "./filter-bar"
import { COMMON_REPORT_TIMEZONES } from "@/lib/reports/schedule"
import {
  DURATION_UNIT_LABELS,
  FORMAT_LABELS,
  FREQUENCY_LABELS,
  RANGE_TYPE_LABELS,
  REPORT_KIND_LABELS,
  WEEKDAYS,
  isTalusRecipient,
  parseRecipientList,
  type DurationUnit,
  type ReportFormat,
  type ReportFrequency,
  type ReportKind,
  type RangeType,
  type ReportSchedule,
  type ReportScheduleInput,
} from "@/lib/reports/types"

const emptyForm: ReportScheduleInput = {
  name: "",
  kind: "visitors",
  locationIds: [],
  visitorTypeIds: [],
  rangeType: "previous_day",
  lastNDays: 7,
  frequency: "daily",
  weekday: 1,
  monthDay: 1,
  sendTime: "08:00",
  timezone: "America/Chicago",
  recipients: [],
  format: "csv",
  durationUnit: "minutes",
  includeTable: false,
  enabled: true,
}

function fromSchedule(schedule: ReportSchedule): ReportScheduleInput {
  return {
    name: schedule.name,
    kind: schedule.kind,
    locationIds: schedule.locationIds,
    visitorTypeIds: schedule.visitorTypeIds,
    rangeType: schedule.rangeType,
    lastNDays: schedule.lastNDays || 7,
    frequency: schedule.frequency,
    weekday: schedule.weekday ?? 1,
    monthDay: schedule.monthDay ?? 1,
    sendTime: schedule.sendTime,
    timezone: schedule.timezone,
    recipients: schedule.recipients,
    format: schedule.format,
    durationUnit: schedule.durationUnit || "minutes",
    includeTable: schedule.includeTable === true,
    enabled: schedule.enabled,
  }
}

export function ScheduleForm({
  initial,
  locations,
  visitorTypes,
  timezones,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: ReportSchedule | null
  locations: FilterOption[]
  visitorTypes: FilterOption[]
  timezones?: string[]
  submitting?: boolean
  onSubmit: (value: ReportScheduleInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ReportScheduleInput>(initial ? fromSchedule(initial) : emptyForm)
  const [recipientText, setRecipientText] = useState(initial?.recipients.join(", ") || "")

  const recipients = parseRecipientList(recipientText)
  const outside = recipients.filter((email) => !isTalusRecipient(email))
  const zones = useMemo(() => {
    const extra = timezones || []
    return Array.from(new Set([...COMMON_REPORT_TIMEZONES, ...extra, form.timezone]))
  }, [timezones, form.timezone])

  const typesForSites =
    form.locationIds.length === 0
      ? visitorTypes
      : visitorTypes.filter((type) => {
          const loc = (type as FilterOption & { locationId?: string }).locationId
          return !loc || form.locationIds.includes(loc)
        })

  function toggleList(key: "locationIds" | "visitorTypeIds", id: string, checked: boolean) {
    setForm((prev) => {
      const current = prev[key]
      return {
        ...prev,
        [key]: checked ? [...current, id] : current.filter((item) => item !== id),
      }
    })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({ ...form, recipients })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="report-name">Name</Label>
        <Input
          id="report-name"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Nightly visitor log"
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Kind</Label>
          <Select value={form.kind} onValueChange={(value) => setForm((prev) => ({ ...prev, kind: value as ReportKind }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(REPORT_KIND_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Format</Label>
          <Select value={form.format} onValueChange={(value) => setForm((prev) => ({ ...prev, format: value as ReportFormat }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border p-3">
        <Checkbox
          id="include-table"
          checked={form.includeTable}
          onCheckedChange={(checked) => setForm((prev) => ({ ...prev, includeTable: checked === true }))}
        />
        <div className="space-y-1">
          <Label htmlFor="include-table" className="font-medium">
            Include table in email body
          </Label>
          <p className="text-xs text-muted-foreground">
            Adds the same columns as the CSV to the email. Reports over 40 rows show the first 40 and keep the full CSV attached.
          </p>
        </div>
      </div>

      {(form.kind === "visitors" || form.kind === "employees") && (
        <div className="space-y-2">
          <Label>Duration unit</Label>
          <Select
            value={form.durationUnit}
            onValueChange={(value) => setForm((prev) => ({ ...prev, durationUnit: value as DurationUnit }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DURATION_UNIT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">How on-site time is shown in the CSV, email table, and summary.</p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Sites</Label>
        <p className="text-xs text-muted-foreground">Leave empty to include every site.</p>
        <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-2">
          {locations.map((loc) => (
            <Label key={loc.id} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={form.locationIds.includes(loc.id)}
                onCheckedChange={(checked) => toggleList("locationIds", loc.id, checked === true)}
              />
              {loc.name}
            </Label>
          ))}
        </div>
      </div>

      {form.kind !== "employees" && (
        <div className="space-y-2">
          <Label>Visitor types</Label>
          <p className="text-xs text-muted-foreground">Leave empty to include every type.</p>
          <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-2">
            {typesForSites.map((type) => (
              <Label key={type.id} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={form.visitorTypeIds.includes(type.id)}
                  onCheckedChange={(checked) => toggleList("visitorTypeIds", type.id, checked === true)}
                />
                {type.name}
              </Label>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Range</Label>
          <Select
            value={form.rangeType}
            onValueChange={(value) => setForm((prev) => ({ ...prev, rangeType: value as RangeType }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RANGE_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.rangeType === "last_n_days" && (
          <div className="space-y-2">
            <Label htmlFor="last-n">Last N days</Label>
            <Input
              id="last-n"
              type="number"
              min={1}
              max={365}
              value={form.lastNDays ?? 7}
              onChange={(event) => setForm((prev) => ({ ...prev, lastNDays: Number(event.target.value) }))}
            />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Frequency</Label>
          <Select
            value={form.frequency}
            onValueChange={(value) => setForm((prev) => ({ ...prev, frequency: value as ReportFrequency }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.frequency === "weekly" && (
          <div className="space-y-2">
            <Label>Weekday</Label>
            <Select
              value={String(form.weekday ?? 1)}
              onValueChange={(value) => setForm((prev) => ({ ...prev, weekday: Number(value) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((day) => (
                  <SelectItem key={day.value} value={String(day.value)}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {form.frequency === "monthly" && (
          <div className="space-y-2">
            <Label htmlFor="month-day">Day of month</Label>
            <Input
              id="month-day"
              type="number"
              min={1}
              max={31}
              value={form.monthDay ?? 1}
              onChange={(event) => setForm((prev) => ({ ...prev, monthDay: Number(event.target.value) }))}
            />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="send-time">Send time</Label>
          <Input
            id="send-time"
            type="time"
            value={form.sendTime}
            onChange={(event) => setForm((prev) => ({ ...prev, sendTime: event.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select value={form.timezone} onValueChange={(value) => setForm((prev) => ({ ...prev, timezone: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {zones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="recipients">Recipients</Label>
        <Textarea
          id="recipients"
          value={recipientText}
          onChange={(event) => setRecipientText(event.target.value)}
          placeholder="caleb@talusag.com, operations@talusag.com"
          rows={3}
        />
        <p className="text-xs text-muted-foreground">Any email. Separate with commas.</p>
        {outside.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {outside.map((email) => (
              <Badge key={email} variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-900">
                <AlertTriangle className="w-3 h-3" />
                {email} is outside @talusag.com
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Enabled</p>
          <p className="text-xs text-muted-foreground">Paused schedules stay in the list and do not send.</p>
        </div>
        <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !form.name.trim() || recipients.length === 0}>
          {initial ? "Save schedule" : "Create schedule"}
        </Button>
      </div>
    </form>
  )
}
