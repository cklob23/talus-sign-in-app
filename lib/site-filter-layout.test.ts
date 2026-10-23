import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { SITE_FILTER_SM_PX, shouldUseMobileSiteSelect } from "./site-filter-layout.ts"

describe("location overview site filter layout", () => {
  it("uses the mobile Select before width is measured", () => {
    assert.equal(shouldUseMobileSiteSelect(), true)
    assert.equal(shouldUseMobileSiteSelect({ containerWidthPx: null, viewportWidthPx: undefined }), true)
  })

  it("uses the Select when the Location Overview card is ~427 CSS px", () => {
    assert.equal(
      shouldUseMobileSiteSelect({ containerWidthPx: 427, viewportWidthPx: 1280 }),
      true
    )
  })

  it("uses the Select when the viewport is under sm", () => {
    assert.equal(
      shouldUseMobileSiteSelect({ containerWidthPx: 800, viewportWidthPx: 427 }),
      true
    )
  })

  it("keeps pills at sm and above when both widths are desktop", () => {
    assert.equal(
      shouldUseMobileSiteSelect({
        containerWidthPx: SITE_FILTER_SM_PX,
        viewportWidthPx: SITE_FILTER_SM_PX,
      }),
      false
    )
    assert.equal(
      shouldUseMobileSiteSelect({ containerWidthPx: 960, viewportWidthPx: 1280 }),
      false
    )
  })
})
