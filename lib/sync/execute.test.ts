import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { PG_UNDEFINED_TABLE } from "../idempotency.ts"
import { executeProviderSync } from "./execute.ts"
import type { SyncRunStore } from "./runs.ts"

function memoryStore(failInsert = false) {
  const rows: Array<Record<string, unknown>> = []
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  const store: SyncRunStore & { rows: typeof rows; updates: typeof updates } = {
    rows,
    updates,
    async insert(row) {
      if (failInsert) {
        return { data: null, error: { code: PG_UNDEFINED_TABLE, message: "undefined table" } }
      }
      const id = `run-${rows.length + 1}`
      rows.push({ id, ...row })
      return { data: { id }, error: null }
    },
    async update(id, patch) {
      updates.push({ id, patch })
      const row = rows.find((item) => item.id === id)
      if (row) Object.assign(row, patch)
      return { error: null }
    },
  }
  return store
}

const fakeClient = {} as never

describe("executeProviderSync", () => {
  it("does not create a run row for dryRun and still returns counts", async () => {
    const store = memoryStore()
    const out = await executeProviderSync(fakeClient, {
      provider: "azure",
      trigger: "cron",
      dryRun: true,
      store,
      fns: {
        async azure() {
          return { synced: 9, created: 2, updated: 7, deactivated: 0, total: 9, errors: [] }
        },
      },
    })
    assert.equal(out.ok, true)
    assert.equal(out.dryRun, true)
    assert.equal(out.runId, null)
    assert.equal(store.rows.length, 0)
    assert.equal(out.result && "created" in out.result ? out.result.created : 0, 2)
  })

  it("creates a run, reports progress, and marks success", async () => {
    const store = memoryStore()
    const phases: string[] = []
    const out = await executeProviderSync(fakeClient, {
      provider: "ramp",
      trigger: "manual",
      store,
      fns: {
        async ramp(_client, options) {
          await options.progress?.setPhase("Fetching Ramp vendors")
          phases.push("fetch")
          await options.progress?.setPhase("Upserting batch 1 of 1", 1, 1)
          return { synced: 4, total: 4, deactivated: 1, errors: [] }
        },
      },
    })
    assert.equal(out.ok, true)
    assert.equal(out.runId, "run-1")
    assert.deepEqual(phases, ["fetch"])
    assert.equal(store.updates.at(-1)?.patch.status, "succeeded")
    assert.equal(store.updates.at(-1)?.patch.deactivated, 1)
  })

  it("marks the run failed when the provider throws", async () => {
    const store = memoryStore()
    const out = await executeProviderSync(fakeClient, {
      provider: "azure",
      trigger: "cron",
      store,
      fns: {
        async azure() {
          throw new Error("Graph timeout")
        },
      },
    })
    assert.equal(out.ok, false)
    assert.equal(out.error, "Graph timeout")
    assert.equal(store.updates.at(-1)?.patch.status, "failed")
  })

  it("still runs the provider when sync_runs does not exist yet", async () => {
    const store = memoryStore(true)
    const out = await executeProviderSync(fakeClient, {
      provider: "ramp",
      trigger: "cron",
      store,
      fns: {
        async ramp() {
          return { synced: 2, total: 2, deactivated: 0, errors: [] }
        },
      },
    })
    assert.equal(out.ok, true)
    assert.equal(out.runId, null)
    assert.equal(store.rows.length, 0)
  })
})
