import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  evaluateGeofence,
  isGeofenceEnabled,
  kioskClientGate,
  parseDeviceCoords,
  shouldEnforceGeofence,
} from "./checkin-geofence.ts"
import {
  checkCoordsFreshness,
  isImpossibleJump,
  rateLimitGeofence,
  recordGeofenceSighting,
  resetGeofenceSightings,
} from "./geofence-guard.ts"
import { resetRateLimits } from "./rate-limit.ts"

const site = {
  latitude: 34.0113025,
  longitude: -85.0682674,
  auto_signin_radius_meters: 200,
}

const now = Date.now()

function coords(lat: number, lng: number, accuracy: number, timestamp = now) {
  return { lat, lng, accuracy, timestamp }
}

describe("isGeofenceEnabled", () => {
  it("treats a missing radius as on, and 0 as an explicit off", () => {
    assert.equal(isGeofenceEnabled({ latitude: 1, longitude: 2, auto_signin_radius_meters: null }), true)
    assert.equal(isGeofenceEnabled({ latitude: 1, longitude: 2, auto_signin_radius_meters: 0 }), false)
    assert.equal(
      isGeofenceEnabled({ latitude: 1, longitude: 2, auto_signin_radius_meters: 200, geofence_enabled: false }),
      false,
    )
    assert.equal(
      isGeofenceEnabled({ latitude: 1, longitude: 2, auto_signin_radius_meters: 0, geofence_enabled: true }),
      true,
    )
  })

  it("requires coordinates and an enabled fence before enforcing", () => {
    assert.equal(shouldEnforceGeofence({ latitude: null, longitude: null, auto_signin_radius_meters: 200 }), false)
    assert.equal(shouldEnforceGeofence({ ...site, auto_signin_radius_meters: 0 }), false)
    assert.equal(shouldEnforceGeofence(site, false), false)
    assert.equal(shouldEnforceGeofence(site, true), true)
  })
})

describe("evaluateGeofence", () => {
  it("passes a reading at the centre, including a true 0 m distance", () => {
    const verdict = evaluateGeofence(site, coords(site.latitude, site.longitude, 10))
    assert.equal(verdict.ok, true)
    if (verdict.ok) assert.ok(verdict.distance < 1)
  })

  it("passes just inside the radius after the accuracy credit", () => {
    const inside = evaluateGeofence(site, coords(34.0130125, site.longitude, 10))
    assert.equal(inside.ok, true)
  })

  it("fails just outside the radius after the accuracy credit", () => {
    const outside = evaluateGeofence(site, coords(34.0132375, site.longitude, 10))
    assert.equal(outside.ok, false)
    if (!outside.ok) assert.equal(outside.reason, "outside")
  })

  it("caps accuracy credit at 100 m so a 150 m claim cannot hide 250 m", () => {
    const far = evaluateGeofence(site, coords(34.0144525, site.longitude, 150))
    assert.equal(far.ok, false)
  })

  it("rejects accuracy over 2000 m", () => {
    const poor = evaluateGeofence(site, coords(site.latitude, site.longitude, 2500))
    assert.equal(poor.ok, false)
    if (!poor.ok) assert.equal(poor.reason, "poor_accuracy")
  })

  it("gives no credit when accuracy is missing", () => {
    const parsed = parseDeviceCoords({ lat: 34.0135525, lng: site.longitude })
    assert.ok(parsed)
    assert.equal(parsed.accuracy, 0)
    const verdict = evaluateGeofence(site, parsed)
    assert.equal(verdict.ok, false)
  })

  it("uses a 500 m default when radius is null", () => {
    const verdict = evaluateGeofence(
      { ...site, auto_signin_radius_meters: null },
      coords(site.latitude, site.longitude, 10),
    )
    assert.equal(verdict.ok, true)
    if (verdict.ok) assert.equal(verdict.radius, 500)
  })
})

describe("spoof and freshness guards", () => {
  beforeEach(() => {
    resetGeofenceSightings()
    resetRateLimits()
  })

  it("rejects a missing or stale timestamp", () => {
    assert.equal(checkCoordsFreshness({ lat: site.latitude, lng: site.longitude, accuracy: 10 }), "stale_coords")
    assert.equal(checkCoordsFreshness(coords(site.latitude, site.longitude, 10, now - 120_000), now), "stale_coords")
    assert.equal(checkCoordsFreshness(coords(site.latitude, site.longitude, 10, now), now), "ok")
  })

  it("rejects an impossible jump from a previous reading on the same token", () => {
    recordGeofenceSighting("qr:token:1.1.1.1", 51.5, -0.1, now - 5_000)
    const spoof = coords(site.latitude, site.longitude, 5, now)
    assert.equal(isImpossibleJump({ lat: 51.5, lng: -0.1, seenAt: now - 5_000 }, spoof, now), true)
  })

  it("allows a realistic walk between nearby readings", () => {
    const previous = { lat: site.latitude, lng: site.longitude, seenAt: now - 10_000 }
    const next = coords(34.0114, site.longitude, 8, now)
    assert.equal(isImpossibleJump(previous, next, now), false)
  })

  it("rate-limits repeated checks from the same scope", () => {
    let blocked = 0
    for (let i = 0; i < 25; i++) {
      if (!rateLimitGeofence("qr:token:9.9.9.9").allowed) blocked++
    }
    assert.ok(blocked >= 1)
  })
})

describe("kioskClientGate", () => {
  it("does not block when the admin turned the fence off", () => {
    const gate = kioskClientGate({
      target: { ...site, auto_signin_radius_meters: 0 },
      coords: null,
      geoError: "permission_denied",
      isDetecting: false,
    })
    assert.equal(gate.blocked, false)
    assert.equal(gate.reason, "off")
  })

  it("blocks when location permission is denied", () => {
    const gate = kioskClientGate({
      target: site,
      coords: null,
      geoError: "permission_denied",
      isDetecting: false,
    })
    assert.equal(gate.blocked, true)
    assert.equal(gate.reason, "denied")
  })

  it("blocks a missing fix instead of failing open", () => {
    const gate = kioskClientGate({
      target: site,
      coords: null,
      geoError: null,
      isDetecting: false,
    })
    assert.equal(gate.blocked, true)
    assert.equal(gate.reason, "no_fix")
  })

  it("lets staff override a denied or outside reading", () => {
    const gate = kioskClientGate({
      target: site,
      coords: null,
      geoError: "permission_denied",
      isDetecting: false,
      staffOverride: true,
    })
    assert.equal(gate.blocked, false)
    assert.equal(gate.reason, "ok")
  })

  it("treats a 0 m distance as inside", () => {
    const gate = kioskClientGate({
      target: site,
      coords: coords(site.latitude, site.longitude, 8),
      geoError: null,
      isDetecting: false,
    })
    assert.equal(gate.blocked, false)
    assert.equal(gate.reason, "ok")
  })
})
