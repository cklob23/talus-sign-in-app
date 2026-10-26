import { escapeHtml, sanitizePlainText } from "@/lib/html-escape"

export const REPORT_EMAIL_TABLE_MAX_ROWS = 200

export const REPORT_EMAIL_TABLE_EMPTY = "No rows matched this period."

export function reportEmailTableCapNote(shown: number, total: number, csvAttached = true): string {
  if (csvAttached) {
    return `Showing first ${shown} of ${total} rows, full data in attached CSV`
  }
  return `Showing first ${shown} of ${total} rows`
}

function cellText(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ""
  return String(value)
}

const CELL =
  "padding:6px 8px;border:1px solid #dce6df;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:16px;color:#0f1a13;word-break:break-word;"
const HEAD =
  "padding:6px 8px;border:1px solid #dce6df;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:16px;color:#0f1a13;font-weight:700;background:#f5f8f6;text-align:left;"

export function renderReportTable(args: {
  csvRows: Array<Array<string | number | boolean | null | undefined>>
  csvAttached?: boolean
  maxRows?: number
}): { html: string; text: string; shown: number; total: number; capped: boolean } {
  const maxRows = args.maxRows ?? REPORT_EMAIL_TABLE_MAX_ROWS
  const csvAttached = args.csvAttached !== false
  const headers = args.csvRows[0] || []
  const data = args.csvRows.slice(1)
  const total = data.length

  if (total === 0) {
    return {
      html: `<p class="m" style="margin:0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#55625a;">${escapeHtml(REPORT_EMAIL_TABLE_EMPTY)}</p>`,
      text: REPORT_EMAIL_TABLE_EMPTY,
      shown: 0,
      total: 0,
      capped: false,
    }
  }

  const shown = Math.min(total, Math.max(0, maxRows))
  const capped = total > shown
  const visible = data.slice(0, shown)
  const note = capped ? reportEmailTableCapNote(shown, total, csvAttached) : ""

  const headCells = headers
    .map((header) => `<th style="${HEAD}">${escapeHtml(cellText(header))}</th>`)
    .join("")
  const bodyRows = visible
    .map((row) => {
      const cells = headers
        .map((_, index) => `<td style="${CELL}">${escapeHtml(cellText(row[index]))}</td>`)
        .join("")
      return `<tr>${cells}</tr>`
    })
    .join("")

  const noteHtml = note
    ? `<p class="m" style="margin:0 0 8px 0;font-family:Geist,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#55625a;">${escapeHtml(note)}</p>`
    : ""

  const html = `${noteHtml}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #dce6df;">
<thead><tr>${headCells}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>`

  const textLines = [
    note || "Report table",
    headers.map((header) => sanitizePlainText(cellText(header), 80)).join(" | "),
    ...visible.map((row) =>
      headers.map((_, index) => sanitizePlainText(cellText(row[index]), 120)).join(" | "),
    ),
  ]

  return { html, text: textLines.join("\n"), shown, total, capped }
}
