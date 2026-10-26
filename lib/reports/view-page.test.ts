import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const page = readFileSync(new URL("../../app/admin/reports/view/page.tsx", import.meta.url), "utf8")

describe("report view page source", () => {
  it("authorizes with the report API check before any service-role query", () => {
    const authAt = page.indexOf("authorizeReportView(portal)")
    const loadAt = page.indexOf("loadReportViewIfAuthorized(portal")
    const clientAt = page.indexOf("createAdminClient()")
    const queryAt = page.indexOf("loadReportRows(")
    assert.ok(authAt >= 0 && loadAt > authAt)
    assert.ok(clientAt > loadAt)
    assert.ok(queryAt > clientAt)
    assert.match(page, /isBuiltInAdminRole|authorizeReportView|loadReportViewIfAuthorized/)
    assert.match(page, /This report could not be loaded/)
    assert.equal(page.includes("err.message"), false)
    assert.equal(page.includes("error.message"), false)
    assert.match(page, /adminPageLoginRedirect\(401, REPORT_VIEW_PATH/)
    assert.match(page, /clampReportViewRange/)
    assert.match(page, /Not authorized/)
  })
})
