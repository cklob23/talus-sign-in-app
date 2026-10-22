export const STALE_RUNNING_MS = 10 * 60 * 1000

export type ExistingRunDecision = "insert" | "reuse" | "skip_sent" | "skip_inflight"

/**
 * Unique (schedule_id, period_start) on scheduled runs is the idempotency key.
 * A sent row is never sent again. A failed or stale running row can be reused.
 */
export function decideExistingRun(
  existing: { status: string; started_at: string } | null | undefined,
  nowMs = Date.now(),
): ExistingRunDecision {
  if (!existing) return "insert"
  if (existing.status === "sent" || existing.status === "skipped") return "skip_sent"
  if (existing.status === "running") {
    const started = new Date(existing.started_at).getTime()
    if (Number.isFinite(started) && nowMs - started < STALE_RUNNING_MS) return "skip_inflight"
    return "reuse"
  }
  if (existing.status === "failed" || existing.status === "queued") return "reuse"
  return "insert"
}
