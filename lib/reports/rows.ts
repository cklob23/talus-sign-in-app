import { resolveDisplayTimeZone, toIANATimezone } from "@/lib/timezone"
import { TRAINING_METHOD_LABELS } from "./types.ts"

export interface VisitorSignInSource {
  sign_in_time: string
  sign_out_time?: string | null
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
  if (!endIso) return ""
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return ""
  return String(Math.round((end - start) / (1000 * 60)))
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

export const VISITOR_HEADERS = [
  "Visitor name",
  "Email",
  "Company",
  "Visitor type",
  "Host",
  "Site",
  "Sign in",
  "Sign out",
  "Duration (min)",
]

export function visitorSignInRow(row: VisitorSignInSource): string[] {
  const zone = row.location?.timezone
  return [
    visitorDisplayName(row.visitor),
    row.visitor?.email || "",
    row.visitor?.company || "",
    row.visitor_type?.name || "",
    row.host?.name || "",
    row.location?.name || "",
    formatReportDateTime(row.sign_in_time, zone),
    formatReportDateTime(row.sign_out_time, zone),
    durationMinutes(row.sign_in_time, row.sign_out_time),
  ]
}

export const EMPLOYEE_HEADERS = [
  "Employee name",
  "Email",
  "Role",
  "Department",
  "Site",
  "Auto sign-in",
  "Sign in",
  "Sign out",
  "Duration (min)",
]

export function employeeSignInRow(row: EmployeeSignInSource): string[] {
  const zone = row.location?.timezone
  return [
    row.profile?.full_name || "",
    row.profile?.email || "",
    row.profile?.role || "",
    row.profile?.department || "",
    row.location?.name || "",
    row.auto_signed_in ? "Yes" : "No",
    formatReportDateTime(row.sign_in_time, zone),
    formatReportDateTime(row.sign_out_time, zone),
    durationMinutes(row.sign_in_time, row.sign_out_time),
  ]
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

export function buildVisitorCsvRows(rows: VisitorSignInSource[]): string[][] {
  return [VISITOR_HEADERS, ...rows.map(visitorSignInRow)]
}

export function buildEmployeeCsvRows(rows: EmployeeSignInSource[]): string[][] {
  return [EMPLOYEE_HEADERS, ...rows.map(employeeSignInRow)]
}

export function buildTrainingCsvRows(rows: TrainingCompletionSource[], nowMs = Date.now()): string[][] {
  return [TRAINING_HEADERS, ...rows.map((row) => trainingCompletionRow(row, nowMs))]
}
