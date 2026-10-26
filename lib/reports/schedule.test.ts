import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decideExistingRun } from "./idempotency.ts"
import { missingColumnName, parseScheduleBody, rowToSchedule, writeReportSchedule } from "./schedule.ts"

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
    assert.equal(parsed.value.durationUnit, "minutes")
    assert.equal(parsed.value.includeTable, false)
    assert.equal(parsed.value.locationIds.length, 0)
  })

  it("defaults includeTable off and accepts the email-table flag", () => {
    const parsed = parseScheduleBody({ ...base, includeTable: true })
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.equal(parsed.value.includeTable, true)
    assert.equal(parseScheduleBody({ ...base, include_table: true }).ok, true)
    const off = parseScheduleBody(base)
    assert.equal(off.ok, true)
    if (!off.ok) return
    assert.equal(off.value.includeTable, false)
  })

  it("accepts hours as the duration unit for visitor and employee reports", () => {
    const parsed = parseScheduleBody({ ...base, durationUnit: "hours" })
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.equal(parsed.value.durationUnit, "hours")
    assert.equal(parseScheduleBody({ ...base, duration_unit: "minutes" }).ok, true)
    assert.equal(parseScheduleBody({ ...base, durationUnit: "days" }).ok, false)
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

describe("schedule row hydrate and optional writes", () => {
  it("treats a missing include_table column as false", () => {
    const schedule = rowToSchedule({
      id: "sch-1",
      name: "Nightly visitors",
      kind: "visitors",
      location_ids: [],
      visitor_type_ids: [],
      range_type: "previous_day",
      frequency: "daily",
      send_time: "08:00",
      timezone: "America/Chicago",
      recipients: ["caleb@talusag.com"],
      format: "csv",
    })
    assert.equal(schedule.includeTable, false)
    assert.equal(schedule.durationUnit, "minutes")
    assert.equal(missingColumnName({ message: 'column "include_table" does not exist' }), "include_table")
  })

  it("retries schedule writes without include_table on Postgres 42703", async () => {
    const seen: Array<Record<string, unknown>> = []
    const admin = {
      from() {
        return {
          insert(payload: Record<string, unknown>) {
            seen.push(payload)
            const result =
              "include_table" in payload
                ? { data: null, error: { code: "42703", message: 'column "include_table" does not exist' } }
                : { data: { id: "sch-1", ...payload }, error: null }
            return {
              select() {
                return {
                  single: async () => result,
                }
              },
            }
          },
        }
      },
    }
    const written = await writeReportSchedule(admin, "insert", {
      name: "Nightly visitors",
      include_table: true,
      duration_unit: "minutes",
    })
    assert.equal(written.error, null)
    assert.equal(seen.length, 2)
    assert.equal("include_table" in seen[0], true)
    assert.equal("include_table" in seen[1], false)
    assert.equal(seen[1].duration_unit, "minutes")
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
