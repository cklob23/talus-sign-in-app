import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decideExistingRun } from "./idempotency.ts"
import { missingColumnName, parseScheduleBody, rowToSchedule, scheduleToRow, writeReportSchedule } from "./schedule.ts"

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
    assert.equal(
      missingColumnName({
        message: 'column "include_table" of relation "report_schedules" does not exist',
      }),
      "include_table",
    )
    assert.equal(
      missingColumnName({
        message: "Could not find the 'include_table' column of 'report_schedules' in the schema cache",
      }),
      "include_table",
    )
  })

  const PGRST204 = {
    code: "PGRST204",
    message: "Could not find the 'include_table' column of 'report_schedules' in the schema cache",
  }

  function mockScheduleClient(seen: Array<Record<string, unknown>>, rejectIncludeTable = true) {
    const decide = (payload: Record<string, unknown>) => {
      seen.push({ ...payload })
      if (rejectIncludeTable && "include_table" in payload) {
        return { data: null, error: PGRST204 }
      }
      return { data: { id: "sch-1", ...payload }, error: null }
    }
    return {
      from() {
        return {
          insert(payload: Record<string, unknown>) {
            const result = decide(payload)
            return { select: () => ({ single: async () => result }) }
          },
          update(payload: Record<string, unknown>) {
            return {
              eq() {
                const result = decide(payload)
                return { select: () => ({ single: async () => result }) }
              },
            }
          },
        }
      },
    }
  }

  it("retries create without include_table on PostgREST PGRST204", async () => {
    const seen: Array<Record<string, unknown>> = []
    const written = await writeReportSchedule(mockScheduleClient(seen), "insert", {
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

  const sampleInput = {
    name: "Nightly visitors",
    kind: "visitors" as const,
    locationIds: [],
    visitorTypeIds: [],
    rangeType: "previous_day" as const,
    lastNDays: null,
    frequency: "daily" as const,
    weekday: null,
    monthDay: null,
    sendTime: "08:00",
    timezone: "America/Chicago",
    recipients: ["caleb@talusag.com"],
    format: "csv" as const,
    durationUnit: "minutes" as const,
    includeTable: false,
    enabled: false,
  }

  it("omits include_table on insert when the flag is off so create still works before SQL 017", async () => {
    const seen: Array<Record<string, unknown>> = []
    const created = scheduleToRow(sampleInput, null)
    assert.equal(created.include_table, false)
    const written = await writeReportSchedule(mockScheduleClient(seen), "insert", created)
    assert.equal(written.error, null)
    assert.equal(seen.length, 1)
    assert.equal("include_table" in seen[0], false)
  })

  it("sends include_table false on update so unchecking the box clears a stored true", async () => {
    const seen: Array<Record<string, unknown>> = []
    const created = scheduleToRow(sampleInput, null)
    const written = await writeReportSchedule(
      mockScheduleClient(seen, false),
      "update",
      created,
      "sch-1",
    )
    assert.equal(written.error, null)
    assert.equal(seen.length, 1)
    assert.equal(seen[0].include_table, false)
    assert.equal(seen[0].enabled, false)
  })

  it("retries an uncheck update without include_table when SQL 017 is still absent", async () => {
    const seen: Array<Record<string, unknown>> = []
    const created = scheduleToRow(sampleInput, null)
    const written = await writeReportSchedule(mockScheduleClient(seen), "update", created, "sch-1")
    assert.equal(written.error, null)
    assert.equal(seen.length, 2)
    assert.equal(seen[0].include_table, false)
    assert.equal("include_table" in seen[1], false)
  })

  it("retries edit without include_table on PGRST204", async () => {
    const seen: Array<Record<string, unknown>> = []
    const written = await writeReportSchedule(
      mockScheduleClient(seen),
      "update",
      { name: "Edited nightly", include_table: true, duration_unit: "hours" },
      "sch-1",
    )
    assert.equal(written.error, null)
    assert.equal(seen.length, 2)
    assert.equal(seen[0].include_table, true)
    assert.equal("include_table" in seen[1], false)
    assert.equal(seen[1].name, "Edited nightly")
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
