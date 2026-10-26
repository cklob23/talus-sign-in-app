import Link from "next/link"
import { formatEmailPeriod } from "@/lib/reports/email"
import { REPORT_VIEW_MAX_ROWS } from "@/lib/reports/period"
import { loadReportRows } from "@/lib/reports/query"
import { csvRowsForKind, locationNamesForIds } from "@/lib/reports/run"
import { formatEmailTableDate } from "@/lib/reports/table"
import { DURATION_UNIT_LABELS, REPORT_KIND_LABELS } from "@/lib/reports/types"
import { parseReportViewSearch } from "@/lib/reports/view-url"
import { createAdminClient } from "@/lib/supabase/server"

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function displayCell(header: string, value: string): string {
  if (/^(Sign in|Sign out|Completed|Expires)$/i.test(header)) {
    return formatEmailTableDate(value) || value
  }
  return value
}

export default async function ReportViewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const filters = parseReportViewSearch(
    Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, firstString(value)])),
  )

  if (!filters) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <h1 className="text-2xl font-bold">Report table</h1>
        <p className="text-sm text-muted-foreground">
          This report link is missing or invalid. Open Reports to run a new export.
        </p>
        <Link href="/admin/reports" className="text-sm font-medium text-primary underline underline-offset-4">
          Back to Reports
        </Link>
      </div>
    )
  }

  const admin = createAdminClient()
  let names: string[] = []
  let headers: string[] = []
  let rows: string[][] = []
  let truncated = false
  let error = ""

  try {
    names = await locationNamesForIds(admin, filters.locationIds)
    const loaded = await loadReportRows(
      admin,
      {
        kind: filters.kind,
        locationIds: filters.locationIds,
        visitorTypeIds: filters.kind === "employees" ? [] : filters.visitorTypeIds,
        from: filters.from,
        to: filters.to,
      },
      REPORT_VIEW_MAX_ROWS,
    )
    truncated = loaded.truncated
    const csvRows = csvRowsForKind(loaded.kind, loaded.rows, Date.now(), filters.durationUnit)
    headers = (csvRows[0] || []).map((cell) => String(cell ?? ""))
    rows = csvRows.slice(1).map((row) => row.map((cell) => String(cell ?? "")))
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load this report"
  }

  const title = filters.name || REPORT_KIND_LABELS[filters.kind]
  const period = formatEmailPeriod({
    periodStart: filters.from,
    periodEnd: filters.to,
    timezone: filters.timezone,
  })
  const sites = names.length ? names.join(", ") : filters.locationIds.length ? "Selected sites" : "All sites"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Read-only report</p>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {REPORT_KIND_LABELS[filters.kind]} · {period} · {sites}
            {filters.kind !== "training" ? ` · ${DURATION_UNIT_LABELS[filters.durationUnit]}` : ""}
          </p>
        </div>
        <Link href="/admin/reports" className="text-sm font-medium text-primary underline underline-offset-4">
          Back to Reports
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rows matched this period.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}
            {truncated ? ` (capped at ${REPORT_VIEW_MAX_ROWS.toLocaleString()})` : ""}. Scroll sideways for every
            column.
          </p>
          <div className="overflow-x-auto rounded-lg border bg-background">
            <table className="min-w-[960px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  {headers.map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row[0]}-${index}`} className="border-b last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td key={`${headers[cellIndex] || cellIndex}-${index}`} className="whitespace-nowrap px-3 py-2 align-top">
                        {displayCell(headers[cellIndex] || "", cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
