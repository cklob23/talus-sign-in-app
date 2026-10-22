import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { issueSignedToken, readSignedToken } from "./signed-token.ts"
import { issueTrainingLinkToken, issueVisitToken, readTrainingLinkToken, readVisitToken } from "./visit-token.ts"

const SECRET = "test-secret-at-least-16-chars"
const T0 = 1_760_000_000_000

describe("signed tokens", () => {
  it("round-trips a training link token", () => {
    const token = issueTrainingLinkToken({
      payload: {
        email: "diego@example.com",
        firstName: "Diego",
        lastName: "Ruiz",
        visitorTypeId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        locationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      },
      now: T0,
      secret: SECRET,
      ttlMs: 60_000,
    })
    const read = readTrainingLinkToken(token, { now: T0 + 1_000, secret: SECRET })
    assert.equal(read.ok, true)
    if (!read.ok) return
    assert.equal(read.payload.email, "diego@example.com")
  })

  it("expires a training link after its ttl", () => {
    const token = issueTrainingLinkToken({
      payload: {
        email: "diego@example.com",
        firstName: "Diego",
        lastName: "Ruiz",
        visitorTypeId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        locationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      },
      now: T0,
      secret: SECRET,
      ttlMs: 60_000,
    })
    const read = readTrainingLinkToken(token, { now: T0 + 61_000, secret: SECRET })
    assert.equal(read.ok, false)
    if (read.ok) return
    assert.equal(read.reason, "expired")
  })

  it("rejects a forged or wrong-kind token", () => {
    const visit = issueVisitToken({
      signInId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      now: T0,
      secret: SECRET,
    })
    assert.equal(readTrainingLinkToken(visit, { now: T0, secret: SECRET }).ok, false)
    assert.equal(readVisitToken(visit, { now: T0, secret: "a-different-secret-123" }).ok, false)
    assert.equal(readVisitToken("garbage", { now: T0, secret: SECRET }).ok, false)
  })

  it("round-trips a visit token and expires it", () => {
    const token = issueVisitToken({
      signInId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      hostId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      now: T0,
      secret: SECRET,
      ttlMs: 5_000,
    })
    const ok = readVisitToken(token, { now: T0 + 1_000, secret: SECRET })
    assert.equal(ok.ok, true)
    const expired = readVisitToken(token, { now: T0 + 6_000, secret: SECRET })
    assert.equal(expired.ok, false)
    if (!expired.ok) assert.equal(expired.reason, "expired")
  })

  it("cannot reuse a visit signature on a training_code kind", () => {
    const token = issueSignedToken({
      kind: "visit",
      payload: { signInId: "x" },
      issuedAt: T0,
      expiresAt: T0 + 60_000,
      secret: SECRET,
    })
    const read = readSignedToken(token, "training_code", { now: T0, secret: SECRET })
    assert.equal(read.ok, false)
  })
})
