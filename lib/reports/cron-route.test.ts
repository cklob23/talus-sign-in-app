import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

process.env.KIOSK_ROUTE_TEST_MOCKS = "1"

const { GET, POST } = await import("../../app/api/cron/reports/route.ts")
const { resetBookingInviteCronMock, setBookingInviteCronImpl } = await import("../test-mocks/booking-invite-cron.ts")
const { resetDueReportsMock, setDueReportsImpl } = await import("../test-mocks/reports-run-due.ts")

const previousSecret = process.env.CRON_SECRET

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previousSecret
  resetBookingInviteCronMock()
  resetDueReportsMock()
})

function authorizedRequest() {
  return new Request("https://example.com/api/cron/reports", {
    method: "POST",
    headers: { authorization: "Bearer test-cron-secret" },
  })
}

describe("reports cron auth", () => {
  it("fails closed when CRON_SECRET is not set", async () => {
    delete process.env.CRON_SECRET
    const res = await POST(new Request("https://example.com/api/cron/reports", { method: "POST" }))
    assert.equal(res.status, 500)
    const body = await res.json()
    assert.match(body.error, /CRON_SECRET/)
  })

  it("rejects a missing or wrong bearer token", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const missing = await GET(new Request("https://example.com/api/cron/reports"))
    assert.equal(missing.status, 401)

    const wrong = await POST(
      new Request("https://example.com/api/cron/reports", {
        method: "POST",
        headers: { authorization: "Bearer nope" },
      }),
    )
    assert.equal(wrong.status, 401)
  })
})

describe("reports cron combined jobs", () => {
  it("runs booking invites and reports and returns both results", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    setBookingInviteCronImpl(async () => ({ ok: true, claimed: 1, sent: 1, failed: 0, skipped: 0 }))
    setDueReportsImpl(async () => ({ ok: true, success: true, due: 0, results: [] }))

    const res = await POST(authorizedRequest())
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body.bookingInvites, { ok: true, claimed: 1, sent: 1, failed: 0, skipped: 0 })
    assert.equal(body.reports.success, true)
    assert.equal(body.reports.due, 0)
  })

  it("still runs reports when booking invites throws", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    let reportsRan = false
    setBookingInviteCronImpl(async () => {
      throw new Error("invite boom")
    })
    setDueReportsImpl(async () => {
      reportsRan = true
      return { ok: true, success: true, due: 2, results: [] }
    })

    const res = await POST(authorizedRequest())
    assert.equal(res.status, 500)
    assert.equal(reportsRan, true)
    const body = await res.json()
    assert.equal(body.bookingInvites.error, "invite boom")
    assert.equal(body.reports.success, true)
    assert.equal(body.reports.due, 2)
  })

  it("still runs booking invites when reports throws", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    let invitesRan = false
    setBookingInviteCronImpl(async () => {
      invitesRan = true
      return { ok: true, claimed: 0, sent: 0, failed: 0, skipped: 0 }
    })
    setDueReportsImpl(async () => {
      throw new Error("reports boom")
    })

    const res = await POST(authorizedRequest())
    assert.equal(res.status, 500)
    assert.equal(invitesRan, true)
    const body = await res.json()
    assert.equal(body.bookingInvites.ok, true)
    assert.equal(body.reports.error, "reports boom")
  })
})
