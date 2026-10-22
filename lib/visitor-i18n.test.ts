import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { fill, visitorCopy } from "./visitor-i18n.ts"

describe("visitor copy", () => {
  it("keeps English and Spanish sentences short and paired", () => {
    const en = visitorCopy("en")
    const es = visitorCopy("es")
    assert.equal(en.trainingAck, "I watched the video. I will follow the safety rules.")
    assert.equal(es.trainingAck, "Vi el video. Seguiré las reglas de seguridad.")
    assert.equal(en.geofenceVisitor, "Sign in is paused. Please ask reception.")
    assert.equal(es.emailHint.includes("video"), true)
    assert.equal(en.emailHint.includes("visit record"), false)
  })

  it("fills host and idle templates", () => {
    assert.equal(fill(visitorCopy("en").hostTold, { host: "Maya Chen" }), "We told Maya Chen you are here.")
    assert.equal(fill(visitorCopy("en").startingOver, { seconds: 8 }), "Starting over in 8s. Tap to keep going.")
  })
})
