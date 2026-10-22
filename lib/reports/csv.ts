/** RFC 4180 CSV. Every cell is quoted so names and commas stay intact. */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const text = value == null ? "" : String(value)
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
  const from = fromIso.slice(0, 10)
  const to = toIso.slice(0, 10)
  const slug =
    kind === "visitors"
      ? "visitor-sign-ins"
      : kind === "employees"
        ? "employee-sign-ins"
        : kind === "training"
          ? "training-completions"
          : "report"
  return `${slug}-${from}-to-${to}.csv`
}
