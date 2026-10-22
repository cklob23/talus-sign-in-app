import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  autoSignoutEmailKey,
  lastElapsedVisitorCutoff,
  selectDueVisitorIds,
  visitorDueForEndOfDaySignOut,
} from "./auto-signout.ts"

const TZ = "America/Chicago"
const TARGET = 23 * 60 + 45

describe("visitor end-of-day catch-up", () => {
  it("does not sign out a visitor still inside today's window", () => {
    // 15:00 Chicago on 22 Oct 2026 is 20:00 UTC.
    const now = new Date("2026-10-22T20:00:00.000Z")
    const signedInThisMorning = new Date("2026-10-22T14:00:00.000Z")
    assert.equal(visitorDueForEndOfDaySignOut(signedInThisMorning, now, TZ, TARGET), false)
  })

  it("signs out leftovers from an earlier day before today's cutoff", () => {
    const now = new Date("2026-10-22T20:00:00.000Z")
    const leftover = new Date("2026-10-21T16:00:00.000Z")
    assert.equal(visitorDueForEndOfDaySignOut(leftover, now, TZ, TARGET), true)
  })

  it("signs out anyone still open after today's cutoff, including a missed 15-minute window", () => {
    // 23:50 Chicago is 04:50 UTC the next calendar day.
    const now = new Date("2026-10-23T04:50:00.000Z")
    const signedInThisMorning = new Date("2026-10-22T14:00:00.000Z")
    assert.equal(visitorDueForEndOfDaySignOut(signedInThisMorning, now, TZ, TARGET), true)
    const cutoff = lastElapsedVisitorCutoff(now, TZ, TARGET)
    assert.ok(cutoff.getTime() < now.getTime())
  })

  it("does not sign out a visitor who arrived after today's cutoff", () => {
    const now = new Date("2026-10-23T04:50:00.000Z")
    const lateArrival = new Date("2026-10-23T04:48:00.000Z")
    assert.equal(visitorDueForEndOfDaySignOut(lateArrival, now, TZ, TARGET), false)
  })

  it("selects only the due ids and keeps the email key stable per sign-in", () => {
    const now = new Date("2026-10-22T20:00:00.000Z")
    const ids = selectDueVisitorIds(
      [
        { id: "old", sign_in_time: "2026-10-21T16:00:00.000Z" },
        { id: "today", sign_in_time: "2026-10-22T14:00:00.000Z" },
      ],
      now,
      TZ,
      TARGET,
    )
    assert.deepEqual(ids, ["old"])
    assert.equal(autoSignoutEmailKey("old"), "auto-signout:old")
  })

  it("is idempotent: the same leftover is still due until signed out, and the email key does not change", () => {
    const firstRun = new Date("2026-10-22T05:00:00.000Z")
    const laterRun = new Date("2026-10-22T20:00:00.000Z")
    const leftover = { id: "abc", sign_in_time: "2026-10-21T16:00:00.000Z" }
    assert.deepEqual(selectDueVisitorIds([leftover], firstRun, TZ, TARGET), ["abc"])
    assert.deepEqual(selectDueVisitorIds([leftover], laterRun, TZ, TARGET), ["abc"])
    assert.equal(autoSignoutEmailKey("abc"), autoSignoutEmailKey("abc"))
  })
})
