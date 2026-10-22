import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { PG_UNDEFINED_TABLE } from "../idempotency.ts"
import {
  SYNC_RUN_STALE_MS,
  createRunHandle,
  createSyncRun,
  displaySyncRunStatus,
  isStaleSyncRun,
  type SyncRunStore,
} from "./runs.ts"

function memoryStore(options: { failInsertCode?: string; failUpdateCode?: string } = {}) {
  const rows: Array<Record<string, unknown>> = []
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  const store: SyncRunStore & { rows: typeof rows; updates: typeof updates } = {
    rows,
    updates,
    async insert(row) {
      if (options.failInsertCode) {
        return { data: null, error: { code: options.failInsertCode, message: "missing table" } }
      }
      const id = `run-${rows.length + 1}`
      rows.push({ id, ...row })
      return { data: { id }, error: null }
    },
    async update(id, patch) {
      if (options.failUpdateCode) {
        return { error: { code: options.failUpdateCode, message: "missing table" } }
      }
      updates.push({ id, patch })
      const row = rows.find((item) => item.id === id)
      if (row) Object.assign(row, patch)
      return { error: null }
    },
  }
  return store
}

describe("isStaleSyncRun", () => {
  const now = Date.parse("2026-10-22T12:00:00.000Z")

  it("is false for finished runs", () => {
    assert.equal(
      isStaleSyncRun({ status: "succeeded", heartbeat_at: "2026-10-22T11:00:00.000Z" }, now),
      false,
    )
  })

  it("is true when a running heartbeat is older than 5 minutes", () => {
    assert.equal(
      isStaleSyncRun({ status: "running", heartbeat_at: "2026-10-22T11:54:00.000Z" }, now),
      true,
    )
    assert.equal(
      isStaleSyncRun({ status: "running", heartbeat_at: "2026-10-22T11:56:00.000Z" }, now),
      false,
    )
  })

  it("treats a missing heartbeat on a live run as stale", () => {
    assert.equal(isStaleSyncRun({ status: "queued", heartbeat_at: null }, now), true)
  })
})

describe("displaySyncRunStatus", () => {
  it("maps a stale running row to stale", () => {
    const now = Date.parse("2026-10-22T12:00:00.000Z")
    assert.equal(
      displaySyncRunStatus(
        { status: "running", heartbeat_at: new Date(now - SYNC_RUN_STALE_MS - 1).toISOString() },
        now,
      ),
      "stale",
    )
  })
})

describe("createSyncRun", () => {
  it("does not insert a row for dry runs", async () => {
    const store = memoryStore()
    const handle = await createSyncRun(store, {
      provider: "azure",
      trigger: "cron",
      dryRun: true,
    })
    assert.equal(handle.disabled, true)
    assert.equal(handle.id, null)
    assert.equal(store.rows.length, 0)
    await handle.setPhase("Fetching Entra users")
    assert.equal(store.updates.length, 0)
  })

  it("continues when the table is missing (42P01)", async () => {
    const store = memoryStore({ failInsertCode: PG_UNDEFINED_TABLE })
    const handle = await createSyncRun(store, { provider: "ramp", trigger: "manual" })
    assert.equal(handle.disabled, true)
    await handle.setPhase("Fetching Ramp vendors")
    await handle.succeed({ synced: 1 })
    assert.equal(store.updates.length, 0)
  })

  it("creates a running row and writes phase plus finish", async () => {
    const store = memoryStore()
    const handle = await createSyncRun(store, {
      provider: "ramp",
      trigger: "cron",
      nowIso: "2026-10-22T12:00:00.000Z",
    })
    assert.equal(handle.disabled, false)
    assert.equal(handle.id, "run-1")
    assert.equal(store.rows[0].status, "running")
    assert.equal(store.rows[0].phase, "Starting")

    await handle.setPhase("Fetching Ramp vendors", 0, null)
    await handle.setPhase("Upserting batch 3 of 14", 3, 14)
    await handle.succeed({ synced: 12, deactivated: 1, errors: [] })

    const last = store.updates.at(-1)
    assert.equal(last?.patch.status, "succeeded")
    assert.equal(last?.patch.synced, 12)
    assert.equal(last?.patch.deactivated, 1)
    assert.ok(typeof last?.patch.finished_at === "string")
  })

  it("swallows 42P01 on update so a missing table cannot break the sync", async () => {
    const store = memoryStore({ failUpdateCode: PG_UNDEFINED_TABLE })
    store.rows.push({ id: "run-1" })
    const handle = createRunHandle(store, "run-1")
    await handle.setPhase("Deactivating stale vendors", 1, 2)
    await handle.fail("Ramp API error")
    assert.equal(store.updates.length, 2)
  })

  it("throttles count updates but always writes finish", async () => {
    const store = memoryStore()
    const handle = createRunHandle(store, "run-1")
    await handle.setCounts({ synced: 1 })
    await handle.setCounts({ synced: 2 })
    await handle.succeed({ synced: 3, created: 1, updated: 2 })
    assert.equal(store.updates[0].patch.synced, 1)
    assert.equal(store.updates.at(-1)?.patch.status, "succeeded")
    assert.equal(store.updates.at(-1)?.patch.synced, 3)
    assert.ok(store.updates.length <= 3)
  })
})
