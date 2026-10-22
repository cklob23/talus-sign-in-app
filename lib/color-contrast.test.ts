import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  ACCENT_GREEN,
  RECOMMENDED_PRIMARY,
  contrastRatio,
  contrastWarning,
  passesAaWithWhite,
} from "./color-contrast.ts"

describe("color contrast", () => {
  it("flags the decorative accent as failing AA on white text", () => {
    const ratio = contrastRatio("#ffffff", ACCENT_GREEN)
    assert.ok(ratio !== null && ratio < 4.5)
    assert.equal(passesAaWithWhite(ACCENT_GREEN), false)
    assert.match(contrastWarning(ACCENT_GREEN) || "", /4\.5:1/)
  })

  it("keeps kiosk outline and helper text AA on white", () => {
    const outline = contrastRatio("#00703f", "#ffffff")
    const title = contrastRatio("#0f1a13", "#ffffff")
    const helper = contrastRatio("#55625a", "#ffffff")
    assert.ok(outline !== null && outline >= 4.5)
    assert.ok(title !== null && title >= 4.5)
    assert.ok(helper !== null && helper >= 4.5)
  })

  it("accepts the recommended primary for button text", () => {
    const ratio = contrastRatio("#ffffff", RECOMMENDED_PRIMARY)
    assert.ok(ratio !== null && ratio >= 4.5)
    assert.equal(passesAaWithWhite(RECOMMENDED_PRIMARY), true)
    assert.equal(contrastWarning(RECOMMENDED_PRIMARY), null)
  })

  it("warns on the previous default brand green", () => {
    assert.equal(passesAaWithWhite("#10B981"), false)
    assert.match(contrastWarning("#10B981") || "", /#00854C|#00854c/)
  })
})
