import { isUndefinedColumn } from "@/lib/idempotency"
import { REPORT_EXPORT_MAX_ROWS, REPORT_PAGE_SIZE } from "./period.ts"
import type { ReportKind, ReportQuery } from "./types.ts"
import type { EmployeeSignInSource, TrainingCompletionSource, VisitorSignInSource } from "./rows.ts"

type AnyClient = {
  from: (table: string) => any
}

export interface PagedRows<T> {
  rows: T[]
  truncated: boolean
}

export async function fetchPages<T>(
  build: (from: number, to: number) => Promise<{ data?: unknown; error?: { code?: string; message?: string } | null }>,
  maxRows = REPORT_EXPORT_MAX_ROWS,
): Promise<PagedRows<T>> {
  const all: T[] = []
  const cap = Math.max(REPORT_PAGE_SIZE, maxRows)
  for (let from = 0; from < cap; from += REPORT_PAGE_SIZE) {
    const pageEnd = Math.min(from + REPORT_PAGE_SIZE - 1, cap - 1)
    const { data, error } = await build(from, pageEnd)
    if (error) throw new Error(error.message || "Failed to load report rows")
    const rows = (Array.isArray(data) ? data : []) as T[]
    all.push(...rows)
    const requested = pageEnd - from + 1
    if (rows.length < requested) {
      return { rows: all, truncated: false }
    }
    if (all.length >= cap) {
      return { rows: all.slice(0, cap), truncated: true }
    }
  }
  return { rows: all.slice(0, cap), truncated: all.length >= cap }
}

function applyLocationFilter(query: any, locationIds: string[]) {
  if (locationIds.length === 0) return query
  return query.in("location_id", locationIds)
}

function applyTypeFilter(query: any, visitorTypeIds: string[]) {
  if (visitorTypeIds.length === 0) return query
  return query.in("visitor_type_id", visitorTypeIds)
}

function applyTimeRange(query: any, column: string, filter: ReportQuery) {
  if (filter.from) query = query.gte(column, filter.from)
  if (filter.to) query = query.lt(column, filter.to)
  return query
}

const VISITOR_SELECT_WITH_SOURCE =
  "sign_in_time, sign_out_time, sign_out_source, visitor:visitors(first_name, last_name, email, company), host:hosts(name), visitor_type:visitor_types(name), location:locations(name, timezone)"
const VISITOR_SELECT_LEGACY =
  "sign_in_time, sign_out_time, visitor:visitors(first_name, last_name, email, company), host:hosts(name), visitor_type:visitor_types(name), location:locations(name, timezone)"

export async function loadVisitorSignIns(
  admin: AnyClient,
  filter: ReportQuery,
  maxRows = REPORT_EXPORT_MAX_ROWS,
): Promise<PagedRows<VisitorSignInSource>> {
  return fetchPages(async (from, to) => {
    let q = admin.from("sign_ins").select(VISITOR_SELECT_WITH_SOURCE)
    q = applyTimeRange(q, "sign_in_time", filter)
    q = q.order("sign_in_time", { ascending: true }).range(from, to)
    q = applyLocationFilter(q, filter.locationIds)
    q = applyTypeFilter(q, filter.visitorTypeIds)
    const first = await q
    if (first.error && isUndefinedColumn(first.error)) {
      let retry = admin.from("sign_ins").select(VISITOR_SELECT_LEGACY)
      retry = applyTimeRange(retry, "sign_in_time", filter)
      retry = retry.order("sign_in_time", { ascending: true }).range(from, to)
      retry = applyLocationFilter(retry, filter.locationIds)
      retry = applyTypeFilter(retry, filter.visitorTypeIds)
      return retry
    }
    return first
  }, maxRows)
}

const EMPLOYEE_SELECT_WITH_SOURCE =
  "sign_in_time, sign_out_time, sign_out_source, auto_signed_in, profile:profiles(full_name, email, role, department), location:locations(name, timezone)"
const EMPLOYEE_SELECT_LEGACY =
  "sign_in_time, sign_out_time, auto_signed_in, profile:profiles(full_name, email, role, department), location:locations(name, timezone)"

