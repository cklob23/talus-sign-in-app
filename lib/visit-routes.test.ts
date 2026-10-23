import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

process.env.KIOSK_ROUTE_TEST_MOCKS = "1"
process.env.KIOSK_SESSION_SECRET = "route-test-secret-0123456789"

const SIGN_IN_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
const { issueVisitToken } = await import("./visit-token.ts")
const { writes, resetWrites, setOverride, clearOverrides } = await import("./test-mocks/supabase-server.ts")
const { POST: signOutPost } = await import("../app/visit/[token]/sign-out/route.ts")
const { POST: disputePost } = await import("../app/visit/[token]/dispute/route.ts")

function request(path: string) {
  return new Request(`http://kiosk.local${path}`, { method: "POST" })
}

beforeEach(() => {
  resetWrites()
  clearOverrides()
})

describe("visit page actions", () => {
  it("signs the visitor out from a valid token", async () => {
    const token = issueVisitToken({ signInId: SIGN_IN_ID })
    setOverride("sign_ins", {
      single: {
        id: SIGN_IN_ID,
        visitor_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        sign_out_time: null,
        badge_number: "V00001",
        visitor: { first_name: "Carlos", last_name: "Mendoza", email: "carlos@example.com" },
      },
    })
    const res = await signOutPost(request(`/visit/${token}/sign-out`) as never, {
      params: Promise.resolve({ token }),
    })
    assert.equal(res.status, 200, await res.clone().text())
    const json = await res.json() as { success?: boolean; signedOutAt?: string }
    assert.equal(typeof json.signedOutAt, "string")
    assert.ok(writes.some((w) => w.table === "sign_ins" && w.op === "update"))
    const update = writes.find((w) => w.table === "sign_ins" && w.op === "update")
    assert.equal((update?.payload as { sign_out_time?: string }).sign_out_time, json.signedOutAt)
    assert.equal((update?.payload as { sign_out_source?: string }).sign_out_source, "manual")
    assert.ok(writes.some((w) => w.table === "audit_logs" && w.op === "insert"))
  })

  it("keeps a signed-out visit readable and returns the departure time", async () => {
    const token = issueVisitToken({ signInId: SIGN_IN_ID })
    setOverride("sign_ins", {
      single: {
        id: SIGN_IN_ID,
        visitor_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        sign_out_time: "2026-10-22T16:05:00.000Z",
        badge_number: "V00001",
        visitor: { first_name: "Carlos", last_name: "Mendoza", email: "carlos@example.com" },
      },
    })
    const res = await signOutPost(request(`/visit/${token}/sign-out`) as never, {
      params: Promise.resolve({ token }),
    })
    const json = await res.json() as { alreadySignedOut?: boolean; signedOutAt?: string }
    assert.equal(res.status, 200)
    assert.equal(json.alreadySignedOut, true)
    assert.equal(json.signedOutAt, "2026-10-22T16:05:00.000Z")
    assert.equal(writes.some((w) => w.table === "sign_ins" && w.op === "update"), false)
  })

  it("rejects an expired visit token", async () => {
    const token = issueVisitToken({ signInId: SIGN_IN_ID, now: Date.now() - 8 * 24 * 60 * 60 * 1000, ttlMs: 1000 })
    const res = await signOutPost(request(`/visit/${token}/sign-out`) as never, {
      params: Promise.resolve({ token }),
    })
    assert.equal(res.status, 410)
    assert.equal(writes.some((w) => w.table === "sign_ins"), false)
  })

  it("logs not-my-visitor to audit_logs", async () => {
    const token = issueVisitToken({ signInId: SIGN_IN_ID })
    setOverride("sign_ins", {
      single: {
        id: SIGN_IN_ID,
        visitor_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        host_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        location_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        badge_number: "V00001",
        visitor: { first_name: "Carlos", last_name: "Mendoza", email: "carlos@example.com", company: "GCE" },
        host: { name: "Maya Chen", email: "maya@talusag.com" },
        location: { name: "Houston HQ" },
      },
    })
    setOverride("settings", { list: [] })
    setOverride("profiles", { list: [{ email: "admin@talusag.com", role: "admin", is_active: true }] })
    const res = await disputePost(request(`/visit/${token}/dispute`) as never, {
      params: Promise.resolve({ token }),
    })
    assert.equal(res.status, 200, await res.clone().text())
    const audit = writes.find((w) => w.table === "audit_logs" && w.op === "insert")
    assert.ok(audit)
    assert.equal((audit.payload as { action: string }).action, "visitor.not_my_visitor")
  })
})
