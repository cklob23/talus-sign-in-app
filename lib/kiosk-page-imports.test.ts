import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const page = readFileSync(new URL("../app/kiosk/page.tsx", import.meta.url), "utf8")
const siteLine = readFileSync(new URL("../components/kiosk/kiosk-site-line.tsx", import.meta.url), "utf8")

/**
 * The v2-redesign merge kept /kiosk call sites but dropped these imports.
 * typescript.ignoreBuildErrors is on, so a missing import ships as a
 * render-time ReferenceError and Next shows the generic error shell.
 */
describe("kiosk page render-critical imports", () => {
  it("imports boot, site, and location UI used on first render", () => {
    const required = [
      'from "@/lib/kiosk-boot"',
      'from "@/lib/kiosk-site"',
      'from "@/components/kiosk/kiosk-session-loading"',
      'from "@/components/kiosk/kiosk-site-line"',
      'from "@/components/kiosk/kiosk-resolved-site"',
      "kioskBootScreen",
      "headerLocationKind",
      "shouldShowUnlockedHeaderSiteLine",
      "unlockedHeaderSiteLineClassName",
      "isVisitorFlowMode",
      "readStaffSite",
      "resolveKioskSite",
      "KioskSessionLoading",
      "KioskSiteLine",
      "KioskResolvedSite",
      "staffGeofenceLine",
      "kioskHomeSignInVisibility",
      "KioskGeofenceBlocked",
    ]
    for (const token of required) {
      assert.match(page, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${token}`)
    }
    // MapPin lives on the shared site line after the single-header-site change.
    assert.match(siteLine, /MapPin/)
  })
})
