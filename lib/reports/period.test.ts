import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  computeNextRunAt,
  displayPeriodStart,
  formatReportPeriodLabel,
  isScheduleDue,
  reportWindowTimezone,
  resolveOnDemandWindow,
  resolveReportPeriod,
  rollingWindow,
} from "./period.ts"
import { periodForSchedule } from "./schedule.ts"

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

const KENYA = { id: "kenya-farm", timezone: "Africa/Nairobi" }
const HOUSTON = { id: "houston-hq", timezone: "America/Chicago" }
const NO_TZ = { id: "no-zone", timezone: null }

const kenyaSchedule = {
  rangeType: "today" as const,
  lastNDays: null,
  timezone: "America/New_York",
  locationIds: [KENYA.id],
}

// Daily 10:00 America/New_York. After 2026-11-01 that is 15:00 UTC (EST).
const nov3Run = new Date("2026-11-03T15:00:00.000Z")
const nov4Run = new Date("2026-11-04T15:00:00.000Z")
const nov5Run = new Date("2026-11-05T15:00:00.000Z")
// Before the US fall-back, 10:00 New York is 14:00 UTC (EDT).
const oct30Run = new Date("2026-10-30T14:00:00.000Z")
const kenyaMorning = {
  oct30: "2026-10-30T04:35:00.000Z",
  nov3: "2026-11-03T04:35:00.000Z",
  nov4: "2026-11-04T04:35:00.000Z",
}

function inWindow(iso: string, period: { start: Date; end: Date }) {
  const ms = Date.parse(iso)
  return ms >= period.start.getTime() && ms < period.end.getTime()
}

describe("scheduled window timezone (single location)", () => {
  it("uses the site timezone for Today so Kenya 07:35 EAT is included after the Nov 1 DST change", () => {
    const nov3 = periodForSchedule(kenyaSchedule, nov3Run, [KENYA])
    const nov4 = periodForSchedule(kenyaSchedule, nov4Run, [KENYA])
    assert.equal(nov3.timezone, "Africa/Nairobi")
    assert.equal(nov3.start.toISOString(), "2026-11-02T21:00:00.000Z")
    assert.equal(nov4.start.toISOString(), "2026-11-03T21:00:00.000Z")
    assert.equal(inWindow(kenyaMorning.nov3, nov3), true)
    assert.equal(inWindow(kenyaMorning.nov4, nov4), true)
    const oldNyNov3 = resolveReportPeriod({
      rangeType: "today",
      timezone: "America/New_York",
      now: nov3Run,
    })
    assert.equal(oldNyNov3.start.toISOString(), "2026-11-03T05:00:00.000Z")
    assert.equal(inWindow(kenyaMorning.nov3, oldNyNov3), false)
  })

  it("keeps Oct 30 Today coverage for 07:35 Nairobi, matching the pre-DST New York window", () => {
    const kenya = periodForSchedule(kenyaSchedule, oct30Run, [KENYA])
    const oldNy = resolveReportPeriod({
      rangeType: "today",
      timezone: "America/New_York",
      now: oct30Run,
    })
    assert.equal(oldNy.start.toISOString(), "2026-10-30T04:00:00.000Z")
    assert.equal(inWindow(kenyaMorning.oct30, kenya), true)
    assert.equal(inWindow(kenyaMorning.oct30, oldNy), true)
  })

  it("uses the site timezone for Last 1 day so a Nov 5 run includes Nov 4 07:35 Nairobi", () => {
    const lastOne = { ...kenyaSchedule, rangeType: "last_n_days" as const, lastNDays: 1 }
    const nov5 = periodForSchedule(lastOne, nov5Run, [KENYA])
    const nov4 = periodForSchedule(lastOne, nov4Run, [KENYA])
    assert.equal(nov5.timezone, "Africa/Nairobi")
    assert.equal(nov5.start.toISOString(), "2026-11-03T21:00:00.000Z")
    assert.equal(nov5.end.toISOString(), "2026-11-04T21:00:00.000Z")
    assert.equal(inWindow(kenyaMorning.nov4, nov5), true)
    assert.equal(inWindow(kenyaMorning.nov3, nov4), true)
    const oldNyNov5 = resolveReportPeriod({
      rangeType: "last_n_days",
      lastNDays: 1,
      timezone: "America/New_York",
      now: nov5Run,
    })
    assert.equal(oldNyNov5.start.toISOString(), "2026-11-04T05:00:00.000Z")
    assert.equal(inWindow(kenyaMorning.nov4, oldNyNov5), false)
  })

  it("resolves Last 24 hours as elapsed time across the Nov 1 DST change", () => {
    const rolling = { ...kenyaSchedule, rangeType: "last_24_hours" as const }
    const nov3 = periodForSchedule(rolling, nov3Run, [KENYA])
    const nov4 = periodForSchedule(rolling, nov4Run, [KENYA])
    const nov5 = periodForSchedule(rolling, nov5Run, [KENYA])
    assert.equal(nov3.start.toISOString(), "2026-11-02T15:00:00.000Z")
    assert.equal(nov3.end.toISOString(), nov3Run.toISOString())
    assert.equal(nov3.end.getTime() - nov3.start.getTime(), 24 * 60 * 60 * 1000)
    assert.equal(nov4.end.getTime() - nov4.start.getTime(), 24 * 60 * 60 * 1000)
    assert.equal(inWindow(kenyaMorning.nov3, nov3), true)
    assert.equal(inWindow(kenyaMorning.nov4, nov4), true)
    assert.equal(inWindow(kenyaMorning.nov4, nov5), false)
    const acrossFallback = resolveReportPeriod({
      rangeType: "last_24_hours",
      timezone: "America/New_York",
      now: new Date("2026-11-02T15:00:00.000Z"),
    })
    assert.equal(acrossFallback.start.toISOString(), "2026-11-01T15:00:00.000Z")
    assert.equal(acrossFallback.end.getTime() - acrossFallback.start.getTime(), 24 * 60 * 60 * 1000)
  })
})

