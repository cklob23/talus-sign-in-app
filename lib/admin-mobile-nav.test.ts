import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const nav = readFileSync(new URL("../components/admin/admin-mobile-nav.tsx", import.meta.url), "utf8")
const layout = readFileSync(new URL("../components/admin/admin-layout-client.tsx", import.meta.url), "utf8")
const root = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8")
const preview = readFileSync(new URL("../app/dev/preview-ui/preview-client.tsx", import.meta.url), "utf8")
const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")

describe("admin mobile tab bar pin", () => {
  it("pins the bar with position:fixed, viewport edges, z-index, and safe-area padding", () => {
    assert.match(nav, /position:\s*"fixed"/)
    assert.match(nav, /bottom:\s*0/)
    assert.match(nav, /left:\s*0/)
    assert.match(nav, /right:\s*0/)
    assert.match(nav, /zIndex:\s*50/)
    assert.match(nav, /env\(safe-area-inset-bottom/)
    assert.match(nav, /fixed bottom-0 left-0 right-0 z-50/)
    assert.match(nav, /createPortal\(nav, document\.body\)/)
    assert.match(nav, /data-testid="admin-mobile-nav"/)
  })

  it("lets the document scroll instead of an inner overflow container", () => {
    assert.match(layout, /min-h-dvh/)
    assert.doesNotMatch(layout, /min-h-svh/)
    assert.doesNotMatch(layout, /min-h-screen/)
    assert.doesNotMatch(layout, /className="[^"]*overflow-auto/)
    assert.match(layout, /overflow-visible/)
    assert.match(layout, /pb-\[calc\(6rem\+env\(safe-area-inset-bottom/)
    assert.match(layout, /sm:pb-\[calc\(6rem\+env\(safe-area-inset-bottom/)
    assert.match(layout, /\[transform:none\]/)
    assert.match(layout, /\[filter:none\]/)
    assert.match(layout, /\[contain:none\]/)
  })

  it("enables iOS safe-area via viewport-fit=cover and dvh on html", () => {
    assert.match(root, /viewportFit:\s*"cover"/)
    assert.match(globals, /min-height:\s*100svh/)
    assert.match(globals, /min-height:\s*100dvh/)
  })

  it("uses the same pin on the preview AdminChrome mock", () => {
    assert.match(preview, /min-h-dvh/)
    assert.doesNotMatch(preview, /min-h-svh min-h-dvh/)
    assert.match(preview, /sm:pb-\[calc\(6rem\+env\(safe-area-inset-bottom/)
    assert.doesNotMatch(preview, /overflow-auto p-4 pb-24/)
    assert.match(preview, /data-testid="admin-mobile-nav"/)
    assert.match(preview, /position:\s*"fixed"/)
    assert.match(preview, /zIndex:\s*50/)
    assert.match(preview, /env\(safe-area-inset-bottom/)
  })

  it("is the only bottom tab bar and is mounted from the shared /admin layout", () => {
    assert.match(layout, /<AdminMobileNav /)
    assert.doesNotMatch(nav, /employee|kiosk/i)
  })
})
