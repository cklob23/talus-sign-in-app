import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  computeNextRunAt,
  isScheduleDue,
  resolveOnDemandWindow,
  resolveReportPeriod,
  rollingWindow,
} from "./period.ts"

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

describe("all time, today, and custom windows", () => {
  it("resolves scheduled all-time from epoch and keys the run on today midnight", () => {
    const now = new Date("2026-10-22T18:00:00.000Z")
    const period = resolveReportPeriod({
      rangeType: "all_time",
      timezone: "America/New_York",
      now,
    })
    assert.equal(period.start.toISOString(), "1970-01-01T00:00:00.000Z")
    assert.equal(period.end.toISOString(), now.toISOString())
    assert.equal(period.runStart.toISOString(), "2026-10-22T04:00:00.000Z")
  })

  it("resolves today as local midnight through now, not the last 24 hours", () => {
    const now = new Date("2026-10-22T18:00:00.000Z")
    const today = resolveOnDemandWindow({ period: "today", timezone: "America/New_York", now })
    const lastDay = resolveOnDemandWindow({ period: "1", timezone: "America/New_York", now })
    assert.equal(today.start.toISOString(), "2026-10-22T04:00:00.000Z")
    assert.equal(today.end.toISOString(), now.toISOString())
    assert.equal(lastDay.start.toISOString(), "2026-10-21T18:00:00.000Z")
    assert.ok(today.start.getTime() > lastDay.start.getTime())
  })

  it("interprets a custom range in the selected site timezone, inclusive of the end date", () => {
    const now = new Date("2026-10-22T18:00:00.000Z")
    const window = resolveOnDemandWindow({
      period: "custom",
      timezone: "America/Chicago",
      customStart: "2026-10-01",
      customEnd: "2026-10-07",
      now,
    })
    assert.equal(window.start.toISOString(), "2026-10-01T05:00:00.000Z")
    assert.equal(window.end.toISOString(), "2026-10-08T05:00:00.000Z")
  })

  it("keeps custom range bounds correct across DST spring forward", () => {
    const now = new Date("2026-03-09T17:00:00.000Z")
    const window = resolveOnDemandWindow({
      period: "custom",
      timezone: "America/Chicago",
      customStart: "2026-03-08",
      customEnd: "2026-03-08",
      now,
    })
    assert.equal(window.start.toISOString(), "2026-03-08T06:00:00.000Z")
    assert.equal(window.end.toISOString(), "2026-03-09T05:00:00.000Z")
  })

  it("keeps a 25-hour custom day across DST fall back", () => {
    const now = new Date("2026-11-02T18:00:00.000Z")
    const window = resolveOnDemandWindow({
      period: "custom",
      timezone: "America/Chicago",
      customStart: "2026-11-01",
      customEnd: "2026-11-01",
      now,
    })
    assert.equal(window.start.toISOString(), "2026-11-01T05:00:00.000Z")
    assert.equal(window.end.toISOString(), "2026-11-02T06:00:00.000Z")
    assert.equal(window.end.getTime() - window.start.getTime(), 25 * 60 * 60 * 1000)
  })

  it("uses America/New_York for all-sites today", () => {
    const now = new Date("2026-10-22T18:00:00.000Z")
    const window = resolveOnDemandWindow({ period: "today", timezone: "America/New_York", now })
    assert.equal(window.start.toISOString(), "2026-10-22T04:00:00.000Z")
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
