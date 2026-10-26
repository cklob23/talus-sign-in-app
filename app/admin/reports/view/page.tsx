import Link from "next/link"
import { redirect } from "next/navigation"
import { loadPortalUser } from "@/lib/admin-auth"
import { formatEmailPeriod } from "@/lib/reports/email"
import { REPORT_VIEW_MAX_RANGE_DAYS, REPORT_VIEW_MAX_ROWS } from "@/lib/reports/period"
import { loadReportRows } from "@/lib/reports/query"
import { csvRowsForKind, locationNamesForIds } from "@/lib/reports/run"
import { formatEmailTableDate } from "@/lib/reports/table"
import { DURATION_UNIT_LABELS, REPORT_KIND_LABELS } from "@/lib/reports/types"
import { authorizeReportView, loadReportViewIfAuthorized } from "@/lib/reports/view-access"
import { clampReportViewRange, parseReportViewSearch, REPORT_VIEW_PATH } from "@/lib/reports/view-url"
import { adminPageLoginRedirect } from "@/lib/safe-redirect"
import { createAdminClient } from "@/lib/supabase/server"

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function displayCell(header: string, value: string): string {
  if (/^Sign out$/i.test(header) && !value.trim()) return "Still on site"
  if (/^(Sign in|Sign out|Completed|Expires)$/i.test(header)) {
    return formatEmailTableDate(value) || value
  }
  return value
}

function searchFromRaw(raw: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    const text = firstString(value)
    if (text) params.set(key, text)
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ""
}

export default async function ReportViewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const portal = await loadPortalUser()
  const allowed = authorizeReportView(portal)
  if (!allowed.ok) {
    if (allowed.status === 401) {
      redirect(adminPageLoginRedirect(401, REPORT_VIEW_PATH, searchFromRaw(raw)))
    }
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <h1 className="text-2xl font-bold">Not authorized</h1>
        <p className="text-sm text-muted-foreground">
          You need a built-in admin account to open this report table.
        </p>
        <Link href="/admin" className="text-sm font-medium text-primary underline underline-offset-4">
          Back to dashboard
        </Link>
      </div>
    )
  }

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

  const range = clampReportViewRange(filters.from, filters.to)
  let names: string[] = []
  let headers: string[] = []
  let rows: string[][] = []
  let truncated = false
  let loadFailed = false

  const loaded = await loadReportViewIfAuthorized(portal, async () => {
    try {
      const admin = createAdminClient()
      const siteNames = await locationNamesForIds(admin, filters.locationIds)
      const report = await loadReportRows(
        admin,
        {
          kind: filters.kind,
          locationIds: filters.locationIds,
          visitorTypeIds: filters.kind === "employees" ? [] : filters.visitorTypeIds,
          from: range.from,
          to: range.to,
        },
        REPORT_VIEW_MAX_ROWS,
      )
      return { siteNames, report }
    } catch {
      return { siteNames: [] as string[], report: null }
    }
  })

  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <h1 className="text-2xl font-bold">Not authorized</h1>
        <p className="text-sm text-muted-foreground">
          You need a built-in admin account to open this report table.
        </p>
      </div>
    )
  }

  if (!loaded.data.report) {
    loadFailed = true
  } else {
    names = loaded.data.siteNames
    truncated = loaded.data.report.truncated
    const csvRows = csvRowsForKind(loaded.data.report.kind, loaded.data.report.rows, Date.now(), filters.durationUnit)
    headers = (csvRows[0] || []).map((cell) => String(cell ?? ""))
    rows = csvRows.slice(1).map((row) => row.map((cell) => String(cell ?? "")))
  }

  const title = filters.name || REPORT_KIND_LABELS[filters.kind]
  const period = formatEmailPeriod({
    periodStart: range.from,
    periodEnd: range.to,
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

      {range.clamped ? (
        <p className="text-sm text-muted-foreground">
          This page shows at most {REPORT_VIEW_MAX_RANGE_DAYS} days ending at the report&apos;s end date. Use the CSV
          for the full period.
        </p>
      ) : null}

      {loadFailed ? (
        <p className="text-sm text-destructive">This report could not be loaded. Try again or export a CSV from Reports.</p>
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
