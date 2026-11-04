import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { describe, it } from "node:test"

const layout = readFileSync(new URL("../components/admin/admin-layout-client.tsx", import.meta.url), "utf8")
const header = readFileSync(new URL("../components/admin/admin-header.tsx", import.meta.url), "utf8")
const sidebar = readFileSync(new URL("../components/admin/admin-sidebar.tsx", import.meta.url), "utf8")
const root = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8")
const preview = readFileSync(new URL("../app/dev/preview-ui/preview-client.tsx", import.meta.url), "utf8")
const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")

describe("admin mobile tab bar removed", () => {
  it("does not ship AdminMobileNav or a bottom tab bar", () => {
    assert.equal(
      existsSync(new URL("../components/admin/admin-mobile-nav.tsx", import.meta.url)),
      false,
    )
    assert.doesNotMatch(layout, /AdminMobileNav/)
    assert.doesNotMatch(layout, /admin-mobile-nav/)
    assert.doesNotMatch(preview, /admin-mobile-nav/)
    assert.doesNotMatch(preview, /label: "Home"/)
  })

  it("does not reserve extra bottom padding for a tab bar", () => {
    assert.doesNotMatch(layout, /pb-\[calc\(6rem\+env\(safe-area-inset-bottom/)
    assert.doesNotMatch(layout, /sm:pb-\[calc\(6rem\+env\(safe-area-inset-bottom/)
    assert.doesNotMatch(preview, /pb-\[calc\(6rem\+env\(safe-area-inset-bottom/)
    assert.doesNotMatch(preview, /sm:pb-\[calc\(6rem\+env\(safe-area-inset-bottom/)
  })

  it("keeps document scroll and min-h-dvh", () => {
    assert.match(layout, /min-h-dvh/)
    assert.doesNotMatch(layout, /min-h-svh/)
    assert.doesNotMatch(layout, /min-h-screen/)
    assert.doesNotMatch(layout, /className="[^"]*overflow-auto/)
    assert.match(layout, /overflow-visible/)
    assert.match(layout, /\[transform:none\]/)
    assert.match(layout, /\[filter:none\]/)
    assert.match(layout, /\[contain:none\]/)
  })

  it("enables iOS safe-area via viewport-fit=cover and dvh on html", () => {
    assert.match(root, /viewportFit:\s*"cover"/)
    assert.match(globals, /min-height:\s*100svh/)
    assert.match(globals, /min-height:\s*100dvh/)
  })

  it("exposes every former tab destination in the header hamburger menu", () => {
    assert.match(header, /<MobileSidebar/)
    assert.match(sidebar, /export function MobileSidebar/)
    assert.match(sidebar, /href: "\/admin", label: "Dashboard"/)
    assert.match(sidebar, /href: "\/admin\/visitors", label: "On site now"/)
    assert.match(sidebar, /href: "\/admin\/bookings", label: "Bookings"/)
    assert.match(sidebar, /<NavContent onNavigate=\{\(\) => setSheetOpen\(false\)\} \/>/)
  })
})
