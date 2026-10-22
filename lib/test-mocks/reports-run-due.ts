export type DueReportsResult = {
  ok: boolean
  success?: boolean
  error?: string
  timestamp?: string
  due?: number
  results?: Array<Record<string, unknown>>
  skipped?: string
}

const emptyResult: DueReportsResult = {
  ok: true,
  success: true,
  timestamp: "2026-10-22T00:00:00.000Z",
  due: 0,
  results: [],
}

let impl: (() => Promise<DueReportsResult>) | null = null

export function setDueReportsImpl(fn: (() => Promise<DueReportsResult>) | null) {
  impl = fn
}

export function resetDueReportsMock() {
  impl = null
}

export async function runDueReports(): Promise<DueReportsResult> {
  if (impl) return impl()
  return { ...emptyResult }
}
