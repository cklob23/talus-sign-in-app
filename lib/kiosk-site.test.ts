import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatHeaderSiteLine,
  formatHeaderSiteParts,
  formatSiteDistance,
  headerLocationKind,
  isEmployeeNearestSiteOnly,
  isVisitorFlowMode,
  nearestOnlyLocations,
  resolveKioskSite,
  shouldShowUnlockedHeaderSiteLine,
  unlockedHeaderSiteLineClassName,
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
    assert.equal(
      formatHeaderSiteLine({
        siteName: "Test Location",
        meters: 52,
        unavailable: false,
        copy,
        includeDistance: false,
      }),
      "Test Location",
    )
    assert.equal(
      formatHeaderSiteLine({
        siteName: "",
        meters: null,
        unavailable: false,
        detecting: true,
        copy,
      }),
      "Checking your location...",
    )
    assert.equal(
      formatHeaderSiteLine({
        siteName: "Test Location",
        meters: null,
        unavailable: false,
        detecting: true,
        copy,
      }),
      "Test Location",
    )
    assert.equal(
      formatHeaderSiteLine({
        siteName: "",
        meters: null,
        unavailable: false,
        detecting: true,
        copy: visitorCopy("es"),
      }),
      "Comprobando su ubicación...",
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
    assert.equal(
      headerLocationKind({
        hasLocations: false,
        geoError: null,
        hasFix: false,
        isDetecting: true,
        meters: null,
      }),
      "detecting",
    )
    assert.equal(
      headerLocationKind({
        hasLocations: false,
        geoError: "permission_denied",
        hasFix: false,
        isDetecting: false,
        meters: null,
      }),
      "none",
    )
  })

  it("shows one unlocked header site line on mobile when a site is resolved or locating", () => {
    assert.equal(shouldShowUnlockedHeaderSiteLine({ siteKind: "distance", hasLocation: true }), true)
    assert.equal(shouldShowUnlockedHeaderSiteLine({ siteKind: "name-only", hasLocation: true }), true)
    assert.equal(shouldShowUnlockedHeaderSiteLine({ siteKind: "unavailable", hasLocation: true }), true)
    assert.equal(shouldShowUnlockedHeaderSiteLine({ siteKind: "detecting", hasLocation: false }), true)
    assert.equal(shouldShowUnlockedHeaderSiteLine({ siteKind: "none", hasLocation: false }), false)
    assert.equal(shouldShowUnlockedHeaderSiteLine({ siteKind: "distance", hasLocation: false }), false)
    assert.match(unlockedHeaderSiteLineClassName(), /min-w-0/)
    assert.match(unlockedHeaderSiteLineClassName(), /order-3/)
    assert.match(unlockedHeaderSiteLineClassName(), /basis-full/)
    assert.doesNotMatch(unlockedHeaderSiteLineClassName(), /max-w-\[42%\]/)
    assert.doesNotMatch(unlockedHeaderSiteLineClassName(), /(?:^|\s)hidden(?:\s|$)/)
    assert.doesNotMatch(unlockedHeaderSiteLineClassName(), /md:hidden/)
    assert.deepEqual(
      formatHeaderSiteParts({ siteName: "Test Location", meters: 52, unavailable: false, copy }),
      { name: "Test Location", detail: "52 m" },
    )
    assert.deepEqual(
      formatHeaderSiteParts({ siteName: "Test Location", meters: null, unavailable: true, copy }),
      { name: "Test Location", detail: copy.locationUnavailable },
    )
    assert.deepEqual(
      formatHeaderSiteParts({
        siteName: "Test Location",
        meters: null,
        unavailable: false,
        detecting: true,
        copy,
      }),
      { name: "Test Location", detail: null },
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

describe("employee nearest-site-only", () => {
  it("locks the unlock Employee Login and post-unlock staff sign-in", () => {
    assert.equal(isEmployeeNearestSiteOnly("receptionist-login"), true)
    assert.equal(isEmployeeNearestSiteOnly("employee-login"), true)
    assert.equal(isEmployeeNearestSiteOnly("home"), false)
    assert.equal(isEmployeeNearestSiteOnly("sign-in"), false)
  })

  it("returns only the resolved site from a full location list", () => {
    const all = [{ id: "test" }, { id: "boone" }, { id: "eagle" }, { id: "kenya" }, { id: "spain" }]
    assert.deepEqual(nearestOnlyLocations(all, "boone"), [{ id: "boone" }])
    assert.deepEqual(nearestOnlyLocations(all, null), [])
    assert.deepEqual(nearestOnlyLocations(all, "gone"), [])
  })
})
