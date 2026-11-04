import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_DISPLAY_TIMEZONE,
  formatDateTimeWithZone,
  formatSiteDateTime,
  formatTimeWithZone,
  getTimezoneAbbreviation,
  isSameLocalDay,
  localDatetimeToUtc,
  localDayBounds,
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

describe("localDatetimeToUtc", () => {
  it("interprets datetime-local in the location timezone, not the runtime timezone", () => {
    const chicago = localDatetimeToUtc("2026-10-22T09:00", "America/Chicago")
    const nairobi = localDatetimeToUtc("2026-10-22T09:00", "Africa/Nairobi")
    const naive = new Date("2026-10-22T09:00")

    assert.ok(chicago)
    assert.ok(nairobi)
    assert.equal(chicago.toISOString(), "2026-10-22T14:00:00.000Z")
    assert.equal(nairobi.toISOString(), "2026-10-22T06:00:00.000Z")
    assert.notEqual(chicago.toISOString(), naive.toISOString())
    assert.notEqual(nairobi.toISOString(), chicago.toISOString())
  })

  it("accepts seconds and Windows timezone names", () => {
    const utc = localDatetimeToUtc("2026-10-22T00:00:00", "Central Standard Time")
    assert.ok(utc)
    assert.equal(utc.toISOString(), localDatetimeToUtc("2026-10-22T00:00", "America/Chicago")?.toISOString())
  })

  it("returns null for an invalid value", () => {
    assert.equal(localDatetimeToUtc("", "America/Chicago"), null)
    assert.equal(localDatetimeToUtc("not-a-date", "America/Chicago"), null)
  })
})

describe("localDayBounds and isSameLocalDay", () => {
  it("covers the Chicago calendar day around a UTC midnight instant", () => {
    const now = new Date("2026-10-22T03:30:00.000Z")
    const { start, end } = localDayBounds("America/Chicago", now)
    assert.equal(start.toISOString(), "2026-10-21T05:00:00.000Z")
    assert.equal(end.toISOString(), "2026-10-22T05:00:00.000Z")
    assert.equal(isSameLocalDay("2026-10-21T18:00:00.000Z", "America/Chicago", now), true)
    assert.equal(isSameLocalDay("2026-10-22T12:00:00.000Z", "America/Chicago", now), false)
  })
})

describe("formatDateTimeWithZone", () => {
  it("includes a short zone label at that instant", () => {
    const when = "2026-10-22T15:30:00.000Z"
    const stamp = formatDateTimeWithZone(when, "America/Chicago")
    const abbr = getTimezoneAbbreviation("America/Chicago", when)
    assert.match(stamp, /2026/)
    assert.match(stamp, new RegExp(`${abbr}$`))
    assert.match(stamp, /CDT/)
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

describe("formatSiteDateTime", () => {
  it("uses the sign-in site timezone, including Nairobi / Kenya Farm", () => {
    const when = "2026-10-22T15:30:00.000Z"
    const nairobi = formatSiteDateTime(when, "Africa/Nairobi")
    const windows = formatSiteDateTime(when, "E. Africa Standard Time")
    assert.equal(nairobi, windows)
    assert.match(nairobi, /EAT|GMT\+3/)
    assert.match(nairobi, /6:30/)
    assert.equal(nairobi.includes("CDT"), false)
    assert.equal(nairobi.includes("EDT"), false)
  })

  it("uses the abbreviation at that instant, not today's offset", () => {
    const winter = formatSiteDateTime("2026-01-15T18:00:00.000Z", "America/Chicago")
    const summer = formatSiteDateTime("2026-07-15T17:00:00.000Z", "America/Chicago")
    assert.match(winter, /CST/)
    assert.match(summer, /CDT/)
  })

  it("falls back to America/New_York when the site has no timezone", () => {
    const when = "2026-01-15T18:00:00.000Z"
    const fallback = formatSiteDateTime(when, null)
    const empty = formatSiteDateTime(when, "")
    const explicit = formatSiteDateTime(when, "America/New_York")
    assert.equal(fallback, explicit)
    assert.equal(empty, explicit)
    assert.match(fallback, /EST/)
    assert.equal(formatSiteDateTime("", "Africa/Nairobi"), "")
    assert.equal(formatSiteDateTime("not-a-date", "Africa/Nairobi"), "")
  })
})
