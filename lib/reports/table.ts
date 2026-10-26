import { escapeHtml, sanitizePlainText } from "@/lib/html-escape"

/** Gmail clips around 102 KB. 40 compact rows stay well under 90 KB with the footer. */
export const REPORT_EMAIL_TABLE_MAX_ROWS = 40
export const REPORT_EMAIL_TABLE_MAX_HTML_BYTES = 70_000

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

function plainTextCell(value: string | number | boolean | null | undefined, maxLength: number): string {
  return sanitizePlainText(cellText(value), maxLength).replace(/\|/g, "/")
}

function htmlBytes(value: string): number {
  return new TextEncoder().encode(value).length
}

const NOWRAP_HEADER =
  /^(sign in|sign out|completed|expires|duration|auto sign-in|status|method|sign-out source)/i

const TABLE_STYLE = "border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;color:#0f1a13"
const TH_STYLE = "padding:5px 6px;border:1px solid #dce6df;background:#f5f8f6;text-align:left;font-weight:700"
const TD_STYLE = "padding:5px 6px;border:1px solid #dce6df"
const TD_NOW = `${TD_STYLE};white-space:nowrap`

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
      const style = nowrap[index] ? `${TH_STYLE};white-space:nowrap` : TH_STYLE
      return `<th style="${style}">${escapeHtml(cellText(header))}</th>`
    })
    .join("")
  const headRow = `<tr>${headCells}</tr>`

  const noteReserve = 220
  const wrapOpen = `<div style="overflow-x:auto;width:100%;"><table role="presentation" cellpadding="5" cellspacing="0" border="0" style="${TABLE_STYLE}"><thead>${headRow}</thead><tbody>`
  const wrapClose = `</tbody></table></div>`
  const fixedBytes = htmlBytes(wrapOpen + wrapClose) + noteReserve

  const bodyRows: string[] = []
  let bodyBytes = 0
  for (const row of data) {
    if (bodyRows.length >= Math.max(0, maxRows)) break
    const cells = headers
      .map((_, index) => {
        const style = nowrap[index] ? TD_NOW : TD_STYLE
        return `<td style="${style}">${escapeHtml(cellText(row[index]))}</td>`
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
