import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { classifyCameraError, photoFallbackAllowed, photoRequirementMet } from "./camera-fallback.ts"

describe("camera fallback", () => {
  it("classifies permission denial separately from a missing camera", () => {
    assert.equal(classifyCameraError({ name: "NotAllowedError" }), "denied")
    assert.equal(classifyCameraError({ name: "NotFoundError" }), "unavailable")
    assert.equal(classifyCameraError("boom"), "unavailable")
  })

  it("lets a required-photo visitor finish only when the camera failed", () => {
    assert.equal(photoFallbackAllowed({ required: true, hasPhoto: false, cameraUnavailable: false }), false)
    assert.equal(photoFallbackAllowed({ required: true, hasPhoto: false, cameraUnavailable: true }), true)
    assert.equal(photoFallbackAllowed({ required: true, hasPhoto: true, cameraUnavailable: false }), true)
    assert.equal(photoFallbackAllowed({ required: false, hasPhoto: false, cameraUnavailable: false }), true)
  })

  it("accepts a required photo only when uploaded or flagged photo_missing", () => {
    assert.equal(photoRequirementMet({ required: true, hasPhoto: false, photoMissing: false }), false)
    assert.equal(photoRequirementMet({ required: true, hasPhoto: false, photoMissing: true }), true)
    assert.equal(photoRequirementMet({ required: true, hasPhoto: true, photoMissing: false }), true)
    assert.equal(photoRequirementMet({ required: false, hasPhoto: false, photoMissing: false }), true)
  })
})
