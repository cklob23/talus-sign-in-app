import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { escapeHtml } from "./html-escape.ts"
import { issueSignedToken, TRAINING_LINK_TTL_MS } from "./signed-token.ts"
import { renderTrainingLinkEmail } from "./training-mail.ts"
import { issueTrainingLinkToken, readTrainingLinkToken } from "./visit-token.ts"

const SECRET = "test-secret-at-least-16-chars"
const ORIGIN = "https://signin.talusag.com"
const T0 = 1_760_000_000_000

const LONG_PAYLOAD = {
  email: "visitor.with.a.long.email.address@contractor.example.com",
  firstName: "Christopher-Alexander",
  lastName: "Montgomery-Williams",
  company: "International Agricultural Contracting Services LLC",
  visitorTypeId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  locationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  bookingId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  hostId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  hostName: "Maria Elena Rodriguez-Santos",
}

describe("training link email URLs", () => {
  it("keeps a real-length token URL intact in html and text", () => {
    const token = issueSignedToken({
      kind: "training_link",
      payload: LONG_PAYLOAD,
      issuedAt: T0,
      expiresAt: T0 + TRAINING_LINK_TTL_MS,
      secret: SECRET,
    })
    assert.ok(token.includes("."), "signed token must include an HMAC separator")

    const watchUrl = `${ORIGIN}/t/${encodeURIComponent(token)}`
    assert.ok(watchUrl.length > 500, `expected a real-length URL, got ${watchUrl.length}`)

    const rendered = renderTrainingLinkEmail({
      lang: "en",
      visitorFirstName: LONG_PAYLOAD.firstName,
      hostName: LONG_PAYLOAD.hostName,
      companyName: "Talus Ag",
      siteName: "Talus Ag Headquarters",
      videoTitle: "Site Safety Orientation",
      watchUrl,
      appOrigin: ORIGIN,
    })

    assert.ok(rendered.html.includes(`href="${escapeHtml(watchUrl)}"`))
    assert.ok(rendered.text.includes(watchUrl))
    assert.equal(rendered.html.includes(watchUrl.slice(0, 500) + '"'), false)

    const read = readTrainingLinkToken(token, { now: T0 + 1_000, secret: SECRET })
    assert.equal(read.ok, true)
    if (!read.ok) return
    assert.equal(read.payload.email, LONG_PAYLOAD.email)
    assert.equal(read.payload.hostName, LONG_PAYLOAD.hostName)
    assert.equal(read.payload.company, LONG_PAYLOAD.company)
  })

  it("issues shorter tokens without hostName or company", () => {
    const token = issueTrainingLinkToken({
      payload: LONG_PAYLOAD,
      now: T0,
      secret: SECRET,
    })
    const read = readTrainingLinkToken(token, { now: T0 + 1_000, secret: SECRET })
    assert.equal(read.ok, true)
    if (!read.ok) return
    assert.equal(read.payload.email, LONG_PAYLOAD.email)
    assert.equal(read.payload.hostId, LONG_PAYLOAD.hostId)
    assert.equal(read.payload.hostName, undefined)
    assert.equal(read.payload.company, undefined)
    assert.ok(token.length < issueSignedToken({
      kind: "training_link",
      payload: LONG_PAYLOAD,
      issuedAt: T0,
      expiresAt: T0 + TRAINING_LINK_TTL_MS,
      secret: SECRET,
    }).length)
  })
})
