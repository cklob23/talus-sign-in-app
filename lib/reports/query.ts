import { isUndefinedColumn } from "@/lib/idempotency"
import type { ReportKind, ReportQuery } from "./types.ts"
import type { EmployeeSignInSource, TrainingCompletionSource, VisitorSignInSource } from "./rows.ts"

type AnyClient = {
  from: (table: string) => any
}

const PAGE = 1000

async function fetchPages<T>(build: (from: number, to: number) => Promise<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message || "Failed to load report rows")
    const rows = data || []
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

function applyLocationFilter(query: any, locationIds: string[]) {
  if (locationIds.length === 0) return query
  return query.in("location_id", locationIds)
}

function applyTypeFilter(query: any, visitorTypeIds: string[]) {
  if (visitorTypeIds.length === 0) return query
  return query.in("visitor_type_id", visitorTypeIds)
}

export async function loadVisitorSignIns(admin: AnyClient, filter: ReportQuery): Promise<VisitorSignInSource[]> {
  return fetchPages(async (from, to) => {
    let q = admin
      .from("sign_ins")
      .select("sign_in_time, sign_out_time, visitor:visitors(first_name, last_name, email, company), host:hosts(name), visitor_type:visitor_types(name), location:locations(name, timezone)")
      .gte("sign_in_time", filter.from)
      .lt("sign_in_time", filter.to)
      .order("sign_in_time", { ascending: true })
      .range(from, to)
    q = applyLocationFilter(q, filter.locationIds)
    q = applyTypeFilter(q, filter.visitorTypeIds)
    return q
  })
}

export async function loadEmployeeSignIns(admin: AnyClient, filter: ReportQuery): Promise<EmployeeSignInSource[]> {
  return fetchPages(async (from, to) => {
    let q = admin
      .from("employee_sign_ins")
      .select("sign_in_time, sign_out_time, auto_signed_in, profile:profiles(full_name, email, role, department), location:locations(name, timezone)")
      .gte("sign_in_time", filter.from)
      .lt("sign_in_time", filter.to)
      .order("sign_in_time", { ascending: true })
      .range(from, to)
    q = applyLocationFilter(q, filter.locationIds)
    return q
  })
}

async function visitorTypeIdsForLocations(admin: AnyClient, locationIds: string[]): Promise<string[]> {
  if (locationIds.length === 0) return []
  const { data, error } = await admin.from("visitor_types").select("id").in("location_id", locationIds)
  if (error || !Array.isArray(data)) return []
  return data.map((row: { id?: string }) => row.id).filter(Boolean) as string[]
}

export async function loadTrainingCompletions(admin: AnyClient, filter: ReportQuery): Promise<TrainingCompletionSource[]> {
  const typeIdsForSites = await visitorTypeIdsForLocations(admin, filter.locationIds)

  const selectWithLocation =
    "completed_at, created_at, expires_at, source, location_id, visitor:visitors(first_name, last_name, email, company), visitor_type:visitor_types(name, location_id), location:locations(name, timezone)"
  const selectLegacy =
    "completed_at, created_at, expires_at, source, visitor:visitors(first_name, last_name, email, company), visitor_type:visitor_types(name, location_id)"

  const rows = await fetchPages<TrainingCompletionSource & { location_id?: string | null }>(async (from, to) => {
    let q = admin
      .from("training_completions")
      .select(selectWithLocation)
      .gte("completed_at", filter.from)
      .lt("completed_at", filter.to)
      .order("completed_at", { ascending: true })
      .range(from, to)
    if (filter.visitorTypeIds.length) q = q.in("visitor_type_id", filter.visitorTypeIds)
    if (filter.locationIds.length) {
      const typeClause = typeIdsForSites.length ? `visitor_type_id.in.(${typeIdsForSites.join(",")})` : null
      q = typeClause
        ? q.or(`location_id.in.(${filter.locationIds.join(",")}),and(location_id.is.null,${typeClause})`)
        : q.in("location_id", filter.locationIds)
    }
    const first = await q
    if (first.error && isUndefinedColumn(first.error)) {
      let retry = admin
        .from("training_completions")
        .select(selectLegacy)
        .gte("completed_at", filter.from)
        .lt("completed_at", filter.to)
        .order("completed_at", { ascending: true })
        .range(from, to)
      if (filter.visitorTypeIds.length) retry = retry.in("visitor_type_id", filter.visitorTypeIds)
      if (typeIdsForSites.length && filter.locationIds.length) retry = retry.in("visitor_type_id", typeIdsForSites)
      return retry
    }
    return first
  })

  if (filter.locationIds.length === 0) return rows
  const allowed = new Set(filter.locationIds)
  return rows.filter((row) => {
    const loc = (row as { location_id?: string | null }).location_id
    if (loc && allowed.has(loc)) return true
    const typeLoc = row.visitor_type?.location_id
    return !loc && typeLoc && allowed.has(typeLoc)
  })
}

export async function loadReportRows(
  admin: AnyClient,
  filter: ReportQuery,
): Promise<{ kind: ReportKind; rows: VisitorSignInSource[] | EmployeeSignInSource[] | TrainingCompletionSource[] }> {
  if (filter.kind === "employees") {
    return { kind: "employees", rows: await loadEmployeeSignIns(admin, filter) }
  }
  if (filter.kind === "training") {
    return { kind: "training", rows: await loadTrainingCompletions(admin, filter) }
  }
  return { kind: "visitors", rows: await loadVisitorSignIns(admin, filter) }
}
