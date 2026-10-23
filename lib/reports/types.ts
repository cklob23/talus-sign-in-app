export const REPORT_KINDS = ["visitors", "employees", "training"] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export const RANGE_TYPES = ["previous_day", "previous_week", "previous_month", "last_n_days", "today", "all_time"] as const
export type RangeType = (typeof RANGE_TYPES)[number]

export const FREQUENCIES = ["daily", "weekly", "monthly"] as const
export type ReportFrequency = (typeof FREQUENCIES)[number]

export const REPORT_FORMATS = ["csv", "summary", "both"] as const
export type ReportFormat = (typeof REPORT_FORMATS)[number]

export const REPORT_TRIGGERS = ["scheduled", "manual"] as const
export type ReportTrigger = (typeof REPORT_TRIGGERS)[number]

export const DURATION_UNITS = ["minutes", "hours"] as const
export type DurationUnit = (typeof DURATION_UNITS)[number]

export const REPORT_RUN_STATUSES = ["queued", "running", "sent", "failed", "skipped"] as const
export type ReportRunStatus = (typeof REPORT_RUN_STATUSES)[number]

export const TALUS_EMAIL_DOMAIN = "talusag.com"

export const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  visitors: "Visitor sign-ins",
  employees: "Employee sign-ins",
  training: "Training completions",
}

export const RANGE_TYPE_LABELS: Record<RangeType, string> = {
  previous_day: "Previous day",
  previous_week: "Previous week",
  previous_month: "Previous month",
  last_n_days: "Last N days",
  today: "Today",
  all_time: "All time",
}

export const DASHBOARD_PERIODS = [
  { value: "1", label: "Last 24 hours" },
  { value: "today", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
] as const

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number]["value"]

export const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
}

export const FORMAT_LABELS: Record<ReportFormat, string> = {
  csv: "CSV attachment",
  summary: "Inline summary",
  both: "CSV and summary",
}

export const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
  minutes: "Minutes",
  hours: "Hours",
}

export const TRAINING_METHOD_LABELS: Record<string, string> = {
  kiosk: "Kiosk",
  qr: "QR",
  training_link: "Training link",
  prior: "Prior completion",
}

export interface ReportLocation {
  id: string
  name: string
  timezone?: string | null
}

export interface ReportScheduleInput {
  name: string
  kind: ReportKind
  locationIds: string[]
  visitorTypeIds: string[]
  rangeType: RangeType
  lastNDays: number | null
  frequency: ReportFrequency
  weekday: number | null
  monthDay: number | null
  sendTime: string
  timezone: string
  recipients: string[]
  format: ReportFormat
  durationUnit: DurationUnit
  enabled: boolean
}

export interface ReportSchedule extends ReportScheduleInput {
  id: string
  nextRunAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ReportRun {
  id: string
  scheduleId: string
  trigger: ReportTrigger
  status: ReportRunStatus
  periodStart: string
  periodEnd: string
  rowCount: number | null
  recipients: string[]
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export interface ReportQuery {
  kind: ReportKind
  locationIds: string[]
  visitorTypeIds: string[]
  from: string
  to: string
}

export function isReportKind(value: string): value is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(value)
}

export function isRangeType(value: string): value is RangeType {
  return (RANGE_TYPES as readonly string[]).includes(value)
}

export function isReportFrequency(value: string): value is ReportFrequency {
  return (FREQUENCIES as readonly string[]).includes(value)
}

export function isReportFormat(value: string): value is ReportFormat {
  return (REPORT_FORMATS as readonly string[]).includes(value)
}

export function isDurationUnit(value: string): value is DurationUnit {
  return (DURATION_UNITS as readonly string[]).includes(value)
}

export function isTalusRecipient(email: string): boolean {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf("@")
  if (at < 1) return false
  return trimmed.slice(at + 1) === TALUS_EMAIL_DOMAIN
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function splitRecipientTokens(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[,;\s]+/)
  return parts.map((part) => (typeof part === "string" ? part.trim() : "")).filter(Boolean)
}

export function normalizeRecipient(email: string): string | null {
  const value = email.trim().toLowerCase()
  if (!value || value.length > 254 || !EMAIL_RE.test(value)) return null
  if (value.includes("..") || value.startsWith(".") || value.endsWith(".")) return null
  const at = value.lastIndexOf("@")
  const domain = at >= 0 ? value.slice(at + 1) : ""
  if (!domain.includes(".") || domain.startsWith("-") || domain.endsWith("-")) return null
  return value
}

export function invalidRecipientTokens(raw: string | string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of splitRecipientTokens(raw)) {
    if (normalizeRecipient(part)) continue
    const key = part.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(part)
  }
  return out
}

export function parseRecipientList(raw: string | string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of splitRecipientTokens(raw)) {
    const email = normalizeRecipient(part)
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

export function weekdayLabel(value: number | null | undefined): string {
  const found = WEEKDAYS.find((day) => day.value === value)
  return found?.label || "Monday"
}
