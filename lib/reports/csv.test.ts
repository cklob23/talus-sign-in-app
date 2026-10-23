import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { csvFilename, csvWithBom, escapeCsvCell, toCsv } from "./csv.ts"
import {
  buildEmployeeCsvRows,
  buildTrainingCsvRows,
  buildVisitorCsvRows,
  formatReportDateTime,
  trainingStatus,
} from "./rows.ts"
import { decideExistingRun } from "./idempotency.ts"
import { invalidRecipientTokens, isTalusRecipient, normalizeRecipient, parseRecipientList } from "./types.ts"

describe("CSV builders", () => {
  it("quotes commas and doubled quotes", () => {
    assert.equal(escapeCsvCell('Acme, "Co"'), '"Acme, ""Co"""')
    assert.equal(toCsv([["Name", "Co"], ['Ada "A"', "Acme, Inc"]]), `"Name","Co"\n"Ada ""A""","Acme, Inc"`)
  })

  it("adds a UTF-8 BOM and a trailing newline", () => {
    const csv = csvWithBom([["A"], ["B"]])
    assert.equal(csv.startsWith("\uFEFF"), true)
    assert.equal(csv.endsWith("\n"), true)
  })

  it("builds visitor rows in the site timezone with an abbreviation", () => {
    const rows = buildVisitorCsvRows([
      {
        sign_in_time: "2026-10-22T15:30:00.000Z",
        sign_out_time: "2026-10-22T17:00:00.000Z",
        visitor: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com", company: "Analytical" },
        host: { name: "Hiro Iwanaga" },
        visitor_type: { name: "Contractor" },
        location: { name: "Houston HQ", timezone: "America/Chicago" },
      },
    ])
    assert.equal(rows[0][6], "Sign in")
    const stamp = rows[1][6]
    assert.match(stamp, /2026/)
    assert.match(stamp, /CDT|CST|GMT-/)
    assert.equal(rows[1][8], "90")
    assert.equal(rows[0][8], "Duration (min)")
    const hours = buildVisitorCsvRows(
      [
        {
          sign_in_time: "2026-10-22T15:30:00.000Z",
          sign_out_time: "2026-10-22T17:00:00.000Z",
          visitor: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com", company: "Analytical" },
          host: { name: "Hiro Iwanaga" },
          visitor_type: { name: "Contractor" },
          location: { name: "Houston HQ", timezone: "America/Chicago" },
        },
      ],
      "hours",
    )
    assert.equal(hours[0][8], "Duration (hr)")
    assert.equal(hours[1][8], "1.5")
    assert.equal(stamp.includes("UTC"), false)
    assert.equal(csvFilename("visitors", "2026-10-15T00:00:00.000Z", "2026-10-22T00:00:00.000Z"), "visitor-sign-ins-2026-10-15-to-2026-10-22.csv")
  })

  it("builds employee and training rows with cleared or expired status", () => {
    const now = Date.parse("2026-10-22T12:00:00.000Z")
    const employees = buildEmployeeCsvRows([
      {
        sign_in_time: "2026-10-22T13:00:00.000Z",
        sign_out_time: null,
        auto_signed_in: true,
        profile: { full_name: "Caleb Klob", email: "caleb@talusag.com", role: "admin", department: "IT" },
        location: { name: "Nairobi", timezone: "Africa/Nairobi" },
      },
    ])
    assert.equal(employees[1][5], "Yes")
    assert.equal(employees[1][8], "")
    assert.match(employees[1][6], /EAT|GMT\+3/)

    const training = buildTrainingCsvRows(
      [
        {
          completed_at: "2026-10-01T10:00:00.000Z",
          expires_at: "2027-10-01T10:00:00.000Z",
          source: "training_link",
          visitor: { first_name: "Diego", last_name: "M", email: "diego@example.com", company: "Acme" },
          visitor_type: { name: "Contractor" },
          location: { name: "Houston HQ", timezone: "America/Chicago" },
        },
        {
          completed_at: "2024-10-01T10:00:00.000Z",
          expires_at: "2025-10-01T10:00:00.000Z",
          source: "kiosk",
          visitor: { first_name: "Old", last_name: "Visit", email: "old@example.com", company: "Acme" },
          visitor_type: { name: "Guest" },
          location: { name: "Houston HQ", timezone: "America/Chicago" },
        },
      ],
      now,
    )
    assert.equal(training[1][7], "Cleared")
    assert.equal(training[1][8], "Training link")
    assert.equal(training[2][7], "Expired")
    assert.equal(training[2][8], "Kiosk")
    assert.equal(trainingStatus("2026-10-22T11:00:00.000Z", now), "Expired")
    assert.equal(trainingStatus(null, now), "Cleared")
  })

  it("uses the abbreviation at that instant, not today's offset", () => {
    const winter = formatReportDateTime("2026-01-15T18:00:00.000Z", "America/Chicago")
    const summer = formatReportDateTime("2026-07-15T17:00:00.000Z", "America/Chicago")
    assert.match(winter, /CST/)
    assert.match(summer, /CDT/)
  })
})

describe("recipient and idempotency helpers", () => {
  it("warns for non-Talus addresses and de-dupes recipients", () => {
    assert.equal(isTalusRecipient("caleb@talusag.com"), true)
    assert.equal(isTalusRecipient("Caleb@TalusAg.com"), true)
    assert.equal(isTalusRecipient("vendor@example.com"), false)
    assert.deepEqual(parseRecipientList("caleb@talusag.com, vendor@example.com; CALEB@talusag.com"), [
      "caleb@talusag.com",
      "vendor@example.com",
    ])
  })

  it("rejects invalid recipient addresses and keeps any valid email", () => {
    assert.equal(normalizeRecipient(""), null)
    assert.equal(normalizeRecipient("not-an-email"), null)
    assert.equal(normalizeRecipient("missing-domain@"), null)
    assert.equal(normalizeRecipient("a@b"), null)
    assert.equal(normalizeRecipient("spaces emma@talusag.com"), null)
    assert.equal(normalizeRecipient("ops@talusag.com"), "ops@talusag.com")
    assert.deepEqual(invalidRecipientTokens("okay@talusag.com, nope, also@bad"), ["nope", "also@bad"])
    assert.deepEqual(parseRecipientList("okay@talusag.com, nope, OKAY@talusag.com"), ["okay@talusag.com"])
  })

  it("names all-time CSV files without a 1970 start date", () => {
    assert.equal(csvFilename("visitors", "1970-01-01T00:00:00.000Z", "2026-10-22T18:00:00.000Z"), "visitor-sign-ins-all-time.csv")
  })

  it("treats a sent scheduled run as already done and reuses a failed run", () => {
    assert.equal(decideExistingRun(null), "insert")
    assert.equal(
      decideExistingRun({ status: "sent", started_at: "2026-10-22T13:00:00.000Z" }),
      "skip_sent",
    )
    assert.equal(
      decideExistingRun({ status: "failed", started_at: "2026-10-22T13:00:00.000Z" }),
      "reuse",
    )
    const now = Date.parse("2026-10-22T13:05:00.000Z")
    assert.equal(
      decideExistingRun({ status: "running", started_at: "2026-10-22T13:04:00.000Z" }, now),
      "skip_inflight",
    )
    assert.equal(
      decideExistingRun({ status: "running", started_at: "2026-10-22T12:50:00.000Z" }, now),
      "reuse",
    )
  })
})
