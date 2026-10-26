"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { showAdminToast } from "@/hooks/admin-notify"
import { dashboardPeriodLabel } from "@/lib/reports/period"
import { adhocSendToast } from "@/lib/reports/action-toasts"
import {
  DURATION_UNIT_LABELS,
  FORMAT_LABELS,
  REPORT_KIND_LABELS,
  invalidRecipientTokens,
  isTalusRecipient,
  parseRecipientList,
  type DurationUnit,
  type ReportFormat,
  type ReportKind,
} from "@/lib/reports/types"

export function SendReportDialog({
  open,
  onOpenChange,
  kind,
  period,
  customStart,
  customEnd,
  timezone,
  locationIds,
  visitorTypeIds,
  previewRecipients,
  previewInline = false,
  durationUnit: initialDurationUnit = "minutes",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: ReportKind
  period: string
  customStart?: string
  customEnd?: string
  timezone: string
  locationIds: string[]
  visitorTypeIds: string[]
  previewRecipients?: string
  previewInline?: boolean
  durationUnit?: DurationUnit
}) {
  const [recipientText, setRecipientText] = useState(previewRecipients || "")
  const [format, setFormat] = useState<ReportFormat>("both")
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(initialDurationUnit)
  const [includeTable, setIncludeTable] = useState(false)
  const [sending, setSending] = useState(false)

  const recipients = useMemo(() => parseRecipientList(recipientText), [recipientText])
  const invalid = useMemo(() => invalidRecipientTokens(recipientText), [recipientText])
  const outside = recipients.filter((email) => !isTalusRecipient(email))
  const periodLabel = dashboardPeriodLabel(period, customStart, customEnd)
  const canSend = recipients.length > 0 && invalid.length === 0 && !sending

  async function send() {
    if (!canSend) return
    setSending(true)
    try {
      const res = await fetch("/api/admin/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          format,
          period,
          customStart: customStart || null,
          customEnd: customEnd || null,
          timezone,
          locationIds,
          visitorTypeIds: kind === "employees" ? [] : visitorTypeIds,
          recipients,
          durationUnit,
          includeTable,
        }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string; rowCount?: number; recipientCount?: number } | null
      if (!res.ok) {
        showAdminToast(adhocSendToast(false, body, kind, recipients.length))
        return
      }
      showAdminToast(adhocSendToast(true, body, kind, recipients.length))
      onOpenChange(false)
      setRecipientText("")
    } catch {
      showAdminToast(adhocSendToast(false, null, kind, recipients.length, true))
    } finally {
      setSending(false)
    }
  }

  const fields = (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="adhoc-recipients">Recipients</Label>
          <Textarea
            id="adhoc-recipients"
            value={recipientText}
            onChange={(event) => setRecipientText(event.target.value)}
            placeholder="caleb@talusag.com, operations@talusag.com"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">Any email. Separate with commas. @talusag.com is most common.</p>
          {invalid.length > 0 && (
            <p className="text-sm text-destructive">These addresses are not valid: {invalid.join(", ")}</p>
          )}
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
        <div className="space-y-2">
          <Label>Attachment</Label>
          <Select value={format} onValueChange={(value) => setFormat(value as ReportFormat)}>
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
        <div className="flex items-start gap-2 rounded-md border p-3">
          <Checkbox
            id="adhoc-include-table"
            checked={includeTable}
            onCheckedChange={(checked) => setIncludeTable(checked === true)}
          />
          <div className="space-y-1">
            <Label htmlFor="adhoc-include-table" className="font-medium">
              Include table in email body
            </Label>
            <p className="text-xs text-muted-foreground">
              Adds the same columns as the CSV to the email. Large reports show as many rows as fit and keep the full CSV attached.
            </p>
          </div>
        </div>
        {(kind === "visitors" || kind === "employees") && (
          <div className="space-y-2">
            <Label>Duration unit</Label>
            <Select value={durationUnit} onValueChange={(value) => setDurationUnit(value as DurationUnit)}>
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
          </div>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" onClick={send} disabled={!canSend}>
          <Send className="w-4 h-4 mr-2" />
          {sending ? "Sending..." : "Send now"}
        </Button>
      </div>
    </>
  )

  if (previewInline) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 rounded-lg border bg-background p-6 shadow-lg">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Send report</h2>
          <p className="text-sm text-muted-foreground">
            Email {REPORT_KIND_LABELS[kind].toLowerCase()} for {periodLabel} once. This does not create a schedule.
          </p>
        </div>
        {fields}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send report</DialogTitle>
          <DialogDescription>
            Email {REPORT_KIND_LABELS[kind].toLowerCase()} for {periodLabel} once. This does not create a schedule.
          </DialogDescription>
        </DialogHeader>
        {fields}
      </DialogContent>
    </Dialog>
  )
}

export function SendReportButton({
  kind,
  period,
  customStart,
  customEnd,
  timezone,
  locationIds,
  visitorTypeIds,
  durationUnit,
}: {
  kind: ReportKind
  period: string
  customStart?: string
  customEnd?: string
  timezone: string
  locationIds: string[]
  visitorTypeIds: string[]
  durationUnit?: DurationUnit
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="w-4 h-4 mr-2" />
        Send report
      </Button>
      <SendReportDialog
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        period={period}
        customStart={customStart}
        customEnd={customEnd}
        timezone={timezone}
        locationIds={locationIds}
        visitorTypeIds={visitorTypeIds}
        durationUnit={durationUnit}
      />
    </>
  )
}
