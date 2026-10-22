import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatHeaderSiteLine,
  formatSiteDistance,
  headerLocationKind,
  isVisitorFlowMode,
  resolveKioskSite,
} from "./kiosk-site.ts"
import { visitorCopy } from "./visitor-i18n.ts"

const sites = [{ id: "a" }, { id: "b" }]
const copy = visitorCopy("en")

describe("kiosk site selection", () => {
  it("uses the nearest site when GPS is ready", () => {
    const resolved = resolveKioskSite({
      locations: sites,
      nearestId: "b",
      persistedId: "a",
      currentId: "a",
      gpsReady: true,
      freeze: false,
    })
    assert.deepEqual(resolved, { id: "b", source: "nearest" })
  })

  it("keeps the current site mid sign-in even if a nearer site appears", () => {
    const resolved = resolveKioskSite({
      locations: sites,
      nearestId: "b",
      persistedId: "b",
      currentId: "a",
      gpsReady: true,
      freeze: true,
    })
    assert.deepEqual(resolved, { id: "a", source: "current" })
  })

  it("falls back to the last staff-set site when GPS is unavailable", () => {
    const resolved = resolveKioskSite({
      locations: sites,
      nearestId: null,
      persistedId: "b",
      currentId: "",
      gpsReady: false,
      freeze: false,
    })
    assert.deepEqual(resolved, { id: "b", source: "persisted" })
  })

  it("uses the first location when nothing is persisted", () => {
    const resolved = resolveKioskSite({
      locations: sites,
      nearestId: null,
      persistedId: null,
      currentId: null,
      gpsReady: false,
      freeze: false,
    })
    assert.deepEqual(resolved, { id: "a", source: "default" })
  })

  it("reports none when there are no locations", () => {
    const resolved = resolveKioskSite({
      locations: [],
      nearestId: "a",
      persistedId: "a",
      currentId: "a",
      gpsReady: true,
      freeze: false,
    })
    assert.deepEqual(resolved, { id: null, source: "none" })
  })

  it("ignores a persisted id that is no longer in the list", () => {
    const resolved = resolveKioskSite({
      locations: sites,
      nearestId: null,
      persistedId: "gone",
      currentId: null,
      gpsReady: false,
      freeze: false,
    })
    assert.deepEqual(resolved, { id: "a", source: "default" })
  })
})

describe("kiosk header site line", () => {
  it("formats the site and metric distance with a space before the unit", () => {
    assert.equal(formatSiteDistance(52), "52 m")
    assert.equal(formatSiteDistance(1000), "1 km")
    assert.equal(
      formatHeaderSiteLine({ siteName: "Test Location", meters: 52, unavailable: false, copy }),
      "Test Location, 52 m away",
    )
    assert.equal(
      formatHeaderSiteLine({ siteName: "Test Location", meters: 1500, unavailable: false, copy }),
      "Test Location, 1.5 km away",
    )
    assert.equal(
      formatHeaderSiteLine({ siteName: "Test Location", meters: null, unavailable: true, copy }),
      "Test Location · Location unavailable",
    )
    assert.equal(
      formatHeaderSiteLine({
        siteName: "Test Location",
        meters: 52,
        unavailable: true,
        copy: visitorCopy("es"),
      }),
      "Test Location · Ubicación no disponible",
    )
    assert.equal(
      formatHeaderSiteLine({
        siteName: "Test Location",
        meters: 52,
        unavailable: false,
        copy: visitorCopy("es"),
      }),
      "Test Location, a 52 m",
    )
  })

  it("classifies permission-denied and missing fixes as unavailable", () => {
    assert.equal(
      headerLocationKind({
        hasLocations: true,
        geoError: "permission_denied",
        hasFix: false,
        isDetecting: false,
        meters: null,
      }),
      "unavailable",
    )
    assert.equal(
      headerLocationKind({
        hasLocations: true,
        geoError: null,
        hasFix: true,
        isDetecting: false,
        meters: 52,
      }),
      "distance",
    )
    assert.equal(
      headerLocationKind({
        hasLocations: false,
        geoError: null,
        hasFix: false,
        isDetecting: false,
        meters: null,
      }),
      "none",
    )
    assert.equal(
      headerLocationKind({
        hasLocations: true,
        geoError: null,
        hasFix: false,
        isDetecting: true,
        meters: null,
      }),
      "detecting",
    )
  })

  it("does not treat welcome or staff screens as mid sign-in", () => {
    assert.equal(isVisitorFlowMode("home"), false)
    assert.equal(isVisitorFlowMode("employee-login"), false)
    assert.equal(isVisitorFlowMode("receptionist-login"), false)
    assert.equal(isVisitorFlowMode("sign-in"), true)
    assert.equal(isVisitorFlowMode("booking"), true)
    assert.equal(isVisitorFlowMode("photo"), true)
  })
})
