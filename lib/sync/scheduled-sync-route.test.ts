import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

process.env.KIOSK_ROUTE_TEST_MOCKS = "1"

const { GET, POST } = await import("../../app/api/cron/scheduled-sync/route.ts")

const previousSecret = process.env.CRON_SECRET

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previousSecret
})

describe("scheduled-sync cron auth", () => {
  it("fails closed when CRON_SECRET is not set", async () => {
    delete process.env.CRON_SECRET
    const res = await GET(new Request("https://example.com/api/cron/scheduled-sync"))
    assert.equal(res.status, 500)
    const body = await res.json()
    assert.match(body.error, /CRON_SECRET/)
  })

  it("rejects a missing or wrong bearer token", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const missing = await GET(new Request("https://example.com/api/cron/scheduled-sync"))
    assert.equal(missing.status, 401)

    const wrong = await POST(
      new Request("https://example.com/api/cron/scheduled-sync?dryRun=1", {
        method: "POST",
        headers: { authorization: "Bearer nope" },
      }),
    )
    assert.equal(wrong.status, 401)
  })
})
