import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  REPORT_EMAIL_TABLE_MAX_HTML_BYTES,
  REPORT_EMAIL_TABLE_MAX_ROWS,
  emailDurationHeader,
  emailTableCellWrap,
  emailTableColumns,
  emailTableSummaryLine,
  escapeHtmlWithSoftBreaks,
  formatEmailInOutLines,
  formatEmailTableDate,
  renderReportTable,
  reportEmailTableCapNote,
} from "./table.ts"
import { escapeHtml } from "@/lib/html-escape"
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

/** Realistic visitor row (~320 HTML bytes): longer names, email, company, and site. */
function realisticVisitorFixture(count: number) {
  return buildVisitorCsvRows(
    Array.from({ length: count }, () => ({
      sign_in_time: "2026-10-22T15:30:00.000Z",
      sign_out_time: "2026-10-22T17:00:00.000Z",
      visitor: {
        first_name: "Bartholomew",
        last_name: "Wolfensteiner-Kensington",
        email: "bartholomew.wolfensteiner@example.com",
        company: "Environmental Consulting Group",
      },
      host: { name: "Stanley Tioniny" },
      visitor_type: { name: "Independent Contractor" },
      location: { name: "Kenya Farm Headquarters", timezone: "Africa/Nairobi" },
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
    assert.match(out.html.replaceAll("<wbr>", ""), /&lt;img src=x onerror=alert\(1\)&gt;/)
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

  it("uses a 528px max width and keeps wrap styles off each cell", () => {
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
    assert.equal(out.html.includes("overflow-wrap:anywhere"), false)
    assert.doesNotMatch(out.html, /<(td|th)[^>]*style="/)
    assert.match(out.html, /<table[^>]*style="/)
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
    assert.ok(out.shown >= 200, `10-column table only showed ${out.shown}`)
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

  it("clips a huge email-table cell and leaves the source CSV row unchanged", () => {
    const huge = "H".repeat(400)
    const csvRows = [["Name"], [huge]]
    const out = renderReportTable({ csvRows })
    assert.equal(csvRows[1][0], huge)
    assert.equal(out.html.replaceAll("<wbr>", "").includes(`${"H".repeat(200)}...`), true)
    assert.equal(out.html.replaceAll("<wbr>", "").includes(huge), false)
    assert.equal(out.text.includes("<wbr>"), false)
    assert.equal(out.text.includes(huge), false)
  })

  it("soft-breaks 15+ character tokens so a 100-char name cannot stretch the email", () => {
    const token = "A".repeat(100)
    const out = renderReportTable({ csvRows: [["Name"], [token]] })
    assert.equal(out.html.includes("class=\"rt-long\""), false)
    assert.equal(out.html.includes("overflow-wrap:anywhere"), false)
    assert.equal(out.html.includes("word-break:break-word"), false)
    assert.match(out.html, /class="rt"/)
    assert.equal(out.html.includes("<wbr>"), true)
    assert.equal(out.html.replaceAll("<wbr>", "").includes(token), true)
    assert.equal((out.html.match(/<wbr>/g) || []).length, 12)
  })

  it("does not use word-break:break-word on Host or In / out cells", () => {
    const out = renderReportTable({ csvRows: visitorFixture(1) })
    const host = emailTableCellWrap({ header: "Host", kinds: ["host", "site"] })
    const time = emailTableCellWrap({ header: "In / out", kinds: ["signin", "signout", "duration"] })
    const name = emailTableCellWrap({ header: "Visitor", kinds: ["name", "email"] })
    assert.equal(host.className, "rt-host")
    assert.equal(time.className, "rt-time")
    assert.equal(name.className, "")
    assert.match(out.html, /<td class="rt-host">/)
    assert.match(out.html, /<td class="rt-time">/)
    assert.doesNotMatch(out.html, /<(td|th)[^>]*style="/)
    assert.equal(out.html.includes("word-break:break-word"), false)
    assert.equal(out.html.includes("min-width:64px"), false)

    const hostTd = out.html.match(/<td class="rt-host"[^>]*>[\s\S]*?<\/td>/)
    const timeTd = out.html.match(/<td class="rt-time"[^>]*>[\s\S]*?<\/td>/)
    assert.ok(hostTd && timeTd)
    assert.equal(hostTd[0].includes("word-break:break-word"), false)
    assert.equal(timeTd[0].includes("word-break:break-word"), false)
    assert.equal(hostTd[0].includes("<wbr>"), false)
    assert.equal(timeTd[0].includes("<wbr>"), false)
    assert.match(hostTd[0], /Hiro Iwanaga/)
    assert.match(timeTd[0], /10:30\u00a0AM/)
  })

  it("keeps ordinary Visitor and Company words whole and only soft-breaks 15+ tokens", () => {
    assert.equal(escapeHtmlWithSoftBreaks("Bartholomew"), "Bartholomew")
    assert.equal(escapeHtmlWithSoftBreaks("Wolfensteiner"), "Wolfensteiner")
    assert.equal(escapeHtmlWithSoftBreaks("Environmental"), "Environmental")
    assert.equal(escapeHtmlWithSoftBreaks("abcdefghijklmno"), "abcdefgh<wbr>ijklmno")
    assert.equal(escapeHtmlWithSoftBreaks("A & B_corporationXY"), "A &amp; B_corpor<wbr>ationXY")

    const thirtyFive = "Abcdefghijklmnopqrstuvwxyzabcdefghi"
    assert.equal(thirtyFive.length, 35)
    const out = renderReportTable({
      csvRows: buildVisitorCsvRows([
        {
          sign_in_time: "2026-10-22T15:30:00.000Z",
          sign_out_time: "2026-10-22T17:00:00.000Z",
          visitor: {
            first_name: "Bartholomew",
            last_name: "Wolfensteiner",
            email: "bartholomew.wolfensteiner@example.com",
            company: "Environmental",
          },
          host: { name: "Hiro Iwanaga" },
          visitor_type: { name: "Contractor" },
          location: { name: "Houston HQ", timezone: "America/Chicago" },
        },
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
    assert.match(out.html, /Bartholomew Wolfensteiner/)
    assert.match(out.html, /Environmental/)
    assert.equal(out.html.includes("Bartholome<wbr>"), false)
    assert.equal(out.html.includes("Wolfenstein<wbr>"), false)
    assert.equal(out.html.includes("Environmenta<wbr>"), false)
    assert.equal(out.html.includes("class=\"rt-long\""), false)
    assert.equal(out.html.includes("overflow-wrap:anywhere"), false)
    assert.match(out.html, /<span class="rt-em">bartholomew\.wolfensteiner@example\.com<\/span>/)
    assert.equal(out.html.includes(thirtyFive), false)
    assert.equal(out.html.replaceAll("<wbr>", "").includes(`Dolvin ${thirtyFive}`), true)
  })

  it("does not put <wbr> inside hyphenated names whose pieces are under 15", () => {
    assert.equal(escapeHtmlWithSoftBreaks("Wolfensteiner-Kensington"), "Wolfensteiner-Kensington")
    assert.equal(escapeHtmlWithSoftBreaks("Montgomery-Smythe"), "Montgomery-Smythe")
    assert.equal(escapeHtmlWithSoftBreaks("Wolfensteiner\u2010Kensington"), "Wolfensteiner\u2010Kensington")
    assert.equal(escapeHtmlWithSoftBreaks("Wolfensteiner\u2011Kensington"), "Wolfensteiner\u2011<wbr>Kensington")
    assert.equal(escapeHtmlWithSoftBreaks("Wolfensteiner\u2013Kensington"), "Wolfensteiner\u2013Kensington")
    assert.equal(escapeHtmlWithSoftBreaks("Wolfensteiner\u2014Kensington"), "Wolfensteiner\u2014Kensington")
    assert.equal(escapeHtmlWithSoftBreaks("Acme/Environmental"), "Acme/<wbr>Environmental")
    assert.equal(
      escapeHtmlWithSoftBreaks("Wolfensteiner-Supercalifragilistic"),
      "Wolfensteiner-Supercal<wbr>ifragili<wbr>stic",
    )

    const out = renderReportTable({
      csvRows: buildVisitorCsvRows([
        {
          sign_in_time: "2026-10-22T15:30:00.000Z",
          sign_out_time: "2026-10-22T17:00:00.000Z",
          visitor: {
            first_name: "Ada",
            last_name: "Wolfensteiner-Kensington",
            email: "ada@example.com",
            company: "Montgomery-Smythe",
          },
          host: { name: "Hiro Iwanaga" },
          visitor_type: { name: "Contractor" },
          location: { name: "Houston HQ", timezone: "America/Chicago" },
        },
      ]),
    })
    assert.match(out.html, /Ada Wolfensteiner-Kensington/)
    assert.match(out.html, /Montgomery-Smythe/)
    assert.equal(out.html.includes("Wolfenst<wbr>"), false)
    assert.equal(out.html.includes("einer-Ke<wbr>"), false)
    assert.equal(out.html.includes("Montgome<wbr>"), false)
    assert.equal(out.html.includes("ry-Smyth<wbr>"), false)
    assert.equal(out.text.includes("<wbr>"), false)
  })

  it("inserts <wbr> after slash and the non-breaking hyphen", () => {
    assert.equal(escapeHtmlWithSoftBreaks("Acme/Environmental"), "Acme/<wbr>Environmental")
    assert.equal(escapeHtmlWithSoftBreaks("Wolfensteiner\u2011Kensington"), "Wolfensteiner\u2011<wbr>Kensington")
    assert.equal(escapeHtmlWithSoftBreaks("Acme/\u2011Environmental"), "Acme/\u2011<wbr>Environmental")
    assert.equal(escapeHtmlWithSoftBreaks("A/<script>"), "A/<wbr>&lt;script&gt;")
    assert.equal(escapeHtmlWithSoftBreaks("A\u2011<script>"), "A\u2011<wbr>&lt;script&gt;")

    const out = renderReportTable({
      csvRows: [
        ["Name", "Company"],
        ["Ada Wolfensteiner\u2011Kensington", "Acme/Environmental"],
      ],
    })
    assert.match(out.html, /Acme\/<wbr>Environmental/)
    assert.match(out.html, /Wolfensteiner\u2011<wbr>Kensington/)
    assert.equal(out.text.includes("<wbr>"), false)
    assert.match(out.text, /Acme\/Environmental/)
    assert.match(out.text, /Wolfensteiner\u2011Kensington/)
  })

  it("chunks long tokens by grapheme so emoji, flags, and combining marks stay intact", () => {
    assert.equal(escapeHtmlWithSoftBreaks("abcdefg😀xxxxxxxxxxxx"), "abcdefg😀<wbr>xxxxxxxx<wbr>xxxx")

    const family = "👨‍👩‍👧‍👦"
    const flag = "🇺🇸"
    const acute = "e\u0301"
    assert.equal(escapeHtmlWithSoftBreaks(`abcdefg${family}xxxxxxx`), `abcdefg${family}<wbr>xxxxxxx`)
    assert.equal(escapeHtmlWithSoftBreaks(`abcdefg${flag}xxxxxxx`), `abcdefg${flag}<wbr>xxxxxxx`)
    assert.equal(escapeHtmlWithSoftBreaks(`abcdefg${acute}xxxxxxx`), `abcdefg${acute}<wbr>xxxxxxx`)
    assert.equal(escapeHtmlWithSoftBreaks(`abcdefg${acute}xxxxxxx`).includes("e<wbr>\u0301"), false)
    assert.equal(escapeHtmlWithSoftBreaks(`abcdefg${family}xxxxxxx`).includes("\u200D<wbr>"), false)
    assert.equal(escapeHtmlWithSoftBreaks(`abcdefg${flag}xxxxxxx`).includes("\u{1F1FA}<wbr>"), false)

    const longToken = "A".repeat(20)
    assert.equal(escapeHtmlWithSoftBreaks(longToken), "AAAAAAAA<wbr>AAAAAAAA<wbr>AAAA")
  })

  it("escapes hostile markup before inserting <wbr> and keeps it out of plain text", () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(1)</script>'
    const escaped = escapeHtmlWithSoftBreaks(hostile)
    assert.equal(escaped.includes("<img"), false)
    assert.equal(escaped.includes("<script"), false)
    assert.equal(escaped.replaceAll("<wbr>", ""), escapeHtml(hostile))

    const out = renderReportTable({
      csvRows: [
        ["Name", "Note"],
        [hostile, `Acme/${hostile}`],
      ],
    })
    assert.equal(out.html.includes("<img"), false)
    assert.equal(out.html.includes("<script>"), false)
    assert.match(out.html.replaceAll("<wbr>", ""), /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.match(out.html.replaceAll("<wbr>", ""), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.equal(out.text.includes("<wbr>"), false)
    assert.equal(out.html.replaceAll("<wbr>", "").includes("<img"), false)
    assert.equal(out.html.replaceAll("<wbr>", "").includes("<script"), false)
  })

  it("caps a ~320-byte visitor day and keeps the shown-count note correct", () => {
    const compact = renderReportTable({ csvRows: visitorFixture(1) })
    const compactRow = compact.html.match(/<tr><td>[\s\S]*?<\/tr>/)
    assert.ok(compactRow)
    const compactBytes = new TextEncoder().encode(compactRow[0]).length
    assert.ok(compactBytes < 250, `compact fixture grew to ${compactBytes} bytes`)

    const day = renderReportTable({ csvRows: realisticVisitorFixture(250), csvAttached: true })
    const row = day.html.match(/<tr><td>[\s\S]*?<\/tr>/)
    assert.ok(row)
    const rowBytes = new TextEncoder().encode(row[0]).length
    assert.ok(rowBytes >= 300 && rowBytes <= 360, `realistic row was ${rowBytes} bytes`)
    assert.equal(day.total, 250)
    assert.ok(day.shown >= 230, `320-byte visitor day only showed ${day.shown}`)
    assert.ok(day.shown <= 250)
    assert.ok(day.shown <= REPORT_EMAIL_TABLE_MAX_ROWS)
    if (day.capped) {
      assert.match(
        day.html,
        new RegExp(`Showing first ${day.shown} of 250 rows \\(email size limit\\), full data in attached CSV`),
      )
      assert.match(
        day.text,
        new RegExp(`Showing first ${day.shown} of 250 rows \\(email size limit\\), full data in attached CSV`),
      )
    } else {
      assert.equal(day.shown, 250)
      assert.equal(day.html.includes("Showing first"), false)
    }
    const tableBytes = new TextEncoder().encode(day.html).length
    assert.ok(tableBytes <= REPORT_EMAIL_TABLE_MAX_HTML_BYTES + 400, `table was ${tableBytes} bytes`)

    const overflow = renderReportTable({ csvRows: realisticVisitorFixture(300), csvAttached: true })
    assert.equal(overflow.total, 300)
    assert.ok(overflow.capped)
    assert.ok(overflow.shown < 300)
    assert.match(
      overflow.html,
      new RegExp(`Showing first ${overflow.shown} of 300 rows \\(email size limit\\), full data in attached CSV`),
    )
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
