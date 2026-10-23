import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const page = readFileSync(new URL("../app/kiosk/page.tsx", import.meta.url), "utf8")
const welcome = readFileSync(new URL("../components/kiosk/kiosk-welcome.tsx", import.meta.url), "utf8")
const siteLine = readFileSync(new URL("../components/kiosk/kiosk-site-line.tsx", import.meta.url), "utf8")

describe("unlocked kiosk home chrome", () => {
  it("renders one header site line instead of a second name-only location", () => {
    assert.match(page, /<KioskSiteLine/)
    assert.doesNotMatch(page, /Select location/)
    assert.equal((page.match(/<MapPin/g) || []).length, 0)
    assert.match(page, /hidden min-w-0 items-center gap-3 text-sm md:flex/)
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
