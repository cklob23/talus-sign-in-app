import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderReportEmail } from "./email.ts"
import { buildVisitorCsvRows } from "./rows.ts"
import { renderReportTable } from "./table.ts"

describe("report email", () => {
  it("uses the v2 email shell and avoids em dashes", () => {
    const mail = renderReportEmail({
      scheduleName: "Nightly visitor log",
      kind: "visitors",
      periodStart: "2026-10-21T05:00:00.000Z",
      periodEnd: "2026-10-22T05:00:00.000Z",
      timezone: "America/Chicago",
      locationNames: ["Houston HQ"],
      rowCount: 12,
      format: "both",
      csvAttached: true,
      logoUrl: "",
    })
    assert.match(mail.html, /Talus Ag Visitor Management/)
    assert.match(mail.html, /Nightly visitor log/)
    assert.match(mail.html, /Visitor sign-ins/)
    assert.match(mail.html, /Houston HQ/)
    assert.match(mail.html, /The CSV is attached/)
    assert.match(mail.html, /<meta name="color-scheme" content="light only">/)
    assert.match(mail.html, /<meta name="supported-color-schemes" content="light">/)
    assert.equal(mail.html.includes("prefers-color-scheme: dark"), false)
    assert.equal(mail.html.includes("\u2014"), false)
    assert.equal(mail.text.includes("\u2014"), false)
    assert.match(mail.subject, /Nightly visitor log/)
  })

  it("embeds an escaped report table when provided", () => {
    const mail = renderReportEmail({
      scheduleName: "Nightly visitor log",
      kind: "visitors",
      periodStart: "2026-10-21T05:00:00.000Z",
      periodEnd: "2026-10-22T05:00:00.000Z",
      timezone: "America/Chicago",
      locationNames: ["Houston HQ"],
      rowCount: 2,
      format: "both",
      csvAttached: true,
      tableHtml: "<table><tr><th>Name</th></tr><tr><td>Ada &amp; Co</td></tr></table>",
      tableText: "Name\nAda & Co",
    })
    assert.match(mail.html, /The report table is included below/)
    assert.match(mail.html, /<table><tr><th>Name<\/th><\/tr><tr><td>Ada &amp; Co<\/td><\/tr><\/table>/)
    assert.match(mail.text, /Ada & Co/)
    const personal = mail.html.indexOf("This report includes personal data")
    const table = mail.html.indexOf("<table><tr><th>Name</th>")
    const intro = mail.html.indexOf("The report table is included below")
    assert.ok(personal >= 0 && intro > personal && table > intro)
  })

  it("does not repeat the empty-report sentence when no table markup is passed", () => {
    const mail = renderReportEmail({
      scheduleName: "Nightly visitor log",
      kind: "visitors",
      periodStart: "2026-10-21T05:00:00.000Z",
      periodEnd: "2026-10-22T05:00:00.000Z",
      timezone: "America/Chicago",
      locationNames: ["Houston HQ"],
      rowCount: 0,
      format: "csv",
      csvAttached: false,
      tableHtml: "",
    })
    assert.equal((mail.html.match(/No rows matched this period/g) || []).length, 1)
    assert.equal(mail.html.includes("The report table is included below"), false)
  })

  it("labels an all-time ad-hoc period without a 1970 start date", () => {
    const mail = renderReportEmail({
      scheduleName: "Ad-hoc visitor sign-ins",
      kind: "visitors",
      periodStart: "1970-01-01T00:00:00.000Z",
      periodEnd: "2026-10-22T18:00:00.000Z",
      timezone: "America/New_York",
      locationNames: [],
      rowCount: 40,
      format: "summary",
      csvAttached: false,
      badge: "Ad-hoc report",
      periodLabel: "All time",
    })
    assert.match(mail.html, /Ad-hoc report/)
    assert.match(mail.html, /All time/)
    assert.equal(mail.html.includes("1970"), false)
    assert.equal(mail.text.includes("1970"), false)
    assert.equal(mail.html.includes("\u2014"), false)
  })

  function visitorMail(rowCount: number) {
    const csvRows = buildVisitorCsvRows(
      Array.from({ length: rowCount }, (_, index) => ({
        sign_in_time: "2026-10-22T15:30:00.000Z",
        sign_out_time: "2026-10-22T17:00:00.000Z",
        visitor: { first_name: "Ada", last_name: String(index + 1), email: "ada@example.com", company: "Analytical" },
        host: { name: "Hiro Iwanaga" },
        visitor_type: { name: "Contractor" },
        location: { name: "Houston HQ", timezone: "America/Chicago" },
      })),
    )
    const table = renderReportTable({ csvRows, csvAttached: true })
    const mail = renderReportEmail({
      scheduleName: "Nightly visitor log",
      kind: "visitors",
      periodStart: "2026-10-21T05:00:00.000Z",
      periodEnd: "2026-10-22T05:00:00.000Z",
      timezone: "America/Chicago",
      locationNames: ["Houston HQ"],
      rowCount,
      format: "both",
      csvAttached: true,
      tableHtml: table.html,
      tableText: table.text,
    })
    return { table, mail, bytes: new TextEncoder().encode(mail.html).length }
  }

  it("keeps a 40-row table email well under 100 KB including the footer", () => {
    const { table, mail, bytes } = visitorMail(40)
    assert.equal(table.shown, 40)
    assert.equal(table.capped, false)
    assert.match(mail.html, /content="light only"/)
    assert.ok(bytes < 100_000, `40-row email was ${bytes} bytes`)
  })

  it("keeps a 300-row table email under 100 KB including the footer", () => {
    const { table, mail, bytes } = visitorMail(300)
    assert.equal(table.shown, 300)
    assert.equal(table.capped, false)
    assert.match(mail.html, /class="rt"/)
    assert.ok(bytes < 100_000, `300-row email was ${bytes} bytes`)
  })
})
