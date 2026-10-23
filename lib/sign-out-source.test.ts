import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applySignOut,
  isSignOutSource,
  signOutSourceLabel,
  signOutUpdatePayload,
} from "./sign-out-source.ts"

describe("sign-out source", () => {
  it("labels manual and auto, and ignores unknown or empty values", () => {
    assert.equal(isSignOutSource("manual"), true)
    assert.equal(isSignOutSource("auto"), true)
    assert.equal(isSignOutSource("cron"), false)
    assert.equal(signOutSourceLabel("manual"), "Manual")
    assert.equal(signOutSourceLabel("auto"), "Auto")
    assert.equal(signOutSourceLabel(null), "")
    assert.equal(signOutSourceLabel("geofence"), "")
  })

  it("writes source next to the sign-out timestamp", () => {
    assert.deepEqual(signOutUpdatePayload("auto", "2026-10-23T04:45:00.000Z"), {
      sign_out_time: "2026-10-23T04:45:00.000Z",
      sign_out_source: "auto",
    })
  })

  it("retries without the source column when Postgres says it is missing", async () => {
    const payloads: Array<Record<string, unknown>> = []
    const result = await applySignOut(
      async (payload) => {
        payloads.push(payload)
        if ("sign_out_source" in payload) {
          return { error: { code: "42703", message: 'column "sign_out_source" does not exist' } }
        }
        return { error: null, data: [{ id: "1" }] }
      },
      "manual",
      "2026-10-23T16:00:00.000Z",
    )
    assert.equal(result.error, null)
    assert.deepEqual(payloads, [
      { sign_out_time: "2026-10-23T16:00:00.000Z", sign_out_source: "manual" },
      { sign_out_time: "2026-10-23T16:00:00.000Z" },
    ])
  })

  it("keeps the source column when the first update succeeds", async () => {
    const payloads: Array<Record<string, unknown>> = []
    const result = await applySignOut(
      async (payload) => {
        payloads.push(payload)
        return { error: null }
      },
      "auto",
      "2026-10-23T04:45:00.000Z",
    )
    assert.equal(result.error, null)
    assert.equal(payloads.length, 1)
    assert.equal(payloads[0].sign_out_source, "auto")
  })
})
