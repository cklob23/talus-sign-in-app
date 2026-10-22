import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { fetchPages } from "./query.ts"

describe("fetchPages", () => {
  it("walks past the Supabase 1000-row page size and stops when a page is short", async () => {
    const calls: Array<[number, number]> = []
    const result = await fetchPages(async (from, to) => {
      calls.push([from, to])
      const count = from >= 2000 ? 12 : to - from + 1
      return { data: Array.from({ length: count }, (_, i) => from + i), error: null }
    }, 10_000)
    assert.equal(result.truncated, false)
    assert.equal(result.rows.length, 2012)
    assert.deepEqual(calls[0], [0, 999])
    assert.deepEqual(calls[1], [1000, 1999])
    assert.deepEqual(calls[2], [2000, 2999])
  })

  it("sets truncated when the explicit cap is filled", async () => {
    const result = await fetchPages(async (from, to) => {
      return { data: Array.from({ length: to - from + 1 }, (_, i) => from + i), error: null }
    }, 2500)
    assert.equal(result.truncated, true)
    assert.equal(result.rows.length, 2500)
  })
})
