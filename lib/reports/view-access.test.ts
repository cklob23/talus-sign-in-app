import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isBuiltInAdminRole } from "@/lib/admin-role"
import { adminPageLoginRedirect } from "@/lib/safe-redirect"
import { authorizeReportView, loadReportViewIfAuthorized } from "./view-access.ts"

function user(role: string, permissions: string[] = []) {
  return {
    ok: true as const,
    user: { role, permissions: new Set(permissions as never[]), userId: "user-1" },
  }
}

describe("report view authorization", () => {
  it("allows built-in admin and super_admin", async () => {
    let queried = 0
    for (const role of ["admin", "super_admin"] as const) {
      const result = await loadReportViewIfAuthorized(user(role), async () => {
        queried += 1
        return { rows: 3 }
      })
      assert.equal(isBuiltInAdminRole(role), true)
      assert.equal(result.ok, true)
      if (result.ok) assert.deepEqual(result.data, { rows: 3 })
    }
    assert.equal(queried, 2)
  })

  it("denies staff and does not query", async () => {
    let queried = false
    const result = await loadReportViewIfAuthorized(user("staff", ["reports"]), async () => {
      queried = true
      return { rows: 1 }
    })
    assert.equal(isBuiltInAdminRole("staff"), false)
    assert.equal(authorizeReportView(user("staff")).ok, false)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.status, 403)
    assert.equal(queried, false)
  })

  it("denies a custom role without reports and does not query", async () => {
    let queried = false
    const result = await loadReportViewIfAuthorized(user("user", ["visitors"]), async () => {
      queried = true
      return { rows: 1 }
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.status, 403)
    assert.equal(queried, false)
  })

  it("denies a custom role even with the reports permission, matching the report APIs", async () => {
    let queried = false
    const result = await loadReportViewIfAuthorized(user("user", ["reports"]), async () => {
      queried = true
      return { rows: 1 }
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.status, 403)
    assert.equal(queried, false)
  })

  it("redirects unauthenticated callers to login with next= filters and does not query", async () => {
    let queried = false
    const result = await loadReportViewIfAuthorized({ ok: false, status: 401, error: "Unauthorized" }, async () => {
      queried = true
      return { rows: 1 }
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.status, 401)
    assert.equal(queried, false)
    const dest = "/admin/reports/view?kind=visitors&from=2026-10-26T00:00:00.000Z&to=2026-10-27T00:00:00.000Z"
    const login = adminPageLoginRedirect(401, "/admin/reports/view", "?kind=visitors&from=2026-10-26T00:00:00.000Z&to=2026-10-27T00:00:00.000Z")
    assert.equal(login, `/auth/login?next=${encodeURIComponent(dest)}`)
    assert.match(login, /next=%2Fadmin%2Freports%2Fview/)
  })
})
