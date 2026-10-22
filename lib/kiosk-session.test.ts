import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { signReceptionistSession, verifyReceptionistSession } from "./kiosk-session.ts"

const SECRET = "test-kiosk-session-secret-value"
const OTHER_SECRET = "a-different-secret-value-xx"

const session = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "receptionist@talusag.com",
  name: "Reception Desk",
  role: "staff",
  loginAt: "2026-10-21T12:00:00.000Z",
}

describe("receptionist session HMAC", () => {
  it("round-trips a signed session", () => {
    const cookie = signReceptionistSession(session, SECRET)
    const verified = verifyReceptionistSession(cookie, SECRET)
    assert.deepEqual(verified, session)
  })

  it("rejects a forged unsigned base64 JSON cookie", () => {
    const forged = Buffer.from(JSON.stringify(session)).toString("base64")
    assert.equal(verifyReceptionistSession(forged, SECRET), null)
  })

  it("rejects a tampered payload", () => {
    const cookie = signReceptionistSession(session, SECRET)
    const [payload, signature] = cookie.split(".")
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...session, id: "22222222-2222-2222-2222-222222222222" }),
    ).toString("base64url")
    assert.equal(verifyReceptionistSession(`${tamperedPayload}.${signature}`, SECRET), null)
    assert.ok(payload)
  })

  it("rejects a cookie signed with a different secret", () => {
    const cookie = signReceptionistSession(session, OTHER_SECRET)
    assert.equal(verifyReceptionistSession(cookie, SECRET), null)
  })

  it("rejects missing or empty values", () => {
    assert.equal(verifyReceptionistSession(undefined, SECRET), null)
    assert.equal(verifyReceptionistSession("", SECRET), null)
    assert.equal(verifyReceptionistSession("no-dot", SECRET), null)
  })

  it("sign throws when the secret is missing or too short", () => {
    assert.throws(() => signReceptionistSession(session, ""), /KIOSK_SESSION_SECRET/)
    assert.throws(() => signReceptionistSession(session, "short"), /KIOSK_SESSION_SECRET/)
  })
})
