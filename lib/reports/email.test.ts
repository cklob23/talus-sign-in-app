import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderReportEmail } from "./email.ts"

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
})
