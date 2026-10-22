import { dashboardPeriodLabel, DEFAULT_REPORT_TIMEZONE, resolveOnDemandWindow } from "./period.ts"
import { parseUuidList } from "./schedule.ts"
import {
  invalidRecipientTokens,
  isReportFormat,
  isReportKind,
  parseRecipientList,
  REPORT_KIND_LABELS,
  type ReportFormat,
  type ReportKind,
} from "./types.ts"

export interface AdhocSendInput {
  kind: ReportKind
  locationIds: string[]
  visitorTypeIds: string[]
  period: string
  customStart: string | null
  customEnd: string | null
  timezone: string
  recipients: string[]
  format: ReportFormat
}

function isLikelyTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function parseAdhocSendBody(
  body: Record<string, unknown>,
): { ok: true; value: AdhocSendInput } | { ok: false; error: string } {
  const kindRaw = typeof body.kind === "string" ? body.kind : ""
  if (!isReportKind(kindRaw)) return { ok: false, error: "Choose visitor sign-ins, employee sign-ins, or training completions" }

  const formatRaw = typeof body.format === "string" ? body.format : "both"
  if (!isReportFormat(formatRaw)) return { ok: false, error: "Choose CSV attachment, inline summary, or both" }

  const period = typeof body.period === "string" && body.period.trim() ? body.period.trim() : "7"
  const customStart = typeof body.customStart === "string" ? body.customStart.trim() : typeof body.custom_start === "string" ? body.custom_start.trim() : ""
  const customEnd = typeof body.customEnd === "string" ? body.customEnd.trim() : typeof body.custom_end === "string" ? body.custom_end.trim() : ""

  if (period === "custom") {
    if (!customStart || !customEnd) return { ok: false, error: "Choose a start date and an end date" }
    if (customStart > customEnd) return { ok: false, error: "Start date must be on or before the end date" }
  }

  const timezoneRaw = typeof body.timezone === "string" ? body.timezone.trim() : ""
  const timezone = timezoneRaw || DEFAULT_REPORT_TIMEZONE
  if (!isLikelyTimezone(timezone)) return { ok: false, error: "Choose a valid timezone" }

  const rawRecipients = (body.recipients as string | string[]) || (typeof body.recipientText === "string" ? body.recipientText : "")
  const invalid = invalidRecipientTokens(rawRecipients)
  if (invalid.length > 0) {
    return { ok: false, error: `These addresses are not valid: ${invalid.slice(0, 5).join(", ")}` }
  }
  const recipients = parseRecipientList(rawRecipients)
  if (recipients.length === 0) return { ok: false, error: "Add at least one recipient email" }
  if (recipients.length > 25) return { ok: false, error: "Use 25 recipients or fewer" }

  return {
    ok: true,
    value: {
      kind: kindRaw,
      locationIds: parseUuidList(body.locationIds ?? body.locations ?? body.location_ids),
      visitorTypeIds: parseUuidList(body.visitorTypeIds ?? body.visitorTypes ?? body.visitor_type_ids),
      period,
      customStart: customStart || null,
      customEnd: customEnd || null,
      timezone,
      recipients,
      format: formatRaw,
    },
  }
}

export function adhocPeriodLabel(input: Pick<AdhocSendInput, "period" | "customStart" | "customEnd">): string {
  return dashboardPeriodLabel(input.period, input.customStart, input.customEnd)
}

export function adhocScheduleName(kind: ReportKind): string {
  return `Ad-hoc ${REPORT_KIND_LABELS[kind].toLowerCase()}`
}

export function adhocWindow(input: AdhocSendInput, now = new Date()) {
  return resolveOnDemandWindow({
    period: input.period,
    timezone: input.timezone,
    customStart: input.customStart,
    customEnd: input.customEnd,
    now,
  })
}
