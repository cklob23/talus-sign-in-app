import { REPORT_EXPORT_MAX_ROWS, REPORT_VIEW_MAX_ROWS } from "@/lib/reports/period"

export function ReportRowCapNotice({
  truncated,
  loaded,
  tableLimit,
}: {
  truncated: boolean
  loaded: number
  tableLimit?: number
}) {
  if (!truncated && !tableLimit) return null
  if (!truncated && tableLimit && loaded <= tableLimit) return null

  const parts: string[] = []
  if (tableLimit && loaded > tableLimit) {
    parts.push(`Showing ${tableLimit.toLocaleString()} of ${loaded.toLocaleString()} rows on this page.`)
  }
  if (truncated) {
    parts.push(
      `On-screen results stop at ${REPORT_VIEW_MAX_ROWS.toLocaleString()} rows. CSV export and email include up to ${REPORT_EXPORT_MAX_ROWS.toLocaleString()}.`,
    )
  }
  if (parts.length === 0) return null
  return <p className="text-xs text-muted-foreground">{parts.join(" ")}</p>
}
