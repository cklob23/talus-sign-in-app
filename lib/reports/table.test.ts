import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  REPORT_EMAIL_TABLE_EMPTY,
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

  it("shows an empty report without a data table", () => {
    const out = renderReportTable({ csvRows: [["Visitor name", "Email"]] })
    assert.equal(out.total, 0)
    assert.equal(out.shown, 0)
    assert.equal(out.capped, false)
    assert.equal(out.text, REPORT_EMAIL_TABLE_EMPTY)
    assert.match(out.html, /No rows matched this period/)
    assert.equal(out.html.includes("<tbody>"), false)
  })

  it("caps very large reports at 200 rows and notes the CSV", () => {
    const csvRows = [
      ["Name"],
      ...Array.from({ length: 250 }, (_, index) => [`Visitor ${index + 1}`]),
    ]
    const out = renderReportTable({ csvRows, csvAttached: true })
    assert.equal(out.total, 250)
    assert.equal(out.shown, REPORT_EMAIL_TABLE_MAX_ROWS)
    assert.equal(out.capped, true)
    assert.match(out.html, /Showing first 200 of 250 rows, full data in attached CSV/)
    assert.equal(out.html.includes("Visitor 200"), true)
    assert.equal(out.html.includes("Visitor 201"), false)
    assert.equal((out.html.match(/<tr>/g) || []).length, 201)
    assert.equal(
      reportEmailTableCapNote(200, 250, true),
      "Showing first 200 of 250 rows, full data in attached CSV",
    )
  })
})
