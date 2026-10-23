import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_EMPLOYEE_SIGNOUT_MINUTES,
  DEFAULT_EMPLOYEE_SIGNOUT_TIME,
  DEFAULT_VISITOR_SIGNOUT_MINUTES,
  DEFAULT_VISITOR_SIGNOUT_TIME,
  autoSignoutEmailKey,
  formatMinutesAsTime,
  isEmployeeDailyWindow,
  isOverrideSet,
  isWithinTriggerWindow,
  lastElapsedVisitorCutoff,
  locationOverrideFromRow,
  parseBoolOverride,
  parseTimeOverride,
  parseTimeToMinutes,
  resolveAutoSignOutSettings,
  selectDueVisitorIds,
  visitorDueForEndOfDaySignOut,
} from "./auto-signout.ts"

const CHICAGO = "America/Chicago"
const NAIROBI = "Africa/Nairobi"
const MADRID = "Europe/Madrid"
const VISITOR_TARGET = DEFAULT_VISITOR_SIGNOUT_MINUTES
const EMPLOYEE_TARGET = DEFAULT_EMPLOYEE_SIGNOUT_MINUTES

describe("visitor end-of-day catch-up", () => {
  it("does not sign out a visitor still inside today's window", () => {
    // 15:00 Chicago on 22 Oct 2026 is 20:00 UTC.
    const now = new Date("2026-10-22T20:00:00.000Z")
    const signedInThisMorning = new Date("2026-10-22T14:00:00.000Z")
    assert.equal(visitorDueForEndOfDaySignOut(signedInThisMorning, now, CHICAGO, VISITOR_TARGET), false)
  })

  it("signs out leftovers from an earlier day before today's cutoff", () => {
    const now = new Date("2026-10-22T20:00:00.000Z")
    const leftover = new Date("2026-10-21T16:00:00.000Z")
    assert.equal(visitorDueForEndOfDaySignOut(leftover, now, CHICAGO, VISITOR_TARGET), true)
  })

  it("signs out anyone still open after today's cutoff, including a missed 15-minute window", () => {
    // 23:50 Chicago is 04:50 UTC the next calendar day.
    const now = new Date("2026-10-23T04:50:00.000Z")
    const signedInThisMorning = new Date("2026-10-22T14:00:00.000Z")
    assert.equal(visitorDueForEndOfDaySignOut(signedInThisMorning, now, CHICAGO, VISITOR_TARGET), true)
    const cutoff = lastElapsedVisitorCutoff(now, CHICAGO, VISITOR_TARGET)
    assert.ok(cutoff.getTime() < now.getTime())
  })

  it("does not sign out a visitor who arrived after today's cutoff", () => {
    const now = new Date("2026-10-23T04:50:00.000Z")
    const lateArrival = new Date("2026-10-23T04:48:00.000Z")
    assert.equal(visitorDueForEndOfDaySignOut(lateArrival, now, CHICAGO, VISITOR_TARGET), false)
  })

  it("selects only the due ids and keeps the email key stable per sign-in", () => {
    const now = new Date("2026-10-22T20:00:00.000Z")
    const ids = selectDueVisitorIds(
      [
        { id: "old", sign_in_time: "2026-10-21T16:00:00.000Z" },
        { id: "today", sign_in_time: "2026-10-22T14:00:00.000Z" },
      ],
      now,
      CHICAGO,
      VISITOR_TARGET,
    )
    assert.deepEqual(ids, ["old"])
    assert.equal(autoSignoutEmailKey("old"), "auto-signout:old")
  })

  it("is idempotent: the same leftover is still due until signed out, and the email key does not change", () => {
    const firstRun = new Date("2026-10-22T05:00:00.000Z")
    const laterRun = new Date("2026-10-22T20:00:00.000Z")
    const leftover = { id: "abc", sign_in_time: "2026-10-21T16:00:00.000Z" }
    assert.deepEqual(selectDueVisitorIds([leftover], firstRun, CHICAGO, VISITOR_TARGET), ["abc"])
    assert.deepEqual(selectDueVisitorIds([leftover], laterRun, CHICAGO, VISITOR_TARGET), ["abc"])
    assert.equal(autoSignoutEmailKey("abc"), autoSignoutEmailKey("abc"))
  })
})

