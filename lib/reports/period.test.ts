import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { computeNextRunAt, isScheduleDue, resolveReportPeriod, rollingWindow } from "./period.ts"

describe("resolveReportPeriod", () => {
  it("uses previous calendar day in the site timezone, including across DST spring forward", () => {
    // 2026-03-09 12:00 Chicago is after the 2am jump on March 8.
    const now = new Date("2026-03-09T17:00:00.000Z")
    const period = resolveReportPeriod({
      rangeType: "previous_day",
      timezone: "America/Chicago",
      now,
    })
    assert.equal(period.start.toISOString(), "2026-03-08T06:00:00.000Z")
    assert.equal(period.end.toISOString(), "2026-03-09T05:00:00.000Z")
  })

  it("keeps a 25-hour previous day across DST fall back", () => {
    // 2026-11-02 12:00 Chicago, after the 1am repeat on November 1.
    const now = new Date("2026-11-02T18:00:00.000Z")
    const period = resolveReportPeriod({
      rangeType: "previous_day",
      timezone: "America/Chicago",
      now,
    })
    assert.equal(period.start.toISOString(), "2026-11-01T05:00:00.000Z")
    assert.equal(period.end.toISOString(), "2026-11-02T06:00:00.000Z")
    assert.equal(period.end.getTime() - period.start.getTime(), 25 * 60 * 60 * 1000)
  })

  it("resolves last N days as complete local days ending at today midnight", () => {
    const now = new Date("2026-10-22T18:00:00.000Z")
    const period = resolveReportPeriod({
      rangeType: "last_n_days",
      lastNDays: 7,
      timezone: "America/Chicago",
      now,
    })
    assert.equal(period.start.toISOString(), "2026-10-15T05:00:00.000Z")
    assert.equal(period.end.toISOString(), "2026-10-22T05:00:00.000Z")
  })

  it("resolves previous week as the last complete Monday-Sunday in Nairobi", () => {
    // Wednesday 22 Oct 2026 15:00 EAT
    const now = new Date("2026-10-22T12:00:00.000Z")
    const period = resolveReportPeriod({
      rangeType: "previous_week",
      timezone: "Africa/Nairobi",
      now,
    })
    assert.equal(period.start.toISOString(), "2026-10-11T21:00:00.000Z")
    assert.equal(period.end.toISOString(), "2026-10-18T21:00:00.000Z")
  })

  it("resolves previous month from early January", () => {
    const now = new Date("2026-01-05T12:00:00.000Z")
    const period = resolveReportPeriod({
      rangeType: "previous_month",
      timezone: "UTC",
      now,
    })
    assert.equal(period.start.toISOString(), "2025-12-01T00:00:00.000Z")
    assert.equal(period.end.toISOString(), "2026-01-01T00:00:00.000Z")
  })
})

describe("rollingWindow", () => {
  it("includes now for on-demand last 7 days", () => {
    const now = new Date("2026-10-22T18:00:00.000Z")
    const window = rollingWindow("7", "America/Chicago", now)
    assert.equal(window.start.toISOString(), "2026-10-15T05:00:00.000Z")
    assert.equal(window.end.toISOString(), now.toISOString())
  })
})

describe("computeNextRunAt / isScheduleDue", () => {
  it("is due at the stored next_run_at and not before", () => {
    const at = "2026-10-22T13:00:00.000Z"
    assert.equal(isScheduleDue(true, at, Date.parse("2026-10-22T12:59:00.000Z")), false)
    assert.equal(isScheduleDue(true, at, Date.parse("2026-10-22T13:00:00.000Z")), true)
    assert.equal(isScheduleDue(false, at, Date.parse("2026-10-22T14:00:00.000Z")), false)
  })

  it("advances a daily 08:00 Chicago send to the next local morning", () => {
    const after = new Date("2026-10-22T13:05:00.000Z") // 08:05 CDT
    const next = computeNextRunAt(
      { frequency: "daily", sendTime: "08:00", timezone: "America/Chicago" },
      after,
    )
    assert.equal(next.toISOString(), "2026-10-23T13:00:00.000Z")
  })

  it("lands weekly Monday 08:00 Chicago on the following Monday", () => {
    const wednesday = new Date("2026-10-21T18:00:00.000Z")
    const next = computeNextRunAt(
      { frequency: "weekly", weekday: 1, sendTime: "08:00", timezone: "America/Chicago" },
      wednesday,
    )
    assert.equal(next.toISOString(), "2026-10-26T13:00:00.000Z")
  })

  it("clamps monthly day 31 to the last day of February", () => {
    const after = new Date("2026-02-01T12:00:00.000Z")
    const next = computeNextRunAt(
      { frequency: "monthly", monthDay: 31, sendTime: "08:00", timezone: "UTC" },
      after,
    )
    assert.equal(next.toISOString(), "2026-02-28T08:00:00.000Z")
  })
})
