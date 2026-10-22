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
})