export async function loadEmployeeSignIns(
  admin: AnyClient,
  filter: ReportQuery,
  maxRows = REPORT_EXPORT_MAX_ROWS,
): Promise<PagedRows<EmployeeSignInSource>> {
  return fetchPages(async (from, to) => {
    let q = admin.from("employee_sign_ins").select(EMPLOYEE_SELECT_WITH_SOURCE)
    q = applyTimeRange(q, "sign_in_time", filter)
    q = q.order("sign_in_time", { ascending: true }).range(from, to)
    q = applyLocationFilter(q, filter.locationIds)
    const first = await q
    if (first.error && isUndefinedColumn(first.error)) {
      let retry = admin.from("employee_sign_ins").select(EMPLOYEE_SELECT_LEGACY)
      retry = applyTimeRange(retry, "sign_in_time", filter)
      retry = retry.order("sign_in_time", { ascending: true }).range(from, to)
      retry = applyLocationFilter(retry, filter.locationIds)
      return retry
    }
    return first
  }, maxRows)
}

async function visitorTypeIdsForLocations(admin: AnyClient, locationIds: string[]): Promise<string[]> {
  if (locationIds.length === 0) return []
  const { data, error } = await admin.from("visitor_types").select("id").in("location_id", locationIds)
  if (error || !Array.isArray(data)) return []
  return data.map((row: { id?: string }) => row.id).filter(Boolean) as string[]
}

export async function loadTrainingCompletions(
  admin: AnyClient,
  filter: ReportQuery,
  maxRows = REPORT_EXPORT_MAX_ROWS,
): Promise<PagedRows<TrainingCompletionSource>> {
  const typeIdsForSites = await visitorTypeIdsForLocations(admin, filter.locationIds)

  const selectWithLocation =
    "completed_at, created_at, expires_at, source, location_id, visitor:visitors(first_name, last_name, email, company), visitor_type:visitor_types(name, location_id), location:locations(name, timezone)"
  const selectLegacy =
    "completed_at, created_at, expires_at, source, visitor:visitors(first_name, last_name, email, company), visitor_type:visitor_types(name, location_id)"

  const paged = await fetchPages<TrainingCompletionSource & { location_id?: string | null }>(async (from, to) => {
    let q = admin.from("training_completions").select(selectWithLocation)
    q = applyTimeRange(q, "completed_at", filter)
    q = q.order("completed_at", { ascending: true }).range(from, to)
    if (filter.visitorTypeIds.length) q = q.in("visitor_type_id", filter.visitorTypeIds)
    if (filter.locationIds.length) {
      const typeClause = typeIdsForSites.length ? `visitor_type_id.in.(${typeIdsForSites.join(",")})` : null
      q = typeClause
        ? q.or(`location_id.in.(${filter.locationIds.join(",")}),and(location_id.is.null,${typeClause})`)
        : q.in("location_id", filter.locationIds)
    }
    const first = await q
    if (first.error && isUndefinedColumn(first.error)) {
      let retry = admin.from("training_completions").select(selectLegacy)
      retry = applyTimeRange(retry, "completed_at", filter)
      retry = retry.order("completed_at", { ascending: true }).range(from, to)
      if (filter.visitorTypeIds.length) retry = retry.in("visitor_type_id", filter.visitorTypeIds)
      if (typeIdsForSites.length && filter.locationIds.length) retry = retry.in("visitor_type_id", typeIdsForSites)
      return retry
    }
    return first
  }, maxRows)

  if (filter.locationIds.length === 0) return paged
  const allowed = new Set(filter.locationIds)
  return {
    rows: paged.rows.filter((row) => {
      const loc = (row as { location_id?: string | null }).location_id
      if (loc && allowed.has(loc)) return true
      const typeLoc = row.visitor_type?.location_id
      return !loc && typeLoc && allowed.has(typeLoc)
    }),
    truncated: paged.truncated,
  }
}

export async function loadReportRows(
  admin: AnyClient,
  filter: ReportQuery,
  maxRows = REPORT_EXPORT_MAX_ROWS,
): Promise<{
  kind: ReportKind
  rows: VisitorSignInSource[] | EmployeeSignInSource[] | TrainingCompletionSource[]
  truncated: boolean
}> {
  if (filter.kind === "employees") {
    const loaded = await loadEmployeeSignIns(admin, filter, maxRows)
    return { kind: "employees", rows: loaded.rows, truncated: loaded.truncated }
  }
  if (filter.kind === "training") {
    const loaded = await loadTrainingCompletions(admin, filter, maxRows)
    return { kind: "training", rows: loaded.rows, truncated: loaded.truncated }
  }
  const loaded = await loadVisitorSignIns(admin, filter, maxRows)
  return { kind: "visitors", rows: loaded.rows, truncated: loaded.truncated }
}
