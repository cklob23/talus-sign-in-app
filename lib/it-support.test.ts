import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"
import { IT_SUPPORT } from "./it-support.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("IT Support contact placement", () => {
  it("keeps the Talus IT mailbox", () => {
    assert.equal(IT_SUPPORT, "it_support@talusag.com")
  })

  it("removes the help line from the public landing footer", () => {
    const landing = readFileSync(join(root, "app/page.tsx"), "utf8")
    assert.match(landing, /Visitor Management/)
    assert.doesNotMatch(landing, /Need help\? Contact IT Support/)
    assert.doesNotMatch(landing, /it_support@talusag\.com/)
  })

  it("shows the help line on the kiosk shell", () => {
    const footer = readFileSync(join(root, "components/kiosk/kiosk-help-footer.tsx"), "utf8")
    const kiosk = readFileSync(join(root, "app/kiosk/page.tsx"), "utf8")
    const unlock = readFileSync(join(root, "app/kiosk/forgot-password/page.tsx"), "utf8")
    assert.match(footer, /Need help\? Contact IT Support at/)
    assert.match(footer, /IT_SUPPORT/)
    assert.match(kiosk, /KioskHelpFooter/)
    assert.match(unlock, /KioskHelpFooter/)
  })
})
