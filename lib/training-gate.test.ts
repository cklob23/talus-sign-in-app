import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  issueTrainingTicket,
  kioskMinWatchMs,
  parseTrainingProof,
  qrTrainingScope,
  readTrainingTicket,
  requiredWatchMs,
  TRAINING_SLACK_MS,
  verifyTrainingProof,
} from "./training-gate.ts"

const SECRET = "test-secret-at-least-16-chars"
const TYPE = "dddddddd-dddd-dddd-dddd-dddddddddddd"
const SCOPE = qrTrainingScope("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
const VIDEO_SECONDS = 453 // the 7:33 contractor video QA used
const T0 = 1_760_000_000_000

function proof(over: Partial<ReturnType<typeof parseTrainingProof>> = {}) {
  return {
    ticket: issueTrainingTicket({ visitorTypeId: TYPE, scope: SCOPE, now: T0, secret: SECRET }),
    acknowledged: true,
    videoSeconds: VIDEO_SECONDS,
    bypass: false,
    ...over,
  }
}

function verify(p: ReturnType<typeof proof>, now: number, extra: { scope?: string; type?: string } = {}) {
  return verifyTrainingProof(p, {
    visitorTypeId: extra.type ?? TYPE,
    scope: extra.scope ?? SCOPE,
    minWatchMs: requiredWatchMs(p.videoSeconds),
    now,
    secret: SECRET,
  })
}

describe("training tickets", () => {
  it("round-trips a signed ticket", () => {
    const ticket = issueTrainingTicket({ visitorTypeId: TYPE, scope: SCOPE, now: T0, secret: SECRET })
    const payload = readTrainingTicket(ticket, SECRET)
    assert.equal(payload?.t, TYPE)
    assert.equal(payload?.s, SCOPE)
    assert.equal(payload?.iat, T0)
  })

  it("rejects a forged or tampered ticket", () => {
    const ticket = issueTrainingTicket({ visitorTypeId: TYPE, scope: SCOPE, now: T0, secret: SECRET })
    assert.equal(readTrainingTicket(ticket, "a-different-secret-123"), null)
    const [body, sig] = ticket.split(".")
    const forged = Buffer.from(JSON.stringify({ v: 1, t: TYPE, s: SCOPE, iat: 0, n: "x" })).toString("base64url")
    assert.equal(readTrainingTicket(`${forged}.${sig}`, SECRET), null)
    assert.equal(readTrainingTicket(`${body}.`, SECRET), null)
    assert.equal(readTrainingTicket("garbage", SECRET), null)
    assert.equal(readTrainingTicket(42, SECRET), null)
  })

  it("accepts a visitor who watched the whole video and ticked the box", () => {
    const result = verify(proof(), T0 + VIDEO_SECONDS * 1000 + 5_000)
    assert.equal(result.ok, true)
  })

  it("blocks sign-in while the video is still playing (V84041)", () => {
    const result = verify(proof(), T0 + 60_000)
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.code, "training_too_early")
  })

  it("blocks sign-in without the acknowledgement", () => {
    const result = verify(proof({ acknowledged: false }), T0 + VIDEO_SECONDS * 1000 + 5_000)
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.code, "training_not_acknowledged")
  })

  it("blocks a missing ticket, a wrong visitor type and a wrong location", () => {
    const later = T0 + VIDEO_SECONDS * 1000 + 5_000
    const missing = verify(proof({ ticket: null }), later)
    assert.equal(!missing.ok && missing.code, "training_ticket_missing")
    const wrongType = verify(proof(), later, { type: "ffffffff-ffff-ffff-ffff-ffffffffffff" })
    assert.equal(!wrongType.ok && wrongType.code, "training_ticket_invalid")
    const wrongScope = verify(proof(), later, { scope: "kiosk" })
    assert.equal(!wrongScope.ok && wrongScope.code, "training_ticket_invalid")
  })

  it("expires a ticket after six hours", () => {
    const result = verify(proof(), T0 + 7 * 60 * 60 * 1000)
    assert.equal(!result.ok && result.code, "training_ticket_expired")
  })

  it("treats a missing video length as not watched", () => {
    assert.equal(requiredWatchMs(null), null)
    assert.equal(requiredWatchMs(0), null)
    assert.equal(requiredWatchMs(Number.NaN), null)
    const result = verify(proof({ videoSeconds: null }), T0 + 60 * 60 * 1000)
    assert.equal(!result.ok && result.code, "training_too_early")
  })

  it("allows the slack window and caps absurd video lengths", () => {
    assert.equal(requiredWatchMs(VIDEO_SECONDS), VIDEO_SECONDS * 1000 - TRAINING_SLACK_MS)
    assert.equal(requiredWatchMs(10 * 60 * 60), 3 * 60 * 60 * 1000 - TRAINING_SLACK_MS)
    assert.equal(kioskMinWatchMs(), 180_000 - TRAINING_SLACK_MS)
  })

  it("parses a loosely typed proof", () => {
    assert.deepEqual(parseTrainingProof(undefined), { ticket: null, acknowledged: false, videoSeconds: null, bypass: false })
    assert.deepEqual(parseTrainingProof({ ticket: "t", acknowledged: "yes", videoSeconds: "453", bypass: 1 }), {
      ticket: "t",
      acknowledged: false,
      videoSeconds: null,
      bypass: false,
    })
  })
})
