import { sendEmail } from "@/lib/email"
import { csvFilename, csvWithBom } from "./csv.ts"
import { renderReportEmail } from "./email.ts"
import {
  buildEmployeeCsvRows,
  buildTrainingCsvRows,
  buildVisitorCsvRows,
  type EmployeeSignInSource,
  type TrainingCompletionSource,
  type VisitorSignInSource,
} from "./rows.ts"
import { loadReportRows } from "./query.ts"
import type { ReportFormat, ReportKind, ReportQuery } from "./types.ts"

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
}

export function csvRowsForKind(
  kind: ReportKind,
  rows: VisitorSignInSource[] | EmployeeSignInSource[] | TrainingCompletionSource[],
  nowMs = Date.now(),
) {
  if (kind === "employees") return buildEmployeeCsvRows(rows as EmployeeSignInSource[])
  if (kind === "training") return buildTrainingCsvRows(rows as TrainingCompletionSource[], nowMs)
  return buildVisitorCsvRows(rows as VisitorSignInSource[])
}

export async function buildReport(admin: AnyClient, filter: ReportQuery, nowMs = Date.now()): Promise<BuiltReport> {
  const loaded = await loadReportRows(admin, filter)
  const csvRows = csvRowsForKind(loaded.kind, loaded.rows, nowMs)
  return {
    kind: loaded.kind,
    rows: loaded.rows,
    csvRows,
    csv: csvWithBom(csvRows),
    filename: csvFilename(loaded.kind, filter.from, filter.to),
    rowCount: loaded.rows.length,
  }
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
}): Promise<{ sent: boolean; reason?: string }> {
  const attachCsv = (args.format === "csv" || args.format === "both") && args.report.rowCount > 0
  const names = await locationNamesForIds(args.admin, args.locationIds)
  const logoUrl = await loadCompanyLogo(args.admin)
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
