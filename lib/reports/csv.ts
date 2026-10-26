/** Neutralize Excel/Sheets formula injection with a leading quote. */
export function neutralizeCsvFormula(value: string): string {
  const first = value.charAt(0)
  if (
    first === "=" ||
    first === "+" ||
    first === "-" ||
    first === "@" ||
    first === "\uFF1D" ||
    first === "\t" ||
    first === "\r" ||
    first === "\n" ||
    first === " "
  ) {
    return `'${value}`
  }
  return value
}

/** RFC 4180 CSV. Every cell is quoted so names and commas stay intact. */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const text = neutralizeCsvFormula(value == null ? "" : String(value))
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")
}

/** UTF-8 BOM so Excel keeps visitor names readable. */
export function csvWithBom(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return `\uFEFF${toCsv(rows)}\n`
}

export function csvFilename(kind: string, fromIso: string, toIso: string): string {
  const slug =
    kind === "visitors"
      ? "visitor-sign-ins"
      : kind === "employees"
        ? "employee-sign-ins"
        : kind === "training"
          ? "training-completions"
          : "report"
  if (!fromIso || fromIso.startsWith("1970-01-01") || fromIso.startsWith("1969-")) {
    return `${slug}-all-time.csv`
  }
  const from = fromIso.slice(0, 10)
  const to = toIso.slice(0, 10)
  return `${slug}-${from}-to-${to}.csv`
}
