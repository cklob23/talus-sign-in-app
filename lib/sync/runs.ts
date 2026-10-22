import { isUndefinedTable } from "@/lib/idempotency"

export const SYNC_RUN_STALE_MS = 5 * 60 * 1000
export const SYNC_RUN_THROTTLE_MS = 400

export type SyncRunProvider = "azure" | "ramp"
export type SyncRunTrigger = "cron" | "manual"
export type SyncRunStatus = "queued" | "running" | "succeeded" | "failed"
export type SyncRunDisplayStatus = SyncRunStatus | "stale"

export interface SyncRunCounts {
  synced: number
  created: number
  updated: number
  deactivated: number
  errors: string[]
}

export interface SyncRunRow {
  id: string
  provider: SyncRunProvider
  trigger: SyncRunTrigger
  status: SyncRunStatus
  phase: string | null
  progress_current: number | null
  progress_total: number | null
  synced: number
  created: number
  updated: number
  deactivated: number
  error_count: number
  errors: string[]
  started_at: string
  finished_at: string | null
  heartbeat_at: string
}

export interface SyncRunInsertResult {
  data: { id: string } | null
  error: { code?: string; message?: string } | null
}

export interface SyncRunStore {
  insert(row: Record<string, unknown>): Promise<SyncRunInsertResult>
  update(id: string, patch: Record<string, unknown>): Promise<{ error: { code?: string; message?: string } | null }>
}

export interface SyncProgressReporter {
  id: string | null
  disabled: boolean
  setPhase(phase: string, current?: number | null, total?: number | null): Promise<void>
  setCounts(counts: Partial<SyncRunCounts>): Promise<void>
  succeed(counts?: Partial<SyncRunCounts>): Promise<void>
  fail(message: string, counts?: Partial<SyncRunCounts>): Promise<void>
}

export function isStaleSyncRun(
  run: { status: string; heartbeat_at: string | null },
  nowMs = Date.now(),
): boolean {
  if (run.status !== "queued" && run.status !== "running") return false
  if (!run.heartbeat_at) return true
  const heartbeat = new Date(run.heartbeat_at).getTime()
  if (Number.isNaN(heartbeat)) return true
  return nowMs - heartbeat > SYNC_RUN_STALE_MS
}

export function displaySyncRunStatus(
  run: { status: SyncRunStatus | string; heartbeat_at: string | null },
  nowMs = Date.now(),
): SyncRunDisplayStatus {
  if (isStaleSyncRun(run, nowMs)) return "stale"
  if (
    run.status === "queued" ||
    run.status === "running" ||
    run.status === "succeeded" ||
    run.status === "failed"
  ) {
    return run.status
  }
  return "failed"
}

export function emptySyncCounts(): SyncRunCounts {
  return { synced: 0, created: 0, updated: 0, deactivated: 0, errors: [] }
}

function countPatch(counts: Partial<SyncRunCounts>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (typeof counts.synced === "number") patch.synced = counts.synced
  if (typeof counts.created === "number") patch.created = counts.created
  if (typeof counts.updated === "number") patch.updated = counts.updated
  if (typeof counts.deactivated === "number") patch.deactivated = counts.deactivated
  if (counts.errors) {
    patch.errors = counts.errors
    patch.error_count = counts.errors.length
  }
  return patch
}

function disabledHandle(): SyncProgressReporter {
  return {
    id: null,
    disabled: true,
    async setPhase() {},
    async setCounts() {},
    async succeed() {},
    async fail() {},
  }
}

export function createRunHandle(store: SyncRunStore, id: string): SyncProgressReporter {
  let lastWrite = 0
  let queued: Record<string, unknown> = {}
  let flushing = false

  async function flush(patch: Record<string, unknown>, force: boolean) {
    queued = { ...queued, ...patch, heartbeat_at: new Date().toISOString() }
    const now = Date.now()
    if (!force && (flushing || now - lastWrite < SYNC_RUN_THROTTLE_MS)) return

    flushing = true
    lastWrite = now
    const toWrite = queued
    queued = {}
    try {
      const { error } = await store.update(id, toWrite)
      if (error && !isUndefinedTable(error)) {
        console.error("[sync-runs] update failed:", error.message || error)
      }
    } finally {
      flushing = false
      if (Object.keys(queued).length > 0 && (force || Date.now() - lastWrite >= SYNC_RUN_THROTTLE_MS)) {
        await flush({}, force)
      }
    }
  }

  return {
    id,
    disabled: false,
    async setPhase(phase, current, total) {
      const patch: Record<string, unknown> = { status: "running", phase }
      if (current !== undefined) patch.progress_current = current
      if (total !== undefined) patch.progress_total = total
      await flush(patch, true)
    },
    async setCounts(counts) {
      await flush(countPatch(counts), false)
    },
    async succeed(counts = {}) {
      await flush(
        {
          ...countPatch(counts),
          status: "succeeded",
          finished_at: new Date().toISOString(),
        },
        true,
      )
    },
    async fail(message, counts = {}) {
      const errors = counts.errors ? [...counts.errors] : []
      if (message && !errors.includes(message)) errors.unshift(message)
      await flush(
        {
          ...countPatch({ ...counts, errors }),
          status: "failed",
          finished_at: new Date().toISOString(),
        },
        true,
      )
    },
  }
}

export async function createSyncRun(
  store: SyncRunStore,
  input: {
    provider: SyncRunProvider
    trigger: SyncRunTrigger
    dryRun?: boolean
    nowIso?: string
  },
): Promise<SyncProgressReporter> {
  if (input.dryRun) return disabledHandle()

  const nowIso = input.nowIso || new Date().toISOString()
  const { data, error } = await store.insert({
    provider: input.provider,
    trigger: input.trigger,
    status: "running",
    phase: "Starting",
    progress_current: null,
    progress_total: null,
    synced: 0,
    created: 0,
    updated: 0,
    deactivated: 0,
    error_count: 0,
    errors: [],
    started_at: nowIso,
    finished_at: null,
    heartbeat_at: nowIso,
  })

  if (error) {
    if (!isUndefinedTable(error)) {
      console.error("[sync-runs] insert failed:", error.message || error)
    }
    return disabledHandle()
  }
  if (!data?.id) return disabledHandle()
  return createRunHandle(store, data.id)
}

export function supabaseSyncRunStore(client: {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<SyncRunInsertResult>
      }
    }
    update: (patch: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { code?: string; message?: string } | null }>
    }
  }
}): SyncRunStore {
  return {
    async insert(row) {
      return client.from("sync_runs").insert(row).select("id").single()
    },
    async update(id, patch) {
      return client.from("sync_runs").update(patch).eq("id", id)
    },
  }
}
