import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const page = readFileSync(new URL("../app/kiosk/page.tsx", import.meta.url), "utf8")
const welcome = readFileSync(new URL("../components/kiosk/kiosk-welcome.tsx", import.meta.url), "utf8")
const siteLine = readFileSync(new URL("../components/kiosk/kiosk-site-line.tsx", import.meta.url), "utf8")

const unlockedHeader = [...page.matchAll(/<header[\s\S]*?<\/header>/g)]
  .map((match) => match[0])
  .find((header) => header.includes("KioskSiteLine"))

describe("unlocked kiosk home chrome", () => {
  it("renders exactly one header KioskSiteLine and no extra MapPin", () => {
    assert.ok(unlockedHeader, "unlocked header with KioskSiteLine is missing")
    assert.equal((unlockedHeader.match(/<KioskSiteLine/g) || []).length, 1)
    assert.equal((page.match(/<KioskSiteLine/g) || []).length, 1)
    assert.equal((page.match(/<MapPin/g) || []).length, 0)
    assert.doesNotMatch(page, /Select location/)
    assert.doesNotMatch(unlockedHeader, /compact/)
    assert.match(siteLine, /lucide-react/)
    assert.equal((siteLine.match(/<MapPin/g) || []).length, 1)
  })

  it("does not hide the resolved mobile site line or keep a duplicate md:hidden copy", () => {
    assert.ok(unlockedHeader, "unlocked header with KioskSiteLine is missing")
    assert.doesNotMatch(unlockedHeader, /md:hidden/)
    assert.doesNotMatch(unlockedHeader, /receptionistUser && siteKind !== "detecting"/)
    assert.match(page, /shouldShowUnlockedHeaderSiteLine/)
    assert.match(page, /unlockedHeaderSiteLineClassName/)
    assert.match(unlockedHeader, /flex-wrap/)
    const siteLineOpen = unlockedHeader.match(/<KioskSiteLine[\s\S]*?\/>/)
    assert.ok(siteLineOpen, "KioskSiteLine JSX is missing")
    assert.doesNotMatch(siteLineOpen[0], /(?:^|\s)hidden(?:\s|$)/)
    const beforeSiteLine = unlockedHeader.slice(0, unlockedHeader.indexOf("<KioskSiteLine"))
    const lastHiddenMdFlex = beforeSiteLine.lastIndexOf("hidden")
    const lastCloseDiv = beforeSiteLine.lastIndexOf("</div>")
    assert.ok(
      lastHiddenMdFlex === -1 || lastCloseDiv > lastHiddenMdFlex,
      "KioskSiteLine must not sit inside a hidden md:flex clock wrapper",
    )
  })

  it("stacks site name and distance on mobile instead of truncating the header line", () => {
    assert.match(siteLine, /flex-col md:hidden/)
    assert.match(siteLine, /hidden truncate md:inline/)
    assert.match(siteLine, /formatHeaderSiteParts/)
    assert.doesNotMatch(siteLine, /<span className="truncate">/)
  })

  it("keeps booking and staff as outline buttons", () => {
    assert.match(welcome, /copy\.haveBooking/)
    assert.match(welcome, /copy\.staffSignIn/)
    assert.match(welcome, /copy\.bookingHint/)
    assert.equal((welcome.match(/variant="outline"/g) || []).length, 2)
    assert.doesNotMatch(welcome, /variant="ghost"/)
    assert.doesNotMatch(welcome, /<button type="button" className="inline-flex min-h-12 items-center gap-2 text-primary-text"/)
  })

  it("uses theme tokens for header site text so dark theme stays readable", () => {
    assert.match(siteLine, /text-foreground/)
    assert.match(siteLine, /text-primary-text/)
    assert.doesNotMatch(siteLine, /text-\[#0f1a13\]/)
    assert.doesNotMatch(welcome, /text-\[#0f1a13\]/)
    assert.doesNotMatch(welcome, /text-\[#55625a\]/)
  })
})