describe("scheduled window timezone fallbacks", () => {
  it("keeps the schedule timezone for multi-location and all-location schedules", () => {
    const multi = periodForSchedule(
      { ...kenyaSchedule, locationIds: [KENYA.id, HOUSTON.id] },
      nov3Run,
      [KENYA, HOUSTON],
    )
    const allSites = periodForSchedule({ ...kenyaSchedule, locationIds: [] }, nov3Run, [KENYA, HOUSTON])
    assert.equal(multi.timezone, "America/New_York")
    assert.equal(allSites.timezone, "America/New_York")
    assert.equal(multi.start.toISOString(), "2026-11-03T05:00:00.000Z")
    assert.equal(allSites.start.toISOString(), "2026-11-03T05:00:00.000Z")
  })

  it("falls back to the schedule timezone when the one site has no timezone", () => {
    const missing = periodForSchedule(
      { ...kenyaSchedule, locationIds: [NO_TZ.id] },
      nov3Run,
      [NO_TZ],
    )
    assert.equal(missing.timezone, "America/New_York")
    assert.equal(missing.start.toISOString(), "2026-11-03T05:00:00.000Z")
    assert.equal(
      reportWindowTimezone({
        selectedLocationIds: [NO_TZ.id],
        locations: [NO_TZ],
        fallbackTimezone: "America/New_York",
      }),
      "America/New_York",
    )
  })
})

describe("period labels", () => {
  it("includes the window timezone abbreviation", () => {
    const label = formatReportPeriodLabel({
      start: "2026-11-03T21:00:00.000Z",
      end: "2026-11-04T15:00:00.000Z",
      timezone: "Africa/Nairobi",
      title: "Today",
    })
    assert.match(label, /Today/)
    assert.match(label, /EAT|GMT\+3/)
    assert.equal(label.includes("\u2014"), false)
    assert.equal(
      displayPeriodStart("last_24_hours", "2026-11-04T21:00:00.000Z", "2026-11-04T15:00:00.000Z"),
      "2026-11-03T15:00:00.000Z",
    )
  })
})
