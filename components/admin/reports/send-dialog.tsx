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
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { dashboardPeriodLabel } from "@/lib/reports/period"
import {
  FORMAT_LABELS,
  REPORT_KIND_LABELS,
  invalidRecipientTokens,
  isTalusRecipient,
  parseRecipientList,
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
}) {
  const [recipientText, setRecipientText] = useState(previewRecipients || "")
  const [format, setFormat] = useState<ReportFormat>("both")
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
        }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string; rowCount?: number; recipientCount?: number } | null
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not send report",
          description: body?.error || "Try again in a moment.",
        })
        return
      }
      toast({
        title: "Report sent",
        description: `Sent ${REPORT_KIND_LABELS[kind].toLowerCase()} to ${body?.recipientCount ?? recipients.length} recipients (${body?.rowCount ?? 0} rows).`,
      })
      onOpenChange(false)
      setRecipientText("")
    } catch {
      toast({
        variant: "destructive",
        title: "Could not send report",
        description: "The request did not complete.",
      })
    } finally {
      setSending(false)
    }
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
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={send} disabled={!canSend}>
            <Send className="w-4 h-4 mr-2" />
            {sending ? "Sending..." : "Send now"}
          </Button>
        </DialogFooter>
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
}: {
  kind: ReportKind
  period: string
  customStart?: string
  customEnd?: string
  timezone: string
  locationIds: string[]
  visitorTypeIds: string[]
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
      />
    </>
  )
}
