import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { findActiveHost, listActiveHosts, type HostsClient, type HostsQueryBuilder } from "./active-hosts.ts"

function hostClient(options: {
  data?: unknown[] | { id: string } | null
  error?: { message?: string } | null
  onEq?: (column: string, value: unknown) => void
}): HostsClient {
  const builder: HostsQueryBuilder = {
    select() {
      return builder
    },
    eq(column, value) {
      options.onEq?.(column, value)
      return builder
    },
    order() {
      return Promise.resolve({
        data: Array.isArray(options.data) ? options.data : null,
        error: options.error ?? null,
      })
    },
    maybeSingle() {
      const row = options.data && !Array.isArray(options.data) ? options.data : null
      return Promise.resolve({ data: row, error: options.error ?? null })
    },
  }
  return {
    from() {
      return builder
    },
  }
}

describe("listActiveHosts", () => {
  it("loads every active host and never filters by location_id", async () => {
    const eqCalls: Array<[string, unknown]> = []
    const result = await listActiveHosts(
      hostClient({
        data: [
          { id: "h1", name: "Ada", department: "Ops" },
          { id: "h2", name: "Ben", department: null },
        ],
        onEq: (column, value) => eqCalls.push([column, value]),
      }),
    )

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.hosts.length, 2)
    assert.deepEqual(eqCalls, [["is_active", true]])
    assert.equal(eqCalls.some(([column]) => column === "location_id"), false)
  })

  it("surfaces a query error instead of an empty list", async () => {
    const result = await listActiveHosts(
      hostClient({
        data: [],
        error: { message: "permission denied for table hosts" },
      }),
    )

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.match(result.error, /permission denied/)
  })
})

describe("findActiveHost", () => {
  it("accepts any existing active host", async () => {
    const eqCalls: Array<[string, unknown]> = []
    const result = await findActiveHost(
      hostClient({
        data: { id: "h1" },
        onEq: (column, value) => eqCalls.push([column, value]),
      }),
      "h1",
    )

    assert.equal(result.ok, true)
    assert.deepEqual(eqCalls, [
      ["id", "h1"],
      ["is_active", true],
    ])
    assert.equal(eqCalls.some(([column]) => column === "location_id"), false)
  })

  it("rejects a missing or inactive host", async () => {
    const result = await findActiveHost(hostClient({ data: null }), "missing")
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.status, 400)
    assert.equal(result.error, "Invalid host")
  })
})
