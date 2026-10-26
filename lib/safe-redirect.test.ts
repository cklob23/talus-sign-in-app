import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { adminPageLoginRedirect, loginUrlForProtectedPath, safeNextPath } from "./safe-redirect.ts"

describe("safeNextPath", () => {
  it("allows a same-origin admin path", () => {
    assert.equal(safeNextPath("/admin"), "/admin")
    assert.equal(safeNextPath("/admin/users"), "/admin/users")
    assert.equal(
      safeNextPath("/admin/reports/view?kind=visitors&name=Kenya farm daily"),
      "/admin/reports/view?kind=visitors&name=Kenya farm daily",
    )
  })

  it("rejects open-redirect payloads", () => {
    assert.equal(safeNextPath("@evil.com"), "/admin")
    assert.equal(safeNextPath("//evil.com"), "/admin")
    assert.equal(safeNextPath("/\\evil.com"), "/admin")
    assert.equal(safeNextPath("https://evil.com"), "/admin")
    assert.equal(safeNextPath(".evil.com"), "/admin")
  })

  it("falls back for empty or missing values", () => {
    assert.equal(safeNextPath(null), "/admin")
    assert.equal(safeNextPath(""), "/admin")
    assert.equal(safeNextPath("   ", "/kiosk"), "/kiosk")
  })

  it("builds a login URL that preserves the report view query", () => {
    const dest = "/admin/reports/view?kind=visitors&name=Kenya farm daily"
    const login = loginUrlForProtectedPath("/admin/reports/view", "?kind=visitors&name=Kenya farm daily")
    assert.equal(login, `/auth/login?next=${encodeURIComponent(dest)}`)
    assert.equal(adminPageLoginRedirect(403), "/auth/login?error=not_authorized")
    assert.equal(
      adminPageLoginRedirect(401, "/admin/reports/view", "?kind=visitors"),
      `/auth/login?next=${encodeURIComponent("/admin/reports/view?kind=visitors")}`,
    )
  })
})
