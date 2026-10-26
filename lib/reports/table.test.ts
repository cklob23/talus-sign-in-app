import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  REPORT_EMAIL_TABLE_MAX_ROWS,
  renderReportTable,
  reportEmailTableCapNote,
} from "./table.ts"

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

  it("caps very large reports at 40 rows and notes the CSV", () => {
    const csvRows = [
      ["Name"],
      ...Array.from({ length: 80 }, (_, index) => [`Visitor ${index + 1}`]),
    ]
    const out = renderReportTable({ csvRows, csvAttached: true })
    assert.equal(out.total, 80)
    assert.equal(out.shown, REPORT_EMAIL_TABLE_MAX_ROWS)
    assert.equal(out.capped, true)
    assert.match(out.html, /Showing first 40 of 80 rows, full data in attached CSV/)
    assert.equal(out.html.includes("Visitor 40"), true)
    assert.equal(out.html.includes("Visitor 41"), false)
    assert.equal(
      reportEmailTableCapNote(40, 80, true),
      "Showing first 40 of 80 rows, full data in attached CSV",
    )
  })

  it("stops early when the HTML would exceed the size budget", () => {
    const huge = "x".repeat(6000)
    const csvRows = [["Note"], ...Array.from({ length: 40 }, () => [huge])]
    const out = renderReportTable({ csvRows, maxHtmlBytes: 20_000 })
    assert.equal(out.capped, true)
    assert.ok(out.shown < 40)
    assert.ok(out.shown >= 1)
    assert.ok(new TextEncoder().encode(out.html).length < 22_000)
  })

  it("replaces pipes in the plain-text table and nowraps date headers", () => {
    const out = renderReportTable({
      csvRows: [
        ["Visitor name", "Sign in"],
        ["Ada | Lovelace", "Thu, Oct 22, 2026, 10:30 AM CDT"],
      ],
    })
    assert.match(out.text, /Ada \/ Lovelace/)
    assert.equal(out.text.includes("Ada | Lovelace"), false)
    assert.match(out.html, /white-space:nowrap/)
  })
})
