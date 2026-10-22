import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_RADIUS_METERS,
  MAX_RADIUS_METERS,
  MIN_RADIUS_METERS,
  formatRadiusMeters,
  parseLocationRadius,
  radiusOverCap,
} from "./location-radius.ts"

describe("parseLocationRadius", () => {
  it("uses 500 m when the value is missing", () => {
    assert.deepEqual(parseLocationRadius(null), { ok: true, meters: DEFAULT_RADIUS_METERS, enabled: true })
    assert.deepEqual(parseLocationRadius(undefined), { ok: true, meters: DEFAULT_RADIUS_METERS, enabled: true })
    assert.deepEqual(parseLocationRadius(""), { ok: true, meters: DEFAULT_RADIUS_METERS, enabled: true })
  })

  it("treats 0 as an explicit off", () => {
    assert.deepEqual(parseLocationRadius(0), { ok: true, meters: 0, enabled: false })
    assert.deepEqual(parseLocationRadius("0"), { ok: true, meters: 0, enabled: false })
    assert.deepEqual(parseLocationRadius(false), { ok: true, meters: 0, enabled: false })
  })

  it("accepts the 25 to 5000 m range", () => {
    assert.deepEqual(parseLocationRadius(25), { ok: true, meters: 25, enabled: true })
    assert.deepEqual(parseLocationRadius(500), { ok: true, meters: 500, enabled: true })
    assert.deepEqual(parseLocationRadius(5000), { ok: true, meters: 5000, enabled: true })
  })

  it("rejects values below 25 or above 5000", () => {
    assert.equal(parseLocationRadius(24).ok, false)
    assert.equal(parseLocationRadius(5001).ok, false)
    assert.equal(parseLocationRadius(5_000_000).ok, false)
    assert.equal(parseLocationRadius(-10).ok, false)
  })

  it("keeps an already-stored over-cap value until it is edited", () => {
    const kept = parseLocationRadius(5_000_000, 5_000_000)
    assert.deepEqual(kept, { ok: true, meters: 5_000_000, enabled: true })
    assert.equal(parseLocationRadius(4_000_000, 5_000_000).ok, false)
  })

  it("rejects non-numeric input", () => {
    assert.equal(parseLocationRadius("wide").ok, false)
  })
})

describe("formatRadiusMeters", () => {
  it("shows metres below 1000 and kilometres at or above 1000", () => {
    assert.equal(formatRadiusMeters(25), "25 m")
    assert.equal(formatRadiusMeters(500), "500 m")
    assert.equal(formatRadiusMeters(999), "999 m")
    assert.equal(formatRadiusMeters(1000), "1 km")
    assert.equal(formatRadiusMeters(1500), "1.5 km")
    assert.equal(formatRadiusMeters(76_220), "76.2 km")
    assert.equal(formatRadiusMeters(5_000), "5 km")
    assert.equal(formatRadiusMeters(5_000_000), "5,000 km")
    assert.equal(formatRadiusMeters(1_000_000), "1,000 km")
  })

  it("flags stored values over the save cap", () => {
    assert.equal(radiusOverCap(5000), false)
    assert.equal(radiusOverCap(5_000_000), true)
    assert.equal(MIN_RADIUS_METERS, 25)
    assert.equal(MAX_RADIUS_METERS, 5000)
  })
})
