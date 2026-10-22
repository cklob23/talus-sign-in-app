import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { formatDate, formatDateTimeWithZone } from "./timezone.ts"
import {
  visitActionsVisible,
  visitDepartureStamp,
  visitLinkFooter,
  visitorFullName,
} from "./visit-page.ts"
import { issueVisitToken, readVisitToken } from "./visit-token.ts"

const SECRET = "test-secret-at-least-16-chars"
const T0 = 1_760_000_000_000
const EXPIRES_AT = T0 + 7 * 24 * 60 * 60 * 1000
const DEPARTED_AT = "2026-10-22T16:05:00.000Z"
const ZONE = "America/Chicago"

describe("visit page copy and read-only state", () => {
  it("uses the token expiry date in the footer, not sign-out", () => {
    const footer = visitLinkFooter("Maya Chen", EXPIRES_AT, ZONE)
    assert.equal(footer, `This link works for Maya Chen and expires on ${formatDate(new Date(EXPIRES_AT).toISOString(), ZONE)}`)
    assert.equal(footer.includes("signs out"), false)
    assert.equal(footer.includes("Carlos"), false)
  })

  it("uses the visitor full name anywhere a name is shown", () => {
    assert.equal(visitorFullName("Carlos", "Mendoza"), "Carlos Mendoza")
    assert.equal(visitorFullName("Carlos", null), "Carlos")
    assert.equal(visitorFullName("", ""), "Visitor")
    const footer = visitLinkFooter("Maya Chen", EXPIRES_AT, ZONE)
    assert.equal(footer.includes(visitorFullName("Carlos", "Mendoza").split(" ")[0]), false)
  })

  it("hides sign-out and not-my-visitor once the visitor is signed out", () => {
    assert.equal(visitActionsVisible(false), true)
    assert.equal(visitActionsVisible(true), false)
  })

  it("shows the departure time after sign-out", () => {
    assert.equal(visitDepartureStamp(null, ZONE), null)
    assert.equal(visitDepartureStamp(DEPARTED_AT, ZONE), formatDateTimeWithZone(DEPARTED_AT, ZONE))
  })

  it("keeps a signed-out visit readable until the token expires", () => {
    const token = issueVisitToken({
      signInId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      now: T0,
      secret: SECRET,
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    })
    const afterSignOut = readVisitToken(token, { now: T0 + 60 * 60 * 1000, secret: SECRET })
    assert.equal(afterSignOut.ok, true)
    if (!afterSignOut.ok) return
    assert.equal(visitActionsVisible(true), false)
    assert.ok(visitDepartureStamp(DEPARTED_AT, ZONE))
    assert.ok(visitLinkFooter("Maya Chen", afterSignOut.expiresAt, ZONE).includes("expires on"))
    const expired = readVisitToken(token, { now: afterSignOut.expiresAt + 1, secret: SECRET })
    assert.equal(expired.ok, false)
  })
})
