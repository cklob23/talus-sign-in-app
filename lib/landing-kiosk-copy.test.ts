import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("IT Support contact placement", () => {
  it("keeps the help line off the public landing footer", () => {
    const src = readFileSync(join(root, "app/page.tsx"), "utf8")
    assert.doesNotMatch(src, /Need help\? Contact IT Support/)
    assert.doesNotMatch(src, /it_support@talusag\.com/)
    assert.match(src, /Visitor Management/)
  })

  it("shows the help line on the kiosk unlock shell", () => {
    const src = readFileSync(join(root, "app/kiosk/page.tsx"), "utf8")
    assert.match(src, /Need help\? Contact IT Support/)
    assert.match(src, /it_support@talusag\.com/)
    assert.match(src, /receptionist-login/)
  })
})
