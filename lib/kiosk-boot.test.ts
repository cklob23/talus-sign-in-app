import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { kioskBootScreen } from "./kiosk-boot.ts"

describe("kiosk boot screen", () => {
  it("shows a loading state until the session check finishes", () => {
    assert.equal(kioskBootScreen({ sessionChecked: false, hasSession: false }), "loading")
    assert.equal(kioskBootScreen({ sessionChecked: false, hasSession: true }), "loading")
  })

  it("shows login only when there is truly no session", () => {
    assert.equal(kioskBootScreen({ sessionChecked: true, hasSession: false }), "login")
    assert.equal(kioskBootScreen({ sessionChecked: true, hasSession: true }), "app")
  })
})
