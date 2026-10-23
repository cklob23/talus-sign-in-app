import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseTrainingCompleteResponse, trainingLinkShowsCleared } from "./training-watch.ts"

describe("training link complete response", () => {
  it("shows the cleared state from a successful complete even when a ticket is set", () => {
    const parsed = parseTrainingCompleteResponse(
      { ok: true },
      { success: true, message: "You are cleared until Oct 2027.", messageEs: "Está autorizado." },
      "You are cleared",
    )
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.equal(trainingLinkShowsCleared(true), true)
    assert.equal(parsed.message, "You are cleared until Oct 2027.")
    assert.equal(parsed.messageEs, "Está autorizado.")
  })

  it("returns an error message when complete fails", () => {
    const parsed = parseTrainingCompleteResponse(
      { ok: false },
      { error: "Please watch the full safety training video before signing in." },
      "You are cleared",
    )
    assert.equal(parsed.ok, false)
    if (parsed.ok) return
    assert.equal(parsed.error, "Please watch the full safety training video before signing in.")
    assert.equal(trainingLinkShowsCleared(false), false)
  })

  it("treats an ok HTTP response with success false as a failure", () => {
    const parsed = parseTrainingCompleteResponse(
      { ok: true },
      { success: false, error: "Could not save your training." },
      "You are cleared",
    )
    assert.equal(parsed.ok, false)
    if (parsed.ok) return
    assert.equal(parsed.error, "Could not save your training.")
  })
})
