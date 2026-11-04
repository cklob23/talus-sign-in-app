import { toCsv } from "@/lib/reports/csv"
import { signOutSourceLabel } from "@/lib/sign-out-source"
import { formatDuration, formatSiteDateTime } from "@/lib/timezone"

export const HISTORY_SOURCE_COLUMN_HEADER = "Source"

export type HistoryLocationTime = { name?: string | null; timezone?: string | null } | null | undefined

/** Sign-in and sign-out both use the visitor's sign-in site timezone. */
export function historySiteStamp(iso: string | null | undefined, locationTimezone?: string | null): string {
  return formatSiteDateTime(iso, locationTimezone)
}

export function historySiteZone(location?: HistoryLocationTime): string | null | undefined {
  return location?.timezone
}

type HistoryVisitorCsvSource = {
  sign_in_time: string
  sign_out_time?: string | null
  sign_out_source?: string | null
  visitor?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    company?: string | null
  } | null
  visitor_type?: { name?: string | null } | null
  location?: HistoryLocationTime
  host?: { name?: string | null } | null
}

type HistoryEmployeeCsvSource = {
  sign_in_time: string
  sign_out_time?: string | null
  sign_out_source?: string | null
  auto_signed_in?: boolean | null
  profile?: {
    full_name?: string | null
    email?: string | null
    role?: string | null
  } | null
  location?: HistoryLocationTime
}

export function buildHistoryVisitorCsvRows(rows: HistoryVisitorCsvSource[]): string[][] {
  return [
    ["Name", "Email", "Company", "Type", "Location", "Host", "Sign In", "Sign Out", "Sign-out source", "Duration"],
    ...rows.map((row) => {
      const zone = historySiteZone(row.location)
      return [
        `${row.visitor?.first_name || ""} ${row.visitor?.last_name || ""}`.trim(),
        row.visitor?.email || "",
        row.visitor?.company || "",
        row.visitor_type?.name || "",
        row.location?.name || "",
        row.host?.name || "",
        historySiteStamp(row.sign_in_time, zone),
        historySiteStamp(row.sign_out_time, zone),
        signOutSourceLabel(row.sign_out_source),
        formatDuration(row.sign_in_time, row.sign_out_time ?? null),
      ]
    }),
  ]
}

export function buildHistoryEmployeeCsvRows(rows: HistoryEmployeeCsvSource[]): string[][] {
  return [
    ["Name", "Email", "Role", "Location", "Sign In", "Sign Out", "Sign-out source", "Duration", "Auto Sign-In"],
    ...rows.map((row) => {
      const zone = historySiteZone(row.location)
      return [
        row.profile?.full_name || "",
        row.profile?.email || "",
        row.profile?.role || "",
        row.location?.name || "",
        historySiteStamp(row.sign_in_time, zone),
        historySiteStamp(row.sign_out_time, zone),
        signOutSourceLabel(row.sign_out_source),
        formatDuration(row.sign_in_time, row.sign_out_time ?? null),
        row.auto_signed_in ? "Yes" : "No",
      ]
    }),
  ]
}

export function historyCsvText(rows: string[][]): string {
  return toCsv(rows)
}

export const HISTORY_VISITOR_SELECT = `
        *,
        visitor:visitors(*),
        host:hosts(*),
        visitor_type:visitor_types(*),
        location:locations(*)
      `

export const HISTORY_EMPLOYEE_SELECT = `
        *,
        profile:profiles(*),
        location:locations(*)
      `

export type HistoryCacheSnapshot<TVisitor = unknown, TEmployee = unknown> = {
  visitors: TVisitor[]
  employees: TEmployee[]
  at: number
}

let historyCache: HistoryCacheSnapshot | null = null

export function readHistoryCache<TVisitor = unknown, TEmployee = unknown>(): HistoryCacheSnapshot<
  TVisitor,
  TEmployee
> | null {
  return historyCache as HistoryCacheSnapshot<TVisitor, TEmployee> | null
}

export function writeHistoryCache<TVisitor, TEmployee>(
  snapshot: Partial<Pick<HistoryCacheSnapshot<TVisitor, TEmployee>, "visitors" | "employees">> & {
    at?: number
  },
): HistoryCacheSnapshot<TVisitor, TEmployee> {
  const previous = (historyCache ?? { visitors: [], employees: [], at: 0 }) as HistoryCacheSnapshot<
    TVisitor,
    TEmployee
  >
  historyCache = {
    visitors: snapshot.visitors ?? previous.visitors,
    employees: snapshot.employees ?? previous.employees,
    at: snapshot.at ?? Date.now(),
  }
  return historyCache as HistoryCacheSnapshot<TVisitor, TEmployee>
}

export function clearHistoryCache(): void {
  historyCache = null
}

/** True until that list's request has settled or a cached first paint exists. */
export function isHistoryListPending(settled: boolean): boolean {
  return !settled
}

/**
 * Start both History list fetches in the same tick and paint each list as
 * soon as it returns. Waiting for the second request is what left the
 * visitor table on Loading after the first list already returned 200.
 */
export async function runHistoryListLoads<TVisitor, TEmployee>(loads: {
  visitors: () => Promise<TVisitor[] | null | undefined>
  employees: () => Promise<TEmployee[] | null | undefined>
  onVisitors?: (rows: TVisitor[]) => void
  onEmployees?: (rows: TEmployee[]) => void
}): Promise<{ visitors: TVisitor[]; employees: TEmployee[] }> {
  const visitorsStarted = loads.visitors()
  const employeesStarted = loads.employees()

  const visitorsP = Promise.resolve(visitorsStarted).then((data) => {
    const rows = data ?? []
    writeHistoryCache({ visitors: rows })
    loads.onVisitors?.(rows)
    return rows
  })

  const employeesP = Promise.resolve(employeesStarted).then((data) => {
    const rows = data ?? []
    writeHistoryCache({ employees: rows })
    loads.onEmployees?.(rows)
    return rows
  })

  const [visitors, employees] = await Promise.all([visitorsP, employeesP])
  return { visitors, employees }
}
