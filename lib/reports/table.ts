import { escapeHtml, sanitizePlainText } from "@/lib/html-escape"

/** Gmail clips around 102 KB. Compact class-styled rows stay under ~80 KB. */
export const REPORT_EMAIL_TABLE_MAX_ROWS = 500
export const REPORT_EMAIL_TABLE_MAX_HTML_BYTES = 80_000

export const REPORT_EMAIL_TABLE_EMPTY = "No rows matched this period."

export function reportEmailTableCapNote(shown: number, total: number, csvAttached = true): string {
  if (csvAttached) {
    return `Showing first ${shown} of ${total} rows (email size limit), full data in attached CSV`
  }
  return `Showing first ${shown} of ${total} rows (email size limit)`
}

export function emailTableSummaryLine(table: {
  html?: string
  shown: number
  total: number
  capped: boolean
} | null): { label: string; value: string } | null {
  if (!table?.html?.trim()) return null
  return {
    label: "Email table",
    value: table.capped ? `First ${table.shown} of ${table.total} rows` : "Included",
  }
}

function cellText(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ""
  return String(value)
}

function plainTextCell(value: string | number | boolean | null | undefined, maxLength: number): string {
  return sanitizePlainText(cellText(value), maxLength).replace(/\|/g, "/")
}

function htmlBytes(value: string): number {
  return new TextEncoder().encode(value).length
}

const NOWRAP_HEADER = /^duration/i

const TABLE_STYLE =
  "border-collapse:collapse;width:100%;max-width:528px;background-color:#ffffff;color:#0f1a13;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px"

export function renderReportTable(args: {
  csvRows: Array<Array<string | number | boolean | null | undefined>>
  csvAttached?: boolean
  maxRows?: number
  maxHtmlBytes?: number
}): { html: string; text: string; shown: number; total: number; capped: boolean } {
  const maxRows = args.maxRows ?? REPORT_EMAIL_TABLE_MAX_ROWS
  const maxHtmlBytes = args.maxHtmlBytes ?? REPORT_EMAIL_TABLE_MAX_HTML_BYTES
  const csvAttached = args.csvAttached !== false
  const headers = args.csvRows[0] || []
  const data = args.csvRows.slice(1)
  const total = data.length

  if (total === 0) {
    return { html: "", text: "", shown: 0, total: 0, capped: false }
  }

  const nowrap = headers.map((header) => NOWRAP_HEADER.test(cellText(header)))
  const headCells = headers
    .map((header, index) => {
      const now = nowrap[index] ? ' class="rt-now"' : ""
      return `<th bgcolor="#f5f8f6"${now}>${escapeHtml(cellText(header))}</th>`
    })
    .join("")
  const headRow = `<tr>${headCells}</tr>`

  const noteReserve = 260
  const wrapOpen = `<table class="rt" role="presentation" width="100%" cellpadding="4" cellspacing="0" border="1" bgcolor="#ffffff" style="${TABLE_STYLE}"><thead>${headRow}</thead><tbody>`
  const wrapClose = `</tbody></table>`
  const fixedBytes = htmlBytes(wrapOpen + wrapClose) + noteReserve

  const bodyRows: string[] = []
  let bodyBytes = 0
  for (const row of data) {
    if (bodyRows.length >= Math.max(0, maxRows)) break
    const cells = headers
      .map((_, index) => {
        const now = nowrap[index] ? ' class="rt-now"' : ""
        return `<td${now}>${escapeHtml(cellText(row[index]))}</td>`
      })
      .join("")
    const tr = `<tr>${cells}</tr>`
    const nextBytes = fixedBytes + bodyBytes + htmlBytes(tr)
    if (bodyRows.length > 0 && nextBytes > maxHtmlBytes) break
    bodyRows.push(tr)
    bodyBytes += htmlBytes(tr)
  }

  const shown = bodyRows.length
  const capped = shown < total
  const note = capped ? reportEmailTableCapNote(shown, total, csvAttached) : ""
  const noteHtml = note
    ? `<p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#55625a;">${escapeHtml(note)}</p>`
    : ""

  const html = `${noteHtml}${wrapOpen}${bodyRows.join("")}${wrapClose}`
  const textLines = [
    note || "Report table",
    headers.map((header) => plainTextCell(header, 80)).join(" | "),
    ...data.slice(0, shown).map((row) => headers.map((_, index) => plainTextCell(row[index], 120)).join(" | ")),
  ]

  return { html, text: textLines.join("\n"), shown, total, capped }
}
