import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_DISPLAY_TIMEZONE,
  formatDateTimeWithZone,
  formatTimeWithZone,
  getTimezoneAbbreviation,
  resolveDisplayTimeZone,
  startOfDayInTimezone,
  toIANATimezone,
  zonedTimeToUtc,
} from "./timezone.ts"

describe("toIANATimezone", () => {
  it("maps Windows names used on live locations to IANA", () => {
    assert.equal(toIANATimezone("E. Africa Standard Time"), "Africa/Nairobi")
    assert.equal(toIANATimezone("Central Standard Time"), "America/Chicago")
    assert.equal(toIANATimezone("Pacific Standard Time"), "America/Los_Angeles")
    assert.equal(toIANATimezone("UTC"), "UTC")
  })

  it("passes IANA names through and defaults empty values to UTC", () => {
    assert.equal(toIANATimezone("America/Chicago"), "America/Chicago")
    assert.equal(toIANATimezone("Africa/Nairobi"), "Africa/Nairobi")
    assert.equal(toIANATimezone(""), "UTC")
  })
})

describe("resolveDisplayTimeZone", () => {
  it("falls back to America/New_York when a location has no timezone", () => {
    assert.equal(resolveDisplayTimeZone(null), DEFAULT_DISPLAY_TIMEZONE)
    assert.equal(resolveDisplayTimeZone(""), "America/New_York")
    assert.equal(resolveDisplayTimeZone("   "), "America/New_York")
    assert.equal(resolveDisplayTimeZone("America/Chicago"), "America/Chicago")
    assert.equal(resolveDisplayTimeZone("Eastern Standard Time"), "America/New_York")
  })
})

describe("startOfDayInTimezone", () => {
  it("uses the location timezone, not UTC midnight", () => {
    // 2026-10-22 00:30 UTC is still 2026-10-21 evening in Chicago.
    const now = new Date("2026-10-22T00:30:00.000Z")
    const chicago = startOfDayInTimezone("America/Chicago", now)
    const nairobi = startOfDayInTimezone("E. Africa Standard Time", now)
    const utc = startOfDayInTimezone("UTC", now)

    assert.equal(chicago.toISOString(), "2026-10-21T05:00:00.000Z")
    assert.equal(nairobi.toISOString(), "2026-10-21T21:00:00.000Z")
    assert.equal(utc.toISOString(), "2026-10-22T00:00:00.000Z")
    assert.notEqual(chicago.toISOString(), utc.toISOString())
  })

  it("accepts a Windows name and the matching IANA name as the same day", () => {
    const now = new Date("2026-10-22T12:00:00.000Z")
    assert.equal(
      startOfDayInTimezone("Central Standard Time", now).toISOString(),
      startOfDayInTimezone("America/Chicago", now).toISOString(),
    )
  })
})

describe("zonedTimeToUtc", () => {
  it("converts a Nairobi wall-clock midnight to UTC", () => {
    const utc = zonedTimeToUtc(2026, 10, 22, 0, 0, 0, "Africa/Nairobi")
    assert.equal(utc.toISOString(), "2026-10-21T21:00:00.000Z")
  })
})

describe("formatDateTimeWithZone", () => {
  it("includes a short zone label", () => {
    const stamp = formatDateTimeWithZone("2026-10-22T15:30:00.000Z", "America/Chicago")
    const abbr = getTimezoneAbbreviation("America/Chicago")
    assert.match(stamp, /2026/)
    assert.match(stamp, new RegExp(`${abbr}$`))
    assert.equal(stamp.includes("GMT+"), false)
  })

  it("formats a Windows timezone the same as its IANA pair", () => {
    const when = "2026-10-22T15:30:00.000Z"
    assert.equal(
      formatTimeWithZone(when, "Central Standard Time"),
      formatTimeWithZone(when, "America/Chicago"),
    )
  })
})
