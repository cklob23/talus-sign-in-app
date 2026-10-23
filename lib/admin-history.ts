export const HISTORY_SOURCE_COLUMN_HEADER = "Source"

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
