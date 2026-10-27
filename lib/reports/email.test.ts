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
    assert.equal(mail.html.includes("View full table"), false)
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

  it("adds a View full table button only for a same-origin reports view URL", () => {
    const viewUrl =
      "https://signin.talusag.com/admin/reports/view?kind=visitors&from=2026-10-21T05:00:00.000Z&to=2026-10-22T05:00:00.000Z&name=Nightly+visitor+log"
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
      tableHtml: "<table class=\"rt\"><tr><th>Visitor</th></tr></table>",
      tableText: "Visitor",
      viewUrl,
    })
    assert.match(mail.html, /View full table/)
    assert.match(mail.html, /All columns\. Sign-in required/)
    assert.match(mail.html, /href="https:\/\/signin\.talusag\.com\/admin\/reports\/view\?kind=visitors/)
    assert.equal(mail.html.includes("javascript:"), false)
    assert.match(mail.text, /View the full table \(sign-in required\)/)
    assert.match(mail.text, /signin\.talusag\.com\/admin\/reports\/view/)

    const blocked = renderReportEmail({
      scheduleName: "Nightly visitor log",
      kind: "visitors",
      periodStart: "2026-10-21T05:00:00.000Z",
      periodEnd: "2026-10-22T05:00:00.000Z",
      timezone: "America/Chicago",
      locationNames: ["Houston HQ"],
      rowCount: 2,
      format: "both",
      csvAttached: true,
      tableHtml: "<table class=\"rt\"><tr><th>Visitor</th></tr></table>",
      viewUrl: "javascript:alert(1)",
    })
    assert.equal(blocked.html.includes("View full table"), false)
    assert.equal(blocked.html.includes("javascript:"), false)

    const noTable = renderReportEmail({
      scheduleName: "Nightly visitor log",
      kind: "visitors",
      periodStart: "2026-10-21T05:00:00.000Z",
      periodEnd: "2026-10-22T05:00:00.000Z",
      timezone: "America/Chicago",
      locationNames: ["Houston HQ"],
      rowCount: 0,
      format: "summary",
      csvAttached: false,
      viewUrl,
    })
    assert.equal(noTable.html.includes("View full table"), false)
  })

  function visitorMail(rowCount: number, viewUrl?: string) {
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
      viewUrl,
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

  it("keeps a 245-row table email under the 80 KB table / 102 KB Gmail budgets", () => {
    const { table, mail, bytes } = visitorMail(
      245,
      "https://signin.talusag.com/admin/reports/view?kind=visitors&from=2026-10-21T05:00:00.000Z&to=2026-10-22T05:00:00.000Z",
    )
    const tableBytes = new TextEncoder().encode(table.html).length
    assert.ok(table.shown >= 150, `245-row table only showed ${table.shown}`)
    assert.ok(tableBytes <= 80_000, `table was ${tableBytes} bytes`)
    assert.match(mail.html, /class="rt"/)
    assert.match(mail.html, /In \/ out/)
    assert.match(mail.html, /View full table/)
    assert.equal(mail.html.includes("word-break:break-word"), false)
    assert.ok(bytes < 102_000, `245-row email was ${bytes} bytes`)
  })

  it("keeps a 300-row table email under the 80 KB table / 102 KB Gmail budgets", () => {
    const { table, mail, bytes } = visitorMail(300)
    const tableBytes = new TextEncoder().encode(table.html).length
    assert.ok(table.shown >= 150, `300-row table only showed ${table.shown}`)
    assert.ok(tableBytes <= 80_000, `table was ${tableBytes} bytes`)
    assert.match(mail.html, /class="rt"/)
    assert.equal(mail.html.includes("word-break:break-word"), false)
    assert.ok(bytes < 102_000, `300-row email was ${bytes} bytes`)
  })
})
