import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { contrastRatio } from "./color-contrast.ts"
import { V2_TOKENS } from "./v2-tokens.ts"

function assertAa(name: string, fg: string, bg: string, min: number) {
  const ratio = contrastRatio(fg, bg)
  assert.ok(ratio !== null, `${name} must be valid hex`)
  assert.ok(ratio >= min, `${name} is ${ratio.toFixed(2)}:1, needs ${min}:1`)
}

describe("v2 tokens stay AA in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    const t = V2_TOKENS[theme]
    it(`passes body and control contrast in ${theme}`, () => {
      assertAa(`text on bg (${theme})`, t.text, t.bg, 4.5)
      assertAa(`text on surface (${theme})`, t.text, t.surface, 4.5)
      assertAa(`muted on surface (${theme})`, t.muted, t.surface, 4.5)
      assertAa(`muted on bg (${theme})`, t.muted, t.bg, 4.5)
      assertAa(`muted on surface-2 (${theme})`, t.muted, t.surface2, 4.5)
      assertAa(`on-primary on primary (${theme})`, t.onPrimary, t.primary, 4.5)
      assertAa(`primary-text on surface (${theme})`, t.primaryText, t.surface, 4.5)
      assertAa(`primary-text on accent-soft (${theme})`, t.primaryText, t.accentSoft, 4.5)
      assertAa(`success on success-soft (${theme})`, t.success, t.successSoft, 4.5)
      assertAa(`warning on warning-soft (${theme})`, t.warning, t.warningSoft, 4.5)
      assertAa(`danger on surface (${theme})`, t.danger, t.surface, 4.5)
      assertAa(`danger on danger-soft (${theme})`, t.danger, t.dangerSoft, 4.5)
      assertAa(`field on surface (${theme})`, t.field, t.surface, 3)
      assertAa(`primary on surface (${theme})`, t.primary, t.surface, 3)
      assertAa(`focus on surface (${theme})`, t.focus, t.surface, 3)
    })
  }

  it("keeps the same primary fill in both themes", () => {
    assert.equal(V2_TOKENS.light.primary, V2_TOKENS.dark.primary)
    assert.equal(V2_TOKENS.light.primary, "#00854c")
  })
})
