import { signOutSourceLabel } from "@/lib/sign-out-source"
import { resolveDisplayTimeZone, toIANATimezone } from "@/lib/timezone"
import { TRAINING_METHOD_LABELS, type DurationUnit } from "./types.ts"

export interface VisitorSignInSource {
  sign_in_time: string
  sign_out_time?: string | null
  sign_out_source?: string | null
  visitor?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    company?: string | null
  } | null
  host?: { name?: string | null } | null
  visitor_type?: { name?: string | null } | null
  location?: { name?: string | null; timezone?: string | null } | null
}

export interface EmployeeSignInSource {
  sign_in_time: string
  sign_out_time?: string | null
  sign_out_source?: string | null
  auto_signed_in?: boolean | null
  profile?: {
    full_name?: string | null
    email?: string | null
    role?: string | null
    department?: string | null
  } | null
  location?: { name?: string | null; timezone?: string | null } | null
}

export interface TrainingCompletionSource {
  completed_at?: string | null
  created_at?: string | null
  expires_at?: string | null
  source?: string | null
  visitor?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    company?: string | null
  } | null
  visitor_type?: { name?: string | null; location_id?: string | null } | null
  location?: { name?: string | null; timezone?: string | null } | null
}

/** Stamp in the site timezone, including the abbreviation at that instant (CST vs CDT). */
export function formatReportDateTime(iso: string | null | undefined, timezone?: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const zone = toIANATimezone(resolveDisplayTimeZone(timezone))
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date)
  }
}

export function durationMinutes(startIso: string, endIso?: string | null): string {
  return formatVisitDuration(startIso, endIso, "minutes")
}

export function formatVisitDuration(
  startIso: string,
  endIso: string | null | undefined,
  unit: DurationUnit = "minutes",
): string {
  if (!endIso) return ""
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return ""
  const minutes = (end - start) / (1000 * 60)
  if (unit === "hours") {
    return String(Math.round((minutes / 60) * 100) / 100)
  }
  return String(Math.round(minutes))
}

export function durationColumnHeader(unit: DurationUnit = "minutes"): string {
  return unit === "hours" ? "Duration (hr)" : "Duration (min)"
}

export function durationUnitShortLabel(unit: DurationUnit = "minutes"): string {
  return unit === "hours" ? "h" : "m"
}

export function formatAverageDuration(avgMinutes: number, unit: DurationUnit = "minutes"): string {
  if (!Number.isFinite(avgMinutes)) return "0"
  if (unit === "hours") return String(Math.round((avgMinutes / 60) * 10) / 10)
  return String(Math.round(avgMinutes))
}

export function visitorDisplayName(visitor?: VisitorSignInSource["visitor"]): string {
  if (!visitor) return ""
  return `${visitor.first_name || ""} ${visitor.last_name || ""}`.trim()
}

export function trainingStatus(expiresAt: string | null | undefined, nowMs = Date.now()): "Cleared" | "Expired" {
  if (!expiresAt) return "Cleared"
  const at = new Date(expiresAt).getTime()
  if (!Number.isFinite(at)) return "Cleared"
  return at >= nowMs ? "Cleared" : "Expired"
}

export function trainingMethodLabel(source?: string | null): string {
  if (!source) return ""
  return TRAINING_METHOD_LABELS[source] || source
}

export function includeSignOutSourceColumn(rows: Array<{ sign_out_source?: unknown }>): boolean {
  return rows.some((row) => row != null && typeof row === "object" && "sign_out_source" in row)
}

export function visitorHeaders(unit: DurationUnit = "minutes", includeSource = false): string[] {
  const headers = [
    "Visitor name",
    "Email",
    "Company",
    "Visitor type",
    "Host",
    "Site",
    "Sign in",
    "Sign out",
    durationColumnHeader(unit),
  ]
  if (includeSource) headers.push("Sign-out source")
  return headers
}

export const VISITOR_HEADERS = visitorHeaders("minutes")

export function visitorSignInRow(
  row: VisitorSignInSource,
  unit: DurationUnit = "minutes",
  includeSource = false,
): string[] {
  const zone = row.location?.timezone
  const cells = [
    visitorDisplayName(row.visitor),
    row.visitor?.email || "",
    row.visitor?.company || "",
    row.visitor_type?.name || "",
    row.host?.name || "",
    row.location?.name || "",
    formatReportDateTime(row.sign_in_time, zone),
    formatReportDateTime(row.sign_out_time, zone),
    formatVisitDuration(row.sign_in_time, row.sign_out_time, unit),
  ]
  if (includeSource) cells.push(signOutSourceLabel(row.sign_out_source))
  return cells
}

export function employeeHeaders(unit: DurationUnit = "minutes", includeSource = false): string[] {
  const headers = [
    "Employee name",
    "Email",
    "Role",
    "Department",
    "Site",
    "Auto sign-in",
    "Sign in",
    "Sign out",
    durationColumnHeader(unit),
  ]
  if (includeSource) headers.push("Sign-out source")
  return headers
}

export const EMPLOYEE_HEADERS = employeeHeaders("minutes")

export function employeeSignInRow(
  row: EmployeeSignInSource,
  unit: DurationUnit = "minutes",
  includeSource = false,
): string[] {
  const zone = row.location?.timezone
  const cells = [
    row.profile?.full_name || "",
    row.profile?.email || "",
    row.profile?.role || "",
    row.profile?.department || "",
    row.location?.name || "",
    row.auto_signed_in ? "Yes" : "No",
    formatReportDateTime(row.sign_in_time, zone),
    formatReportDateTime(row.sign_out_time, zone),
    formatVisitDuration(row.sign_in_time, row.sign_out_time, unit),
  ]
  if (includeSource) cells.push(signOutSourceLabel(row.sign_out_source))
  return cells
}

export const TRAINING_HEADERS = [
  "Name",
  "Email",
  "Company",
  "Visitor type",
  "Site",
  "Completed",
  "Expires",
  "Status",
  "Method",
]

export function trainingCompletionRow(row: TrainingCompletionSource, nowMs = Date.now()): string[] {
  const zone = row.location?.timezone
  const completedAt = row.completed_at || row.created_at || ""
  return [
    visitorDisplayName(row.visitor),
    row.visitor?.email || "",
    row.visitor?.company || "",
    row.visitor_type?.name || "",
    row.location?.name || "",
    formatReportDateTime(completedAt, zone),
    formatReportDateTime(row.expires_at, zone),
    trainingStatus(row.expires_at, nowMs),
    trainingMethodLabel(row.source),
  ]
}

export function buildVisitorCsvRows(rows: VisitorSignInSource[], unit: DurationUnit = "minutes"): string[][] {
  const includeSource = includeSignOutSourceColumn(rows)
  return [visitorHeaders(unit, includeSource), ...rows.map((row) => visitorSignInRow(row, unit, includeSource))]
}

export function buildEmployeeCsvRows(rows: EmployeeSignInSource[], unit: DurationUnit = "minutes"): string[][] {
  const includeSource = includeSignOutSourceColumn(rows)
  return [employeeHeaders(unit, includeSource), ...rows.map((row) => employeeSignInRow(row, unit, includeSource))]
}

export function buildTrainingCsvRows(rows: TrainingCompletionSource[], nowMs = Date.now()): string[][] {
  return [TRAINING_HEADERS, ...rows.map((row) => trainingCompletionRow(row, nowMs))]
}
