import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  REPORT_EMAIL_TABLE_MAX_HTML_BYTES,
  REPORT_EMAIL_TABLE_MAX_ROWS,
  emailDurationHeader,
  emailTableCellWrap,
  emailTableColumns,
  emailTableSummaryLine,
  formatEmailInOutLines,
  formatEmailTableDate,
  renderReportTable,
  reportEmailTableCapNote,
} from "./table.ts"
import { buildEmployeeCsvRows, buildTrainingCsvRows, buildVisitorCsvRows } from "./rows.ts"
import { renderReportEmail } from "./email.ts"

function visitorFixture(count: number, name = "Ada") {
  return buildVisitorCsvRows(
    Array.from({ length: count }, (_, index) => ({
      sign_in_time: "2026-10-22T15:30:00.000Z",
      sign_out_time: "2026-10-22T17:00:00.000Z",
      visitor: { first_name: name, last_name: String(index + 1), email: "ada@example.com", company: "Agricultural" },
      host: { name: "Hiro Iwanaga" },
      visitor_type: { name: "Contractor" },
      location: { name: "Houston HQ", timezone: "America/Chicago" },
    })),
  )
}

describe("renderReportTable", () => {
  it("escapes HTML in headers and cells", () => {
    const out = renderReportTable({
      csvRows: [
        ["Name", "Note"],
        ['<img src=x onerror=alert(1)>', `Acme & "Co" <script>`],
      ],
    })
    assert.equal(out.html.includes("<img"), false)
    assert.equal(out.html.includes("<script>"), false)
    assert.match(out.html, /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.match(out.html, /Acme &amp; &quot;Co&quot; &lt;script&gt;/)
    assert.equal(out.shown, 1)
    assert.equal(out.capped, false)
  })

  it("returns empty markup for an empty report so the email does not repeat the no-rows copy", () => {
    const out = renderReportTable({ csvRows: [["Visitor name", "Email"]] })
    assert.equal(out.total, 0)
    assert.equal(out.shown, 0)
    assert.equal(out.capped, false)
    assert.equal(out.html, "")
    assert.equal(out.text, "")
  })

  it("uses a 528px max width and inline wrap styles on each cell", () => {
    const headers = Array.from({ length: 10 }, (_, index) => `Col ${index + 1}`)
    const out = renderReportTable({
      csvRows: [headers, headers.map((_, index) => `c${index}`)],
    })
    assert.match(out.html, /class="rt"/)
    assert.match(out.html, /max-width:528px/)
    assert.match(out.html, /width:100%/)
    assert.match(out.html, /table-layout:auto/)
    assert.equal(out.html.includes("table-layout:fixed"), false)
    assert.equal(out.html.includes("overflow-x"), false)
    assert.equal(out.html.includes("white-space:nowrap"), false)
    assert.equal(out.html.includes("word-break:break-word"), false)
    assert.match(out.html, /<(td|th)[^>]*style="/)
    assert.match(out.html, /bgcolor="#ffffff"/)
    assert.match(out.html, /c0/)
  })

  it("folds visitor columns, shortens dates, and only breaks email", () => {
    const csv = visitorFixture(1)
    assert.equal(csv[0][8], "Duration (min)")
    assert.match(String(csv[1][6]), /2026/)
    const out = renderReportTable({ csvRows: csv })
    assert.match(out.html, /<th[^>]*>Visitor<\/th>/)
    assert.match(out.html, /<th[^>]*>Company<\/th>/)
    assert.match(out.html, /<th[^>]*>Host<\/th>/)
    assert.match(out.html, /<th[^>]*>In \/ out<\/th>/)
    assert.equal(out.html.includes("Duration (min)"), false)
    assert.equal(out.html.includes("Sign-out source"), false)
    assert.equal(out.html.includes('class="rt-now"'), false)
    assert.match(out.html, /Agricultural<br>Contractor/)
    assert.match(out.html, /Hiro Iwanaga<br>Houston HQ/)
    assert.match(out.html, /<td class="rt-time"[^>]*>Oct 22, 10:30\u00a0AM<br>12:00\u00a0PM · 90 min<\/td>/)
    assert.equal(out.html.includes("2026"), false)
    assert.equal(out.html.includes("CDT"), false)
    assert.match(out.html, /<span class="rt-em">ada@example.com<\/span>/)
    assert.deepEqual(
      emailTableColumns(csv[0]).map((column) => column.header),
      ["Visitor", "Company", "Host", "In / out"],
    )
  })

  it("shortens duration headers and email-table dates", () => {
    assert.equal(emailDurationHeader("Duration (min)"), "Min")
    assert.equal(emailDurationHeader("Duration (hr)"), "Hrs")
    assert.equal(formatEmailTableDate("Thu, Oct 22, 2026, 10:30 AM CDT"), "Oct 22, 10:30\u00a0AM")
    assert.equal(formatEmailTableDate("Mon, Oct 26, 2026, 7:30 AM GMT+3"), "Oct 26, 7:30\u00a0AM")
    assert.equal(formatEmailTableDate(""), "")
    assert.deepEqual(formatEmailInOutLines("Oct 26, 7:30\u00a0AM", "Oct 26, 6:01\u00a0PM", "10.51 hr"), [
      "Oct 26, 7:30\u00a0AM",
      "6:01\u00a0PM · 10.51 hr",
    ])
    assert.deepEqual(formatEmailInOutLines("Oct 26, 7:30\u00a0AM", "Oct 27, 6:01\u00a0AM", "10.5 hr"), [
      "Oct 26, 7:30\u00a0AM",
      "Oct 27, 6:01\u00a0AM · 10.5 hr",
    ])
    assert.deepEqual(formatEmailInOutLines("Oct 26, 7:30\u00a0AM", "", ""), [
      "Oct 26, 7:30\u00a0AM",
      "Still on site",
    ])
    const hours = renderReportTable({
      csvRows: buildVisitorCsvRows(
        [
          {
            sign_in_time: "2026-10-22T15:30:00.000Z",
            sign_out_time: "2026-10-22T17:00:00.000Z",
            visitor: { first_name: "Ada", last_name: "1", email: "ada@example.com", company: "Acme" },
            host: { name: "Hiro Iwanaga" },
            visitor_type: { name: "Contractor" },
            location: { name: "Houston HQ", timezone: "America/Chicago" },
          },
        ],
        "hours",
      ),
    })
    assert.match(hours.html, /1\.5 hr/)
    assert.equal(hours.html.includes("Duration (hr)"), false)
  })

  it("folds employee and training columns the same way", () => {
    const employees = renderReportTable({
      csvRows: buildEmployeeCsvRows([
        {
          sign_in_time: "2026-10-22T15:30:00.000Z",
          sign_out_time: "2026-10-22T17:00:00.000Z",
          auto_signed_in: true,
          profile: { full_name: "Caleb Klob", email: "caleb@talusag.com", role: "admin", department: "IT" },
          location: { name: "Houston HQ", timezone: "America/Chicago" },
        },
      ]),
    })
    assert.match(employees.html, /<th[^>]*>Employee<\/th>/)
    assert.match(employees.html, /admin<br>IT/)
    assert.match(employees.html, /Houston HQ<br>Auto/)
    assert.match(employees.html, /<span class="rt-em">caleb@talusag.com<\/span>/)

    const training = renderReportTable({
      csvRows: buildTrainingCsvRows(
        [
          {
            completed_at: "2026-10-01T10:00:00.000Z",
            expires_at: "2027-10-01T10:00:00.000Z",
            source: "training_link",
            visitor: { first_name: "Diego", last_name: "M", email: "diego@example.com", company: "Agricultural" },
            visitor_type: { name: "Contractor" },
            location: { name: "Houston HQ", timezone: "America/Chicago" },
          },
        ],
        Date.parse("2026-10-22T12:00:00.000Z"),
      ),
    })
    assert.match(training.html, /Agricultural<br>Contractor/)
    assert.match(training.html, /<th[^>]*>Dates<\/th>/)
    assert.match(training.html, /Cleared<br>Training link/)
  })

  it("caps at 500 rows and notes the email size limit", () => {
    const csvRows = [["Name"], ...Array.from({ length: 520 }, (_, index) => [`Visitor ${index + 1}`])]
    const out = renderReportTable({ csvRows, csvAttached: true })
    assert.equal(out.total, 520)
    assert.equal(out.shown, REPORT_EMAIL_TABLE_MAX_ROWS)
    assert.equal(out.capped, true)
    assert.match(out.html, /Showing first 500 of 520 rows \(email size limit\), full data in attached CSV/)
    assert.equal(out.html.includes("Visitor 500"), true)
    assert.equal(out.html.includes("Visitor 501"), false)
    assert.equal(
      reportEmailTableCapNote(500, 520, true),
      "Showing first 500 of 520 rows (email size limit), full data in attached CSV",
    )
  })

  it("stops at the HTML budget on a worst-case long-cell fixture", () => {
    const huge = "x".repeat(400)
    const headers = Array.from({ length: 10 }, (_, index) => `Col ${index + 1}`)
    const csvRows = [headers, ...Array.from({ length: 200 }, () => headers.map(() => huge))]
    const out = renderReportTable({ csvRows })
    assert.equal(out.capped, true)
    assert.ok(out.shown < 200)
    assert.ok(out.shown >= 1)
    const tableBytes = new TextEncoder().encode(out.html).length
    assert.ok(tableBytes <= REPORT_EMAIL_TABLE_MAX_HTML_BYTES + 400, `table was ${tableBytes} bytes`)
    const mail = renderReportEmail({
      scheduleName: "Nightly visitor log",
      kind: "visitors",
      periodStart: "2026-10-21T05:00:00.000Z",
      periodEnd: "2026-10-22T05:00:00.000Z",
      timezone: "America/Chicago",
      locationNames: ["Houston HQ"],
      rowCount: 200,
      format: "both",
      csvAttached: true,
      tableHtml: out.html,
      tableText: out.text,
    })
    const emailBytes = new TextEncoder().encode(mail.html).length
    assert.ok(emailBytes < 100_000, `email was ${emailBytes} bytes`)
  })

  it("keeps a typical 10-column report under the 80 KB table budget", () => {
    const headers = [
      "Visitor name",
      "Email",
      "Company",
      "Visitor type",
      "Host",
      "Site",
      "Sign in",
      "Sign out",
      "Duration (min)",
      "Notes",
    ]
    const csvRows = [
      headers,
      ...Array.from({ length: 220 }, (_, index) => [
        `Ada ${index + 1}`,
        "ada@example.com",
        "Agricultural",
        "Contractor",
        "Hiro Iwanaga",
        "Houston HQ",
        "Thu, Oct 22, 2026, 10:30 AM CDT",
        "Thu, Oct 22, 2026, 12:00 PM CDT",
        "90",
        "Dock A",
      ]),
    ]
    const out = renderReportTable({ csvRows, csvAttached: true })
    assert.ok(out.shown >= 150, `10-column table only showed ${out.shown}`)
    const tableBytes = new TextEncoder().encode(out.html).length
    assert.ok(tableBytes <= REPORT_EMAIL_TABLE_MAX_HTML_BYTES, `table was ${tableBytes} bytes`)
    const mail = renderReportEmail({
      scheduleName: "Nightly visitor log",
      kind: "visitors",
      periodStart: "2026-10-21T05:00:00.000Z",
      periodEnd: "2026-10-22T05:00:00.000Z",
      timezone: "America/Chicago",
      locationNames: ["Houston HQ"],
      rowCount: 220,
      format: "both",
      csvAttached: true,
      tableHtml: out.html,
      tableText: out.text,
    })
    const emailBytes = new TextEncoder().encode(mail.html).length
    assert.ok(emailBytes < 100_000, `email was ${emailBytes} bytes`)
  })

  it("keeps Kenya long-name rows to two time lines and four columns", () => {
    const out = renderReportTable({
      csvRows: buildVisitorCsvRows(
        [
          {
            sign_in_time: "2026-10-26T04:48:00.000Z",
            sign_out_time: "2026-10-26T15:01:00.000Z",
            visitor: {
              first_name: "Dolvin",
              last_name: "Moragwanyanga Residolvin",
              email: "dolvinmoragwanyangaresidolvin@gmail.com",
              company: "Talus",
            },
            host: { name: "Stanley Tioniny" },
            visitor_type: { name: "Contractor" },
            location: { name: "Kenya Farm Site", timezone: "Africa/Nairobi" },
          },
        ],
        "hours",
      ),
    })
    assert.match(out.html, /<th[^>]*>In \/ out<\/th>/)
    assert.equal(out.html.includes("Duration (hr)"), false)
    assert.match(out.html, /<td class="rt-time"[^>]*>Oct 26, 7:48\u00a0AM<br>6:01\u00a0PM · 10\.22 hr<\/td>/)
    assert.match(out.html, /<span class="rt-em">dolvinmoragwanyangaresidolvin@gmail.com<\/span>/)
    assert.match(out.html, /Kenya Farm Site/)
    assert.equal((out.html.match(/<th /g) || []).length, 4)
  })

  it("shows a still-on-site hint when sign-out is empty", () => {
    const out = renderReportTable({
      csvRows: [
        ["Visitor name", "Email", "Company", "Visitor type", "Host", "Site", "Sign in", "Sign out", "Duration (min)"],
        [
          "Ada Lovelace",
          "ada@example.com",
          "Talus",
          "Contractor",
          "Hiro Iwanaga",
          "Houston HQ",
          "Thu, Oct 22, 2026, 10:30 AM CDT",
          "",
          "",
        ],
      ],
    })
    assert.match(out.html, /Still on site/)
    assert.match(out.text, /Still on site/)
  })

  it("puts overflow-wrap:anywhere on long-name cells so a 100-char token cannot stretch the email", () => {
    const token = "A".repeat(100)
    const out = renderReportTable({ csvRows: [["Name"], [token]] })
    assert.match(out.html, /class="rt-long"[^>]*style="overflow-wrap:anywhere"/)
    assert.equal(out.html.includes("word-break:break-word"), false)
    assert.match(out.html, /class="rt"/)
    assert.equal(out.html.includes(token), true)
  })

  it("does not use word-break:break-word on Host or In / out cells", () => {
    const out = renderReportTable({ csvRows: visitorFixture(1) })
    const host = emailTableCellWrap({ header: "Host", kinds: ["host", "site"] })
    const time = emailTableCellWrap({ header: "In / out", kinds: ["signin", "signout", "duration"] })
    assert.equal(host.style.includes("word-break:break-word"), false)
    assert.equal(time.style.includes("word-break:break-word"), false)
    assert.match(host.style, /word-break:normal/)
    assert.match(host.style, /overflow-wrap:normal/)
    assert.match(host.style, /min-width:64px/)
    assert.match(time.style, /min-width:64px/)
    assert.match(out.html, /class="rt-host"[^>]*min-width:64px/)
    assert.match(out.html, /class="rt-time"[^>]*min-width:64px/)
    assert.equal(out.html.includes("word-break:break-word"), false)

    const hostTd = out.html.match(/<td class="rt-host"[^>]*>[\s\S]*?<\/td>/)
    const timeTd = out.html.match(/<td class="rt-time"[^>]*>[\s\S]*?<\/td>/)
    assert.ok(hostTd && timeTd)
    assert.equal(hostTd[0].includes("word-break:break-word"), false)
    assert.equal(timeTd[0].includes("word-break:break-word"), false)
    assert.match(hostTd[0], /Hiro Iwanaga/)
    assert.match(timeTd[0], /10:30\u00a0AM/)
  })

  it("lets a 35-character surname stay in the visitor cell", () => {
    const thirtyFive = "Abcdefghijklmnopqrstuvwxyzabcdefghi"
    assert.equal(thirtyFive.length, 35)
    const out = renderReportTable({
      csvRows: buildVisitorCsvRows([
        {
          sign_in_time: "2026-10-22T15:30:00.000Z",
          sign_out_time: "2026-10-22T17:00:00.000Z",
          visitor: { first_name: "Dolvin", last_name: thirtyFive, email: "ada@example.com", company: "Agricultural" },
          host: { name: "Hiro Iwanaga" },
          visitor_type: { name: "Contractor" },
          location: { name: "Houston HQ", timezone: "America/Chicago" },
        },
      ]),
    })
    assert.equal(out.html.includes(thirtyFive), true)
    assert.match(out.html, /class="rt-long"[^>]*overflow-wrap:anywhere/)
  })

  it("handles 0 and 1000-row reports without blowing the table budget", () => {
    const empty = renderReportTable({ csvRows: visitorFixture(0) })
    assert.equal(empty.shown, 0)
    assert.equal(empty.html, "")

    const out = renderReportTable({ csvRows: visitorFixture(1000), csvAttached: true })
    assert.equal(out.total, 1000)
    assert.ok(out.shown <= REPORT_EMAIL_TABLE_MAX_ROWS)
    assert.equal(out.capped, true)
    const tableBytes = new TextEncoder().encode(out.html).length
    assert.ok(tableBytes <= REPORT_EMAIL_TABLE_MAX_HTML_BYTES + 400, `table was ${tableBytes} bytes`)
    assert.equal(out.html.includes("word-break:break-word"), false)
  })

  it("replaces pipes in the plain-text table", () => {
    const out = renderReportTable({
      csvRows: [
        ["Visitor name", "Sign in"],
        ["Ada | Lovelace", "Thu, Oct 22, 2026, 10:30 AM CDT"],
      ],
    })
    assert.match(out.text, /Ada \/ Lovelace/)
    assert.equal(out.text.includes("Ada | Lovelace"), false)
  })

  it("summarizes the table only when markup exists", () => {
    assert.equal(emailTableSummaryLine(null), null)
    assert.equal(emailTableSummaryLine({ html: "", shown: 0, total: 0, capped: false }), null)
    assert.deepEqual(emailTableSummaryLine({ html: "<table></table>", shown: 12, total: 12, capped: false }), {
      label: "Email table",
      value: "Included",
    })
    assert.deepEqual(emailTableSummaryLine({ html: "<table></table>", shown: 40, total: 80, capped: true }), {
      label: "Email table",
      value: "First 40 of 80 rows",
    })
  })
})
