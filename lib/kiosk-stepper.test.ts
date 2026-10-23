import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { KIOSK_STEPPER_LABEL_BREAKPOINT, kioskStepperLabels } from "./kiosk-stepper.ts"
import { visitorCopy } from "./visitor-i18n.ts"

const stepperSrc = readFileSync(new URL("../components/kiosk/kiosk-stepper.tsx", import.meta.url), "utf8")

describe("kiosk stepper labels", () => {
  it("includes the safety step only when training is required", () => {
    const en = visitorCopy("en")
    const es = visitorCopy("es")
    assert.deepEqual(kioskStepperLabels(en, true), [en.you, en.details, en.safety, en.photo])
    assert.deepEqual(kioskStepperLabels(en, false), [en.you, en.details, en.photo])
    assert.deepEqual(kioskStepperLabels(es, true), [es.you, es.details, es.safety, es.photo])
    assert.equal(kioskStepperLabels(en, true).length, 4)
    assert.equal(kioskStepperLabels(en, false).length, 3)
  })

  it("hides word labels on narrow viewports so numbers are not truncated", () => {
    assert.equal(KIOSK_STEPPER_LABEL_BREAKPOINT, "md")
    assert.match(stepperSrc, /hidden truncate text-15 font-semibold md:inline/)
    assert.match(stepperSrc, /index \+ 1/)
    assert.match(stepperSrc, /aria-label=\{`\$\{index \+ 1\}\. \$\{label\}`\}/)
    assert.doesNotMatch(
      stepperSrc,
      /<span className="truncate text-15 font-semibold">\{label\}<\/span>/,
      "labels must not stay visible-and-truncated on mobile",
    )
  })
})