describe("resolveAutoSignOutSettings override vs fallback", () => {
  it("uses global 18:00 / 23:45 when a location has no override", () => {
    const resolved = resolveAutoSignOutSettings({})
    assert.equal(resolved.employeesEnabled, true)
    assert.equal(resolved.visitorsEnabled, true)
    assert.equal(resolved.employeesTime, DEFAULT_EMPLOYEE_SIGNOUT_TIME)
    assert.equal(resolved.visitorsTime, DEFAULT_VISITOR_SIGNOUT_TIME)
    assert.equal(resolved.employeesTargetMinutes, DEFAULT_EMPLOYEE_SIGNOUT_MINUTES)
    assert.equal(resolved.visitorsTargetMinutes, DEFAULT_VISITOR_SIGNOUT_MINUTES)

    const unsetLocation = resolveAutoSignOutSettings(
      {
        employeesEnabled: true,
        employeesTime: "18:00",
        visitorsEnabled: true,
        visitorsTime: "23:45",
      },
      locationOverrideFromRow({
        auto_sign_out_employees: null,
        auto_sign_out_employees_time: null,
        auto_sign_out_visitors: null,
        auto_sign_out_visitors_time: null,
      }),
    )
    assert.equal(unsetLocation.employeesTime, "18:00")
    assert.equal(unsetLocation.visitorsTime, "23:45")
    assert.equal(unsetLocation.employeesEnabled, true)
    assert.equal(unsetLocation.visitorsEnabled, true)
  })

  it("falls back to the legacy auto_sign_out key for the visitor toggle", () => {
    const resolved = resolveAutoSignOutSettings({ legacyAutoSignOut: false })
    assert.equal(resolved.visitorsEnabled, false)
    assert.equal(resolved.employeesEnabled, true)
  })

  it("lets a location turn auto sign-out on when the global toggle is off", () => {
    const resolved = resolveAutoSignOutSettings(
      { employeesEnabled: false, visitorsEnabled: false },
      { employeesEnabled: true, visitorsEnabled: true },
    )
    assert.equal(resolved.employeesEnabled, true)
    assert.equal(resolved.visitorsEnabled, true)
    assert.equal(resolved.employeesTime, "18:00")
    assert.equal(resolved.visitorsTime, "23:45")
  })

  it("lets a location override enable and time independently", () => {
    const resolved = resolveAutoSignOutSettings(
      {
        employeesEnabled: true,
        employeesTime: "18:00",
        visitorsEnabled: true,
        visitorsTime: "23:45",
      },
      {
        employeesEnabled: false,
        employeesTime: "17:00",
        visitorsTime: "21:30",
      },
    )
    assert.equal(resolved.employeesEnabled, false)
    assert.equal(resolved.employeesTime, "17:00")
    assert.equal(resolved.employeesTargetMinutes, 17 * 60)
    assert.equal(resolved.visitorsEnabled, true)
    assert.equal(resolved.visitorsTime, "21:30")
    assert.equal(resolved.visitorsTargetMinutes, 21 * 60 + 30)
  })

  it("keeps the global time when only the enable flag is overridden", () => {
    const resolved = resolveAutoSignOutSettings(
      { employeesTime: "18:00", visitorsTime: "23:45" },
      { employeesEnabled: false },
    )
    assert.equal(resolved.employeesEnabled, false)
    assert.equal(resolved.employeesTime, "18:00")
    assert.equal(resolved.visitorsTime, "23:45")
  })

  it("treats empty string overrides as unset", () => {
    assert.equal(isOverrideSet(""), false)
    assert.equal(isOverrideSet(null), false)
    assert.equal(isOverrideSet(undefined), false)
    assert.equal(isOverrideSet(false), true)
    const resolved = resolveAutoSignOutSettings(
      { employeesTime: "18:00", visitorsTime: "23:45" },
      { employeesTime: "", visitorsEnabled: "" },
    )
    assert.equal(resolved.employeesTime, "18:00")
    assert.equal(resolved.visitorsEnabled, true)
  })

  it("accepts JSON true/false and string booleans on overrides", () => {
    assert.deepEqual(parseBoolOverride(undefined), { ok: true, set: false })
    assert.deepEqual(parseBoolOverride(null), { ok: true, set: true, value: null })
    assert.deepEqual(parseBoolOverride("true"), { ok: true, set: true, value: true })
    assert.deepEqual(parseBoolOverride(false), { ok: true, set: true, value: false })
    assert.equal(parseBoolOverride("maybe").ok, false)

    assert.deepEqual(parseTimeOverride(""), { ok: true, set: true, value: null })
    assert.deepEqual(parseTimeOverride("6:05"), { ok: true, set: true, value: "06:05" })
    assert.equal(parseTimeOverride("25:00").ok, false)
    assert.equal(parseTimeToMinutes("18:00"), EMPLOYEE_TARGET)
    assert.equal(formatMinutesAsTime(EMPLOYEE_TARGET), "18:00")
  })
})

