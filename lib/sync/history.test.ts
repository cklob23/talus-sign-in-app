import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  filterSyncHistory,
  formatDuration,
  formatElapsedMs,
  mergeSyncHistory,
  parseScheduledSyncAudit,
  syncRunToLog,
} from "./history.ts"
import type { SyncRunRow } from "./runs.ts"

const run = (overrides: Partial<SyncRunRow> = {}): SyncRunRow => ({
  id: "run-1",
  provider: "azure",
  trigger: "cron",
  status: "succeeded",
  phase: "Done",
  progress_current: 10,
  progress_total: 10,
  synced: 10,
  created: 4,
  updated: 6,
  deactivated: 1,
  error_count: 0,
  errors: [],
  started_at: "2026-10-22T12:00:00.000Z",
  finished_at: "2026-10-22T12:01:05.000Z",
  heartbeat_at: "2026-10-22T12:01:05.000Z",
  ...overrides,
})

describe("formatElapsedMs", () => {
  it("formats seconds, minutes, and hours", () => {
    assert.equal(formatElapsedMs(9000), "9s")
    assert.equal(formatElapsedMs(125000), "2m 5s")
    assert.equal(formatElapsedMs(3723000), "1h 2m 3s")
  })
})

describe("formatDuration", () => {
  it("returns n/a when a timestamp is missing", () => {
    assert.equal(formatDuration("2026-10-22T12:00:00.000Z", null), "n/a")
  })
})

describe("parseScheduledSyncAudit", () => {
  it("reads counts from a successful scheduled_sync.azure entry", () => {
    const entry = parseScheduledSyncAudit({
      id: "a1",
      action: "scheduled_sync.azure",
      description: "Scheduled Azure AD sync: 12/100 users synced, 3 deactivated (2 errors)",
      created_at: "2026-10-21T18:00:00.000Z",
    })
    assert.ok(entry)
    assert.equal(entry?.provider, "azure")
    assert.equal(entry?.trigger, "cron")
    assert.equal(entry?.status, "succeeded")
    assert.equal(entry?.synced, 12)
    assert.equal(entry?.deactivated, 3)
    assert.equal(entry?.errorCount, 2)
    assert.equal(entry?.source, "audit")
  })

  it("reads a scheduled_sync.ramp_error entry", () => {
    const entry = parseScheduledSyncAudit({
      id: "a2",
      action: "scheduled_sync.ramp_error",
      description: "Scheduled Ramp sync failed: Ramp OAuth failed",
      created_at: "2026-10-21T19:00:00.000Z",
    })
    assert.ok(entry)
    assert.equal(entry?.provider, "ramp")
    assert.equal(entry?.status, "failed")
    assert.deepEqual(entry?.errors, ["Ramp OAuth failed"])
  })

  it("ignores unrelated audit actions", () => {
    assert.equal(
      parseScheduledSyncAudit({
        id: "a3",
        action: "settings.updated",
        description: "Ramp API settings updated",
        created_at: "2026-10-21T19:00:00.000Z",
      }),
      null,
    )
  })
})

describe("mergeSyncHistory", () => {
  it("prefers a sync_runs row over a nearby audit duplicate", () => {
    const merged = mergeSyncHistory(
      [run()],
      [
        {
          id: "a1",
          action: "scheduled_sync.azure",
          description: "Scheduled Azure AD sync: 10/10 users synced, 1 deactivated",
          created_at: "2026-10-22T12:00:30.000Z",
        },
      ],
    )
    assert.equal(merged.length, 1)
    assert.equal(merged[0].source, "sync_run")
    assert.equal(merged[0].created, 4)
  })

  it("keeps older audit history when there is no matching run", () => {
    const merged = mergeSyncHistory(
      [run()],
      [
        {
          id: "old",
          action: "scheduled_sync.ramp",
          description: "Scheduled Ramp sync: 80/80 vendors synced, 0 deactivated",
          created_at: "2026-10-20T08:00:00.000Z",
        },
      ],
    )
    assert.equal(merged.length, 2)
    assert.equal(merged[1].provider, "ramp")
    assert.equal(merged[1].source, "audit")
  })

  it("marks a run stale when the heartbeat is old", () => {
    const now = Date.parse("2026-10-22T12:10:00.000Z")
    const entry = syncRunToLog(
      run({
        status: "running",
        finished_at: null,
        heartbeat_at: "2026-10-22T12:00:00.000Z",
      }),
      now,
    )
    assert.equal(entry.status, "stale")
  })
})

describe("filterSyncHistory", () => {
  it("filters by provider and status", () => {
    const entries = mergeSyncHistory(
      [
        run({ id: "r1", provider: "azure", status: "succeeded" }),
        run({
          id: "r2",
          provider: "ramp",
          status: "failed",
          started_at: "2026-10-22T11:00:00.000Z",
          finished_at: "2026-10-22T11:01:00.000Z",
        }),
      ],
      [],
    )
    assert.equal(filterSyncHistory(entries, { provider: "ramp" }).length, 1)
    assert.equal(filterSyncHistory(entries, { status: "failed" })[0].id, "r2")
  })
})
