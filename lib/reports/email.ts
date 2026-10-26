import { escapeHtml, sanitizePlainText } from "@/lib/html-escape"
import { detailRow, detailsPanel, emailShell, headingBlock, pill } from "@/lib/email-shell"
import { isAllTimeStart } from "./period.ts"
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
  badge?: string
  periodLabel?: string
  truncated?: boolean
  tableHtml?: string
  tableText?: string
}

export function formatEmailPeriod(args: Pick<ReportEmailArgs, "periodStart" | "periodEnd" | "timezone" | "periodLabel">): string {
  if (args.periodLabel?.trim()) return args.periodLabel.trim()
  const end = formatReportDateTime(args.periodEnd, args.timezone)
  if (isAllTimeStart(args.periodStart)) return `All time through ${end}`
  return `${formatReportDateTime(args.periodStart, args.timezone)} to ${end}`
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
  const period = formatEmailPeriod(args)
  const subject = `${name}: ${kind}`
  const preheader = `${args.rowCount} rows. ${sites}. ${period}.`
  const attachLine = args.csvAttached
    ? "The CSV is attached."
    : args.format === "summary"
      ? "This email is a summary only. No spreadsheet is attached."
      : "No rows matched this period, so no spreadsheet is attached."
  const tableLine = args.tableHtml ? " The report table is included below." : ""
  const capLine = args.truncated
    ? " This file is capped at 50,000 rows."
    : ""

  const rows = [
    detailRow("Report", name),
    detailRow("Kind", kind),
    detailRow("Period", period),
    detailRow("Sites", sites),
    detailRow("Rows", String(args.rowCount)),
    detailRow("Format", FORMAT_LABELS[args.format]),
    ...(args.extraLines || []).map((line) => detailRow(line.label, line.value)),
  ].join("")

  const tableBlock = args.tableHtml
    ? `<tr><td class="px" style="padding:8px 36px 8px 36px;">${args.tableHtml}</td></tr>`
    : ""

  const html = emailShell({
    lang: "en",
    preheader,
    logoUrl: args.logoUrl || "",
    bodyHtml: `${pill(args.badge || "Scheduled report")}
${headingBlock(name, `${escapeHtml(kind)} for <b class="t" style="color:#0f1a13;">${escapeHtml(sites)}</b>.`)}
${detailsPanel(rows)}
${tableBlock}
<tr><td class="px m" style="padding:16px 36px 24px 36px;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">${escapeHtml(attachLine)}${escapeHtml(tableLine)}${escapeHtml(capLine)} This report includes personal data. Keep it inside Talus Ag unless you meant to send it elsewhere.</td></tr>`,
  })

  const text = [
    name,
    "",
    `Kind: ${kind}`,
    `Period: ${period}`,
    `Sites: ${sites}`,
    `Rows: ${args.rowCount}`,
    `Format: ${FORMAT_LABELS[args.format]}`,
    "",
    `${attachLine}${tableLine}${capLine}`,
    ...(args.tableText ? ["", args.tableText] : []),
    "",
    "This report includes personal data. Keep it inside Talus Ag unless you meant to send it elsewhere.",
  ].join("\n")

  return { subject, html, text, preheader }
}
