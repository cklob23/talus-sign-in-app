import { sendEmail } from "@/lib/email"
import { resolveAppOrigin } from "@/lib/nda"
import { csvFilename, csvWithBom, toCsv } from "./csv.ts"
import { renderReportEmail } from "./email.ts"
import { emailTableSummaryLine, renderReportTable } from "./table.ts"
import { buildReportViewUrl } from "./view-url.ts"
import {
  buildEmployeeCsvRows,
  buildTrainingCsvRows,
  buildVisitorCsvRows,
  type EmployeeSignInSource,
  type TrainingCompletionSource,
  type VisitorSignInSource,
} from "./rows.ts"
import { loadReportRows } from "./query.ts"
import { DURATION_UNIT_LABELS, type DurationUnit, type ReportFormat, type ReportKind, type ReportQuery } from "./types.ts"

type AnyClient = {
  from: (table: string) => any
}

export interface BuiltReport {
  kind: ReportKind
  rows: unknown[]
  csvRows: Array<Array<string | number | boolean | null | undefined>>
  csv: string
  filename: string
  rowCount: number
  truncated: boolean
}

export function csvRowsForKind(
  kind: ReportKind,
  rows: VisitorSignInSource[] | EmployeeSignInSource[] | TrainingCompletionSource[],
  nowMs = Date.now(),
  durationUnit: DurationUnit = "minutes",
) {
  if (kind === "employees") return buildEmployeeCsvRows(rows as EmployeeSignInSource[], durationUnit)
  if (kind === "training") return buildTrainingCsvRows(rows as TrainingCompletionSource[], nowMs)
  return buildVisitorCsvRows(rows as VisitorSignInSource[], durationUnit)
}

export async function buildReport(
  admin: AnyClient,
  filter: ReportQuery,
  nowMs = Date.now(),
  durationUnit: DurationUnit = "minutes",
): Promise<BuiltReport> {
  const loaded = await loadReportRows(admin, filter)
  const csvRows = csvRowsForKind(loaded.kind, loaded.rows, nowMs, durationUnit)
  return {
    kind: loaded.kind,
    rows: loaded.rows,
    csvRows,
    csv: csvWithBom(csvRows),
    filename: csvFilename(loaded.kind, filter.from, filter.to),
    rowCount: loaded.rows.length,
    truncated: loaded.truncated,
  }
}

export function reportCsvChunks(csvRows: Array<Array<string | number | boolean | null | undefined>>, chunkSize = 500): string[] {
  if (csvRows.length === 0) return ["\uFEFF\n"]
  const chunks: string[] = [`\uFEFF${toCsv([csvRows[0]])}\n`]
  for (let i = 1; i < csvRows.length; i += chunkSize) {
    chunks.push(`${toCsv(csvRows.slice(i, i + chunkSize))}\n`)
  }
  return chunks
}

export async function locationNamesForIds(admin: AnyClient, locationIds: string[]): Promise<string[]> {
  if (locationIds.length === 0) return []
  const { data } = await admin.from("locations").select("id, name").in("id", locationIds)
  if (!Array.isArray(data)) return []
  return data.map((row: { name?: string }) => row.name).filter(Boolean) as string[]
}

export async function loadCompanyLogo(admin: AnyClient): Promise<string> {
  const { data } = await admin.from("settings").select("key, value").is("location_id", null).eq("key", "company_logo").maybeSingle()
  return data?.value ? String(data.value) : ""
}

export async function sendBuiltReport(args: {
  admin: AnyClient
  scheduleName: string
  kind: ReportKind
  format: ReportFormat
  recipients: string[]
  periodStart: string
  periodEnd: string
  timezone: string
  locationIds: string[]
  report: BuiltReport
  badge?: string
  periodLabel?: string
  extraLines?: Array<{ label: string; value: string }>
  durationUnit?: DurationUnit
  includeTable?: boolean
  visitorTypeIds?: string[]
  origin?: string
}): Promise<{ sent: boolean; reason?: string }> {
  const attachCsv = (args.format === "csv" || args.format === "both") && args.report.rowCount > 0
  const names = await locationNamesForIds(args.admin, args.locationIds)
  const logoUrl = await loadCompanyLogo(args.admin)
  const table = args.includeTable
    ? renderReportTable({ csvRows: args.report.csvRows, csvAttached: attachCsv })
    : null
  const tableHtml = table?.html?.trim() ? table.html : undefined
  const tableText = tableHtml ? table?.text : undefined
  const tableSummary = emailTableSummaryLine(tableHtml ? table : null)
  const origin = (args.origin || resolveAppOrigin()).replace(/\/+$/, "")
  const viewUrl =
    tableHtml && origin
      ? buildReportViewUrl(origin, {
          kind: args.kind,
          from: args.periodStart,
          to: args.periodEnd,
          locationIds: args.locationIds,
          visitorTypeIds: args.visitorTypeIds,
          durationUnit: args.durationUnit || "minutes",
          timezone: args.timezone,
          name: args.scheduleName,
        })
      : ""
  const mail = renderReportEmail({
    scheduleName: args.scheduleName,
    kind: args.kind,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    timezone: args.timezone,
    locationNames: names,
    rowCount: args.report.rowCount,
    format: args.format,
    csvAttached: attachCsv,
    logoUrl,
    badge: args.badge,
    periodLabel: args.periodLabel,
    extraLines: [
      ...(args.kind === "visitors" || args.kind === "employees"
        ? [{ label: "Duration unit", value: DURATION_UNIT_LABELS[args.durationUnit || "minutes"] }]
        : []),
      ...(tableSummary ? [tableSummary] : []),
      ...(args.extraLines || []),
    ],
    truncated: args.report.truncated,
    tableHtml,
    tableText,
    viewUrl: viewUrl || undefined,
  })

  return sendEmail({
    to: args.recipients,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: attachCsv
      ? [
          {
            filename: args.report.filename,
            content: Buffer.from(args.report.csv, "utf8"),
            contentType: "text/csv; charset=utf-8",
          },
        ]
      : undefined,
  })
}
