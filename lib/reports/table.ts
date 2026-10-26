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

/** Short stamp for the email table only. CSV keeps the full weekday/year/zone. */
export function formatEmailTableDate(value: string): string {
  const text = value.trim()
  if (!text) return ""
  const match = text.match(
    /^(?:[A-Za-z]{3},\s+)?([A-Za-z]{3}\s+\d{1,2}),\s+\d{4},\s+(\d{1,2}:\d{2}\s*[AP]M)\b/i,
  )
  if (match) return `${match[1]}, ${match[2].replace(/\s+/g, " ")}`
  return text
}

export function emailDurationHeader(header: string): "Hrs" | "Min" {
  return /\(hr/i.test(header) ? "Hrs" : "Min"
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

type ColKind =
  | "name"
  | "email"
  | "company"
  | "type"
  | "host"
  | "site"
  | "role"
  | "department"
  | "auto"
  | "signin"
  | "signout"
  | "duration"
  | "completed"
  | "expires"
  | "status"
  | "method"
  | "other"

type EmailColumn = {
  header: string
  sources: number[]
  kinds: ColKind[]
}

function classifyHeader(header: string): ColKind {
  const text = header.trim()
  if (/^email$/i.test(text)) return "email"
  if (/visitor name|employee name|^name$/i.test(text)) return "name"
  if (/^company$/i.test(text)) return "company"
  if (/visitor type|^type$/i.test(text)) return "type"
  if (/^host$/i.test(text)) return "host"
  if (/^site$/i.test(text)) return "site"
  if (/^role$/i.test(text)) return "role"
  if (/^department$/i.test(text)) return "department"
  if (/auto sign-in/i.test(text)) return "auto"
  if (/^sign in$/i.test(text)) return "signin"
  if (/^sign out$/i.test(text)) return "signout"
  if (/^duration/i.test(text)) return "duration"
  if (/^completed$/i.test(text)) return "completed"
  if (/^expires$/i.test(text)) return "expires"
  if (/^status$/i.test(text)) return "status"
  if (/^method$/i.test(text)) return "method"
  return "other"
}

function nameHeader(header: string): string {
  if (/employee/i.test(header)) return "Employee"
  if (/visitor/i.test(header)) return "Visitor"
  return "Name"
}

function take(kinds: ColKind[], used: boolean[], indexes: ColKind[]): number[] {
  const found: number[] = []
  for (const want of indexes) {
    const at = kinds.findIndex((kind, index) => !used[index] && kind === want)
    if (at < 0) return []
    found.push(at)
  }
  for (const at of found) used[at] = true
  return found
}

function takeOne(kinds: ColKind[], used: boolean[], want: ColKind): number | null {
  const at = kinds.findIndex((kind, index) => !used[index] && kind === want)
  if (at < 0) return null
  used[at] = true
  return at
}

export function emailTableColumns(headers: Array<string | number | boolean | null | undefined>): EmailColumn[] {
  const labels = headers.map((header) => cellText(header))
  const kinds = labels.map(classifyHeader)
  const used = labels.map(() => false)
  const columns: EmailColumn[] = []

  const nameAt = takeOne(kinds, used, "name")
  const emailAt = takeOne(kinds, used, "email")
  if (nameAt != null && emailAt != null) {
    columns.push({ header: nameHeader(labels[nameAt]), sources: [nameAt, emailAt], kinds: ["name", "email"] })
  } else {
    if (nameAt != null) columns.push({ header: labels[nameAt], sources: [nameAt], kinds: ["name"] })
    if (emailAt != null) columns.push({ header: "Email", sources: [emailAt], kinds: ["email"] })
  }

  const companyType = take(kinds, used, ["company", "type"])
  if (companyType.length) {
    columns.push({ header: "Company", sources: companyType, kinds: ["company", "type"] })
  }

  const roleDept = take(kinds, used, ["role", "department"])
  if (roleDept.length) {
    columns.push({ header: "Role", sources: roleDept, kinds: ["role", "department"] })
  }

  const hostSite = take(kinds, used, ["host", "site"])
  if (hostSite.length) {
    columns.push({ header: "Host", sources: hostSite, kinds: ["host", "site"] })
  }

  const siteAuto = take(kinds, used, ["site", "auto"])
  if (siteAuto.length) {
    columns.push({ header: "Site", sources: siteAuto, kinds: ["site", "auto"] })
  }

  const inOut = take(kinds, used, ["signin", "signout"])
  const durationAt = takeOne(kinds, used, "duration")
  if (inOut.length) {
    columns.push({
      header: "In / out",
      sources: durationAt != null ? [...inOut, durationAt] : inOut,
      kinds: durationAt != null ? ["signin", "signout", "duration"] : ["signin", "signout"],
    })
  } else if (durationAt != null) {
    columns.push({
      header: emailDurationHeader(labels[durationAt]),
      sources: [durationAt],
      kinds: ["duration"],
    })
  }

  const dates = take(kinds, used, ["completed", "expires"])
  if (dates.length) {
    columns.push({ header: "Dates", sources: dates, kinds: ["completed", "expires"] })
  }

  const statusMethod = take(kinds, used, ["status", "method"])
  if (statusMethod.length) {
    columns.push({ header: "Status", sources: statusMethod, kinds: ["status", "method"] })
  }

  const leftoverSite = takeOne(kinds, used, "site")
  if (leftoverSite != null) {
    const nest = columns.find((column) => column.header === "Company" || column.header === "Host")
    if (nest) {
      nest.sources.push(leftoverSite)
      nest.kinds.push("site")
    } else {
      columns.push({ header: "Site", sources: [leftoverSite], kinds: ["site"] })
    }
  }

  kinds.forEach((kind, index) => {
    if (used[index]) return
    used[index] = true
    columns.push({
      header: kind === "duration" ? emailDurationHeader(labels[index]) : labels[index],
      sources: [index],
      kinds: [kind],
    })
  })

  return columns
}

function formatPart(kind: ColKind, raw: string, durationHeader = ""): string {
  if (!raw) return ""
  if (kind === "signin" || kind === "signout" || kind === "completed" || kind === "expires") {
    return formatEmailTableDate(raw)
  }
  if (kind === "duration") {
    const unit = emailDurationHeader(durationHeader)
    return unit === "Hrs" ? `${raw} hr` : `${raw} min`
  }
  if (kind === "auto") return raw === "Yes" ? "Auto" : raw === "No" ? "" : raw
  return raw
}

function renderEmailCell(
  column: EmailColumn,
  row: Array<string | number | boolean | null | undefined>,
  headers: string[],
): { html: string; text: string } {
  const parts = column.sources
    .map((source, index) => {
      const kind = column.kinds[index]
      const raw = formatPart(kind, cellText(row[source]), headers[source] || "")
      return { kind, raw }
    })
    .filter((part) => part.raw)

  const htmlParts = parts.map((part) => {
    const safe = escapeHtml(part.raw)
    return part.kind === "email" ? `<span class="rt-em">${safe}</span>` : safe
  })
  const tdClass = parts.length === 1 && parts[0].kind === "email" ? ' class="rt-em"' : ""
  return {
    html: `<td${tdClass}>${htmlParts.join("<br>")}</td>`,
    text: parts.map((part) => part.raw).join(" / "),
  }
}

const TABLE_STYLE =
  "border-collapse:collapse;table-layout:auto;width:100%;max-width:528px;background-color:#ffffff;color:#0f1a13;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px"

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

  const columns = emailTableColumns(headers)
  const headerLabels = headers.map((header) => cellText(header))
  const headCells = columns
    .map((column) => `<th bgcolor="#f5f8f6">${escapeHtml(column.header)}</th>`)
    .join("")
  const headRow = `<tr>${headCells}</tr>`

  const noteReserve = 260
  const wrapOpen = `<table class="rt" role="presentation" width="100%" cellpadding="4" cellspacing="0" border="1" bgcolor="#ffffff" style="${TABLE_STYLE}"><thead>${headRow}</thead><tbody>`
  const wrapClose = `</tbody></table>`
  const fixedBytes = htmlBytes(wrapOpen + wrapClose) + noteReserve

  const bodyRows: string[] = []
  const textBody: string[] = []
  let bodyBytes = 0
  for (const row of data) {
    if (bodyRows.length >= Math.max(0, maxRows)) break
    const cells = columns.map((column) => renderEmailCell(column, row, headerLabels))
    const tr = `<tr>${cells.map((cell) => cell.html).join("")}</tr>`
    const nextBytes = fixedBytes + bodyBytes + htmlBytes(tr)
    if (bodyRows.length > 0 && nextBytes > maxHtmlBytes) break
    bodyRows.push(tr)
    textBody.push(cells.map((cell) => plainTextCell(cell.text, 120)).join(" | "))
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
    columns.map((column) => plainTextCell(column.header, 80)).join(" | "),
    ...textBody,
  ]

  return { html, text: textLines.join("\n"), shown, total, capped }
}
