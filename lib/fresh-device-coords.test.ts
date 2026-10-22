import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { MAX_COORDS_AGE_MS } from "./geofence-guard.ts"
import {
  FRESH_POSITION_OPTIONS,
  FRESH_POSITION_TIMEOUT_MS,
  isWatchFixFresh,
  resolveFreshDeviceCoords,
  type GeoReader,
  type PositionLike,
} from "./fresh-device-coords.ts"

const now = Date.now()

function position(lat: number, lng: number, accuracy: number, timestamp: number): PositionLike {
  return { coords: { latitude: lat, longitude: lng, accuracy }, timestamp }
}

function mockGeo(handler: GeoReader["getCurrentPosition"]): GeoReader & { options: unknown[] } {
  const options: unknown[] = []
  return {
    options,
    getCurrentPosition(success, error, opts) {
      options.push(opts)
      handler(success, error, opts)
    },
  }
}

const staleWatch = { lat: 34.0113, lng: -85.0683, accuracy: 12, timestamp: now - 120_000 }
const recentWatch = { lat: 34.0113, lng: -85.0683, accuracy: 12, timestamp: now - 8_000 }
const freshFix = position(34.0114, -85.0682, 6, now)

describe("resolveFreshDeviceCoords", () => {
  it("submit after >45 s on page uses fresh coords", async () => {
    const geo = mockGeo((success) => success(freshFix))
    const result = await resolveFreshDeviceCoords({
      action: "signin",
      fallback: staleWatch,
      geo,
      now,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.source, "fresh")
    assert.equal(result.coords.lat, 34.0114)
    assert.equal(result.coords.lng, -85.0682)
    assert.equal(result.coords.accuracy, 6)
    assert.equal(result.coords.timestamp, now)
    assert.deepEqual(geo.options[0], {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: FRESH_POSITION_TIMEOUT_MS,
    })
    assert.ok(now - staleWatch.timestamp > MAX_COORDS_AGE_MS)
  })

  it("fresh read failure falls back to a watch fix under 45 s", async () => {
    const geo = mockGeo((_success, error) => error?.({ code: 3, message: "timeout" }))
    const result = await resolveFreshDeviceCoords({
      action: "signin",
      fallback: recentWatch,
      geo,
      now,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.source, "fallback")
    assert.equal(result.coords.timestamp, recentWatch.timestamp)
    assert.equal(isWatchFixFresh(recentWatch, now), true)
  })

  it("fresh read failure with a stale watch fix is rejected so Retry can re-read", async () => {
    const geo = mockGeo((_success, error) => error?.({ code: 3, message: "timeout" }))
    const result = await resolveFreshDeviceCoords({
      action: "signin",
      fallback: staleWatch,
      geo,
      now,
    })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.reason, "unavailable")
    assert.equal(isWatchFixFresh(staleWatch, now), false)
  })

  it("sign-out uses fresh coords", async () => {
    const geo = mockGeo((success) => success(freshFix))
    const result = await resolveFreshDeviceCoords({
      action: "signout",
      fallback: staleWatch,
      geo,
      now,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.source, "fresh")
    assert.equal(result.coords.timestamp, now)
    assert.deepEqual(geo.options[0], { ...FRESH_POSITION_OPTIONS })
  })

  it("fresh read failure with no watch fix is rejected", async () => {
    const geo = mockGeo((_success, error) => error?.({ code: 2, message: "unavailable" }))
    const result = await resolveFreshDeviceCoords({ fallback: null, geo, now })
    assert.equal(result.ok, false)
  })
})
