import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  asOptionalEmail,
  asOptionalHttpUrl,
  asOptionalIsoDate,
  asOptionalString,
  asOptionalUuid,
  asRequiredEmail,
  asRequiredUuid,
  asTrimmedString,
} from "./kiosk-input.ts"
import { generateBadgeNumber } from "./badge-number.ts"

const UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const PHOTO = "https://cdn.example.com/visitor-photos/aaaa.jpg"

const WINDOWS_TIMEZONES = [
  "Eastern Standard Time",
  "Central Standard Time",
  "Mountain Standard Time",
  "Pacific Standard Time",
  "Alaska Standard Time",
  "Hawaii-Aleutian Standard Time",
  "Atlantic Standard Time",
  "Newfoundland Standard Time",
  "GMT Standard Time",
  "Greenwich Standard Time",
  "W. Europe Standard Time",
  "Central Europe Standard Time",
  "Romance Standard Time",
  "Central European Standard Time",
  "E. Europe Standard Time",
  "FLE Standard Time",
  "GTB Standard Time",
  "Russian Standard Time",
  "E. Africa Standard Time",
  "South Africa Standard Time",
  "Egypt Standard Time",
  "Morocco Standard Time",
  "W. Central Africa Standard Time",
  "Arab Standard Time",
  "Arabian Standard Time",
  "India Standard Time",
  "China Standard Time",
  "Tokyo Standard Time",
  "Korea Standard Time",
  "Singapore Standard Time",
  "SE Asia Standard Time",
  "West Asia Standard Time",
  "Pakistan Standard Time",
  "Bangladesh Standard Time",
  "AUS Eastern Standard Time",
  "AUS Central Standard Time",
  "E. Australia Standard Time",
  "Cen. Australia Standard Time",
  "W. Australia Standard Time",
  "New Zealand Standard Time",
  "Fiji Standard Time",
  "E. South America Standard Time",
  "Argentina Standard Time",
  "SA Pacific Standard Time",
  "Venezuela Standard Time",
  "Central America Standard Time",
  "SA Western Standard Time",
  "SA Eastern Standard Time",
  "UTC",
  "Coordinated Universal Time",
]

describe("optional kiosk helpers: missing vs invalid", () => {
  it("treats a missing key as not provided (null)", () => {
    assert.equal(asOptionalUuid(undefined), null)
    assert.equal(asOptionalString(undefined, 200), null)
    assert.equal(asOptionalEmail(undefined), null)
    assert.equal(asOptionalHttpUrl(undefined), null)
    assert.equal(asOptionalIsoDate(undefined), null)
  })

  it("treats explicit empty values as not provided (null)", () => {
    assert.equal(asOptionalUuid(null), null)
    assert.equal(asOptionalUuid(""), null)
    assert.equal(asOptionalString(null, 200), null)
    assert.equal(asOptionalString("", 200), null)
    assert.equal(asOptionalString("   ", 200), null)
    assert.equal(asOptionalEmail(null), null)
    assert.equal(asOptionalEmail(""), null)
    assert.equal(asOptionalHttpUrl(null), null)
    assert.equal(asOptionalHttpUrl(""), null)
    assert.equal(asOptionalIsoDate(null), null)
    assert.equal(asOptionalIsoDate(""), null)
  })

  it("returns undefined only for a present-but-invalid value", () => {
    assert.equal(asOptionalUuid("not-a-uuid"), undefined)
    assert.equal(asOptionalUuid(123), undefined)
    assert.equal(asOptionalString("x".repeat(21), 20), undefined)
    assert.equal(asOptionalString(42, 20), undefined)
    assert.equal(asOptionalEmail("not-an-email"), undefined)
    assert.equal(asOptionalEmail("missing-at.example.com"), undefined)
    assert.equal(asOptionalEmail("a".repeat(250) + "@x.y"), undefined)
    assert.equal(asOptionalHttpUrl("ftp://files.example.com/a"), undefined)
    assert.equal(asOptionalHttpUrl("/relative/path"), undefined)
    assert.equal(asOptionalIsoDate("not-a-date"), undefined)
    assert.equal(asOptionalIsoDate(20260101), undefined)
  })

  it("accepts valid values the kiosk and QR actually send", () => {
    assert.equal(asOptionalUuid(UUID), UUID)
    assert.equal(asOptionalString("Talus Ag", 200), "Talus Ag")
    assert.equal(asOptionalString("O'Reilly Construction, Inc.", 200), "O'Reilly Construction, Inc.")
    assert.equal(asOptionalEmail("jane.doe@talusag.com"), "jane.doe@talusag.com")
    assert.equal(asOptionalEmail("Jane.Doe+kiosk@TalusAg.com"), "jane.doe+kiosk@talusag.com")
    assert.equal(asOptionalHttpUrl(PHOTO), PHOTO)
    assert.equal(asOptionalIsoDate("2026-10-22T00:00:00.000Z"), "2026-10-22T00:00:00.000Z")
    assert.equal(asTrimmedString("Jane", 100), "Jane")
    assert.equal(asTrimmedString("O'Neill-Smith", 100), "O'Neill-Smith")
    assert.equal(asRequiredUuid(UUID), UUID)
    assert.equal(asRequiredEmail("host@talusag.com"), "host@talusag.com")
  })
})

describe("real kiosk / QR field limits", () => {
  it("accepts generated badge numbers and the legacy printed format", () => {
    const badge = generateBadgeNumber()
    assert.match(badge, /^V\d{5}$/)
    assert.equal(asOptionalString(badge, 20), badge)
    assert.equal(asOptionalString(badge, 40), badge)
    assert.equal(asOptionalString("V-1234", 20), "V-1234")
  })

  it("accepts every Windows timezone name the app maps (all under 64 chars)", () => {
    for (const name of WINDOWS_TIMEZONES) {
      assert.ok(name.length <= 64, `${name} is ${name.length} chars`)
      assert.equal(asOptionalString(name, 64), name)
    }
  })

  it("accepts visitor names and companies within the route limits", () => {
    assert.equal(asTrimmedString("Jane", 100), "Jane")
    assert.equal(asTrimmedString("Doe", 100), "Doe")
    assert.equal(asTrimmedString("Jane Doe", 200), "Jane Doe")
    assert.equal(asOptionalString("Talus Agriculture Holdings, LLC", 200), "Talus Agriculture Holdings, LLC")
  })
})