describe("timezone local windows at 18:00", () => {
  it("opens the employee 15-minute window in each location timezone", () => {
    // 22 Oct 2026: Chicago CDT (UTC-5), Nairobi EAT (UTC+3), Madrid CEST (UTC+2).
    const chicagoInWindow = new Date("2026-10-22T23:05:00.000Z") // 18:05 CT
    const nairobiInWindow = new Date("2026-10-22T15:05:00.000Z") // 18:05 EAT
    const madridInWindow = new Date("2026-10-22T16:05:00.000Z") // 18:05 Madrid

    assert.equal(isEmployeeDailyWindow(chicagoInWindow, CHICAGO, EMPLOYEE_TARGET), true)
    assert.equal(isEmployeeDailyWindow(chicagoInWindow, NAIROBI, EMPLOYEE_TARGET), false)
    assert.equal(isEmployeeDailyWindow(chicagoInWindow, MADRID, EMPLOYEE_TARGET), false)

    assert.equal(isEmployeeDailyWindow(nairobiInWindow, NAIROBI, EMPLOYEE_TARGET), true)
    assert.equal(isEmployeeDailyWindow(nairobiInWindow, CHICAGO, EMPLOYEE_TARGET), false)
    assert.equal(isEmployeeDailyWindow(nairobiInWindow, MADRID, EMPLOYEE_TARGET), false)

    assert.equal(isEmployeeDailyWindow(madridInWindow, MADRID, EMPLOYEE_TARGET), true)
    assert.equal(isEmployeeDailyWindow(madridInWindow, CHICAGO, EMPLOYEE_TARGET), false)
    assert.equal(isEmployeeDailyWindow(madridInWindow, NAIROBI, EMPLOYEE_TARGET), false)
  })

  it("closes the employee window 15 minutes after the local time", () => {
    const chicagoJustAfter = new Date("2026-10-22T23:14:00.000Z") // 18:14 CT
    const chicagoTooLate = new Date("2026-10-22T23:15:00.000Z") // 18:15 CT
    assert.equal(isEmployeeDailyWindow(chicagoJustAfter, CHICAGO, EMPLOYEE_TARGET), true)
    assert.equal(isEmployeeDailyWindow(chicagoTooLate, CHICAGO, EMPLOYEE_TARGET), false)
    assert.equal(isWithinTriggerWindow(18 * 60 + 14, EMPLOYEE_TARGET), true)
    assert.equal(isWithinTriggerWindow(18 * 60 + 15, EMPLOYEE_TARGET), false)
  })

  it("uses an employee time override in that location timezone", () => {
    const resolved = resolveAutoSignOutSettings(
      { employeesTime: "18:00" },
      { employeesTime: "17:00" },
    )
    const nairobi1705Utc = new Date("2026-10-22T14:05:00.000Z") // 17:05 EAT
    const nairobi1805Utc = new Date("2026-10-22T15:05:00.000Z") // 18:05 EAT
    assert.equal(isEmployeeDailyWindow(nairobi1705Utc, NAIROBI, resolved.employeesTargetMinutes), true)
    assert.equal(isEmployeeDailyWindow(nairobi1805Utc, NAIROBI, resolved.employeesTargetMinutes), false)
  })

  it("applies visitor cutoff in the location timezone after the resolved local time", () => {
    const signedInMorningUtc = new Date("2026-10-22T08:00:00.000Z")
    const afterNairobiCutoff = new Date("2026-10-22T21:00:00.000Z") // 00:00 next day EAT, after 23:45
    const beforeChicagoCutoff = new Date("2026-10-22T21:00:00.000Z") // 16:00 CT, before 23:45

    assert.equal(
      visitorDueForEndOfDaySignOut(signedInMorningUtc, afterNairobiCutoff, NAIROBI, VISITOR_TARGET),
      true,
    )
    assert.equal(
      visitorDueForEndOfDaySignOut(signedInMorningUtc, beforeChicagoCutoff, CHICAGO, VISITOR_TARGET),
      false,
    )
  })
})
