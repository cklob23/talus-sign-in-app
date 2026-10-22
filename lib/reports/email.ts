import { escapeHtml, sanitizePlainText } from "@/lib/html-escape"
import { detailRow, detailsPanel, emailShell, headingBlock, pill } from "@/lib/email-shell"
import { formatReportDateTime } from "./rows.ts"
import {
  FORMAT_LABELS,
  REPORT_KIND_LABELS,
  type ReportFormat,
  type ReportKind,
} from "./types.ts"

export interface ReportEmailArgs {
  scheduleName: string
  kind: ReportKind
  periodStart: string
  periodEnd: string
  timezone: string
  locationNames: string[]
  rowCount: number
  format: ReportFormat
  csvAttached: boolean
  logoUrl?: string | null
  extraLines?: Array<{ label: string; value: string }>
}

export function reportEmailSubject(args: Pick<ReportEmailArgs, "kind" | "scheduleName" | "periodStart" | "periodEnd" | "timezone">): string {
  const kind = REPORT_KIND_LABELS[args.kind]
  const start = formatReportDateTime(args.periodStart, args.timezone)
  return `${args.scheduleName}: ${kind} (${start})`
}

export function renderReportEmail(args: ReportEmailArgs): { subject: string; html: string; text: string; preheader: string } {
  const name = sanitizePlainText(args.scheduleName, 120) || "Scheduled report"
  const kind = REPORT_KIND_LABELS[args.kind]
  const sites = args.locationNames.length ? args.locationNames.join(", ") : "All sites"
  const start = formatReportDateTime(args.periodStart, args.timezone)
  const end = formatReportDateTime(args.periodEnd, args.timezone)
  const subject = `${name}: ${kind}`
  const preheader = `${args.rowCount} rows. ${sites}. ${start}.`
  const attachLine = args.csvAttached
    ? "The CSV is attached."
    : args.format === "summary"
      ? "This email is a summary only. No spreadsheet is attached."
      : "No rows matched this period, so no spreadsheet is attached."

  const rows = [
    detailRow("Report", name),
    detailRow("Kind", kind),
    detailRow("Period", `${start} to ${end}`),
    detailRow("Sites", sites),
    detailRow("Rows", String(args.rowCount)),
    detailRow("Format", FORMAT_LABELS[args.format]),
    ...(args.extraLines || []).map((line) => detailRow(line.label, line.value)),
  ].join("")

  const html = emailShell({
    lang: "en",
    preheader,
    logoUrl: args.logoUrl || "",
    bodyHtml: `${pill("Scheduled report")}
${headingBlock(name, `${escapeHtml(kind)} for <b class="t" style="color:#0f1a13;">${escapeHtml(sites)}</b>.`)}
${detailsPanel(rows)}
<tr><td class="px m" style="padding:16px 36px 24px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">${escapeHtml(attachLine)} This report includes personal data. Keep it inside Talus Ag unless you meant to send it elsewhere.</td></tr>`,
  })

  const text = [
    name,
    "",
    `Kind: ${kind}`,
    `Period: ${start} to ${end}`,
    `Sites: ${sites}`,
    `Rows: ${args.rowCount}`,
    `Format: ${FORMAT_LABELS[args.format]}`,
    "",
    attachLine,
    "This report includes personal data. Keep it inside Talus Ag unless you meant to send it elsewhere.",
  ].join("\n")

  return { subject, html, text, preheader }
}
