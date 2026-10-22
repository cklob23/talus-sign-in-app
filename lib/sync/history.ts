import {
  displaySyncRunStatus,
  type SyncRunDisplayStatus,
  type SyncRunProvider,
  type SyncRunRow,
  type SyncRunTrigger,
} from "@/lib/sync/runs"

export interface SyncLogEntry {
  id: string
  source: "sync_run" | "audit"
  provider: SyncRunProvider
  trigger: SyncRunTrigger
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  status: SyncRunDisplayStatus
  synced: number | null
  created: number | null
  updated: number | null
  deactivated: number | null
  errorCount: number
  errors: string[]
  phase: string | null
  progressCurrent: number | null
  progressTotal: number | null
}

export interface AuditSyncLog {
  id: string
  action: string
  description: string | null
  created_at: string
}

const AUDIT_SUCCESS = /^scheduled_sync\.(azure|ramp)$/
const AUDIT_ERROR = /^scheduled_sync\.(azure|ramp)_error$/

const SUCCESS_COUNTS =
  /:\s*(\d+)\/(\d+)\s+(?:users|vendors)\s+synced,\s*(\d+)\s+deactivated(?:\s*\((\d+)\s+errors\))?/i

export function durationMs(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(finishedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return end - start
}

export function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  const ms = durationMs(startedAt, finishedAt)
  if (ms === null) return "n/a"
  return formatElapsedMs(ms)
}

export function formatElapsedMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatElapsedSince(startedAt: string, nowMs = Date.now()): string {
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return "n/a"
  return formatElapsedMs(nowMs - start)
}

export function normalizeSyncErrors(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : String(item))).filter(Boolean)
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      return normalizeSyncErrors(JSON.parse(trimmed))
    } catch {
      return [trimmed]
    }
  }
  return []
}

export function syncRunToLog(run: SyncRunRow, nowMs = Date.now()): SyncLogEntry {
  const errors = normalizeSyncErrors(run.errors)
  const finishedAt = run.finished_at
  const status = displaySyncRunStatus(run, nowMs)
  return {
    id: run.id,
    source: "sync_run",
    provider: run.provider,
    trigger: run.trigger,
    startedAt: run.started_at,
    finishedAt,
    durationMs: durationMs(run.started_at, finishedAt),
    status,
    synced: run.synced ?? 0,
    created: run.created ?? 0,
    updated: run.updated ?? 0,
    deactivated: run.deactivated ?? 0,
    errorCount: run.error_count ?? errors.length,
    errors,
    phase: run.phase,
    progressCurrent: run.progress_current,
    progressTotal: run.progress_total,
  }
}

export function parseScheduledSyncAudit(log: AuditSyncLog): SyncLogEntry | null {
  const success = log.action.match(AUDIT_SUCCESS)
  const failed = log.action.match(AUDIT_ERROR)
  if (!success && !failed) return null

  const provider = ((success || failed)?.[1] || "azure") as SyncRunProvider
  const description = log.description || ""
  const counts = description.match(SUCCESS_COUNTS)

  if (failed) {
    const message = description.replace(/^Scheduled (?:Azure AD|Ramp) sync failed:\s*/i, "").trim()
    return {
      id: `audit:${log.id}`,
      source: "audit",
      provider,
      trigger: "cron",
      startedAt: log.created_at,
      finishedAt: log.created_at,
      durationMs: null,
      status: "failed",
      synced: null,
      created: null,
      updated: null,
      deactivated: null,
      errorCount: 1,
      errors: message ? [message] : [description || "Scheduled sync failed"],
      phase: null,
      progressCurrent: null,
      progressTotal: null,
    }
  }

  return {
    id: `audit:${log.id}`,
    source: "audit",
    provider,
    trigger: "cron",
    startedAt: log.created_at,
    finishedAt: log.created_at,
    durationMs: null,
    status: "succeeded",
    synced: counts ? Number(counts[1]) : null,
    created: null,
    updated: null,
    deactivated: counts ? Number(counts[3]) : null,
    errorCount: counts && counts[4] ? Number(counts[4]) : 0,
    errors: [],
    phase: null,
    progressCurrent: null,
    progressTotal: counts ? Number(counts[2]) : null,
  }
}

function nearDuplicate(run: SyncLogEntry, audit: SyncLogEntry): boolean {
  if (run.provider !== audit.provider || run.trigger !== audit.trigger) return false
  const runTime = new Date(run.startedAt).getTime()
  const auditTime = new Date(audit.startedAt).getTime()
  if (Number.isNaN(runTime) || Number.isNaN(auditTime)) return false
  return Math.abs(runTime - auditTime) < 2 * 60 * 1000
}

export function mergeSyncHistory(
  runs: SyncRunRow[],
  audits: AuditSyncLog[],
  nowMs = Date.now(),
): SyncLogEntry[] {
  const fromRuns = runs.map((run) => syncRunToLog(run, nowMs))
  const fromAudits = audits
    .map(parseScheduledSyncAudit)
    .filter((entry): entry is SyncLogEntry => entry !== null)
    .filter((audit) => !fromRuns.some((run) => nearDuplicate(run, audit)))

  return [...fromRuns, ...fromAudits].sort((a, b) => {
    const aTime = new Date(a.startedAt).getTime()
    const bTime = new Date(b.startedAt).getTime()
    return bTime - aTime
  })
}

export function filterSyncHistory(
  entries: SyncLogEntry[],
  filters: { provider?: SyncRunProvider | "all"; status?: SyncRunDisplayStatus | "all" },
): SyncLogEntry[] {
  return entries.filter((entry) => {
    if (filters.provider && filters.provider !== "all" && entry.provider !== filters.provider) {
      return false
    }
    if (filters.status && filters.status !== "all" && entry.status !== filters.status) {
      return false
    }
    return true
  })
}
