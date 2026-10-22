import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decideExistingRun } from "./idempotency.ts"
import { parseScheduleBody } from "./schedule.ts"

describe("parseScheduleBody", () => {
  const base = {
    name: "Nightly visitors",
    kind: "visitors",
    rangeType: "previous_day",
    frequency: "daily",
    sendTime: "8:00",
    timezone: "America/Chicago",
    recipients: ["caleb@talusag.com"],
    format: "both",
  }

  it("accepts a daily visitor schedule and pads send time", () => {
    const parsed = parseScheduleBody(base)
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.equal(parsed.value.sendTime, "08:00")
    assert.equal(parsed.value.enabled, true)
    assert.equal(parsed.value.locationIds.length, 0)
  })

  it("requires weekday, month day, last N, and at least one recipient", () => {
    assert.equal(parseScheduleBody({ ...base, frequency: "weekly" }).ok, false)
    assert.equal(parseScheduleBody({ ...base, frequency: "weekly", weekday: 1 }).ok, true)
    assert.equal(parseScheduleBody({ ...base, frequency: "monthly" }).ok, false)
    assert.equal(parseScheduleBody({ ...base, frequency: "monthly", monthDay: 31 }).ok, true)
    assert.equal(parseScheduleBody({ ...base, rangeType: "last_n_days" }).ok, false)
    assert.equal(parseScheduleBody({ ...base, rangeType: "last_n_days", lastNDays: 14 }).ok, true)
    assert.equal(parseScheduleBody({ ...base, rangeType: "all_time" }).ok, true)
    assert.equal(parseScheduleBody({ ...base, rangeType: "today" }).ok, true)
    assert.equal(parseScheduleBody({ ...base, recipients: [] }).ok, false)
    assert.equal(parseScheduleBody({ ...base, kind: "bookings" }).ok, false)
  })
})

describe("scheduled run idempotency", () => {
  it("never re-sends a completed period", () => {
    const first = decideExistingRun(null)
    assert.equal(first, "insert")
    const second = decideExistingRun({ status: "sent", started_at: "2026-10-22T13:00:00.000Z" })
    assert.equal(second, "skip_sent")
  })
})
