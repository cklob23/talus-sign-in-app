export const SCHEDULE_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "168h": 7 * 24 * 60 * 60 * 1000,
}

/**
 * Determines if a sync is due, respecting start date/time and frequency.
 * - If start date is in the future, skip (not yet time).
 * - If start date is in the past (or empty), check if enough time has passed
 *   since lastSync based on the frequency interval.
 * - If never synced before, sync now (as long as start date has passed).
 */
export function isSyncDue(
  schedule: string,
  lastSyncIso: string | null,
  startDateIso: string | null,
  nowMs = Date.now(),
): boolean {
  if (schedule === "off" || !SCHEDULE_MS[schedule]) return false

  if (startDateIso) {
    const startTime = new Date(startDateIso).getTime()
    if (!Number.isNaN(startTime) && startTime > nowMs) return false
  }

  if (!lastSyncIso) return true

  const lastSync = new Date(lastSyncIso).getTime()
  if (Number.isNaN(lastSync)) return true
  const interval = SCHEDULE_MS[schedule]
  return nowMs - lastSync >= interval
}

export type SyncProvider = "azure" | "ramp"

export function parseSyncRequest(url: string): {
  provider: SyncProvider | "all"
  dryRun: boolean
} {
  const parsed = new URL(url)
  const raw = (parsed.searchParams.get("provider") || "all").toLowerCase()
  const provider: SyncProvider | "all" = raw === "azure" || raw === "ramp" ? raw : "all"
  const dry = parsed.searchParams.get("dryRun") || parsed.searchParams.get("dryrun")
  const dryRun = dry === "1" || dry === "true"
  return { provider, dryRun }
}

/**
 * Hourly cron respects due checks. `?provider=azure|ramp` forces that
 * provider so production can be validated even when the schedule is off
 * or the interval has not elapsed.
 */
export function shouldRunProvider(
  selected: SyncProvider | "all",
  target: SyncProvider,
  due: boolean,
): boolean {
  if (selected === target) return true
  if (selected === "all") return due
  return false
}

export function graphPageItems<T>(data: { value?: T[]; "@odata.nextLink"?: string }): {
  items: T[]
  next: string | null
} {
  return {
    items: data.value || [],
    next: data["@odata.nextLink"] || null,
  }
}

export function rampPageItems<T>(data: { data?: T[]; page?: { next?: string | null } }): {
  items: T[]
  next: string | null
} {
  return {
    items: data.data || [],
    next: data.page?.next || null,
  }
}

export async function collectPages<T>(
  firstUrl: string,
  fetchPage: (url: string) => Promise<{ items: T[]; next: string | null }>,
): Promise<T[]> {
  const all: T[] = []
  let nextUrl: string | null = firstUrl
  const seen = new Set<string>()

  while (nextUrl) {
    if (seen.has(nextUrl)) break
    seen.add(nextUrl)
    const page = await fetchPage(nextUrl)
    all.push(...page.items)
    nextUrl = page.next
  }

  return all
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => run())
  await Promise.all(workers)
  return results
}

/**
 * Page a 1-based numbered API (Supabase auth.admin.listUsers) until a
 * short page. Stops at maxPages so a stuck endpoint cannot loop forever.
 */
export async function collectNumberedPages<T>(
  fetchPage: (page: number) => Promise<T[]>,
  perPage: number,
  maxPages = 1000,
): Promise<T[]> {
  const all: T[] = []
  const size = Math.max(1, perPage)
  for (let page = 1; page <= maxPages; page++) {
    const items = await fetchPage(page)
    all.push(...items)
    if (items.length < size) break
  }
  return all
}
