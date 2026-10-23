import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { kioskBlockedCopy, kioskHomeSignInVisibility } from "./kiosk-sign-in-gate.ts"
import { visitorCopy } from "./visitor-i18n.ts"

const welcomeSrc = readFileSync(new URL("../components/kiosk/kiosk-welcome.tsx", import.meta.url), "utf8")
const pageSrc = readFileSync(new URL("../app/kiosk/page.tsx", import.meta.url), "utf8")
const callbackSrc = readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8")
const employeeLoginSrc = readFileSync(new URL("../app/kiosk/page.tsx", import.meta.url), "utf8")

describe("kiosk home sign-in visibility", () => {
  it("offers visitor and employee sign-in only when on site or staff overrode", () => {
    assert.deepEqual(
      kioskHomeSignInVisibility({ gateBlocked: false, staffOverride: false, hasLocations: true }),
      { offerVisitorSignIn: true, offerEmployeeSignIn: true, offerBooking: true, showBlockedState: false },
    )
    assert.deepEqual(
      kioskHomeSignInVisibility({ gateBlocked: true, staffOverride: false, hasLocations: true }),
      { offerVisitorSignIn: false, offerEmployeeSignIn: false, offerBooking: false, showBlockedState: true },
    )
    assert.deepEqual(
      kioskHomeSignInVisibility({ gateBlocked: true, staffOverride: true, hasLocations: true }),
      { offerVisitorSignIn: true, offerEmployeeSignIn: true, offerBooking: true, showBlockedState: false },
    )
    assert.deepEqual(
      kioskHomeSignInVisibility({ gateBlocked: false, staffOverride: false, hasLocations: false }),
      { offerVisitorSignIn: false, offerEmployeeSignIn: false, offerBooking: false, showBlockedState: true },
    )
  })

  it("uses existing location-unavailable and geofence copy for the blocked state", () => {
    const en = visitorCopy("en")
    const es = visitorCopy("es")
    assert.deepEqual(kioskBlockedCopy("checking", en), { title: en.checkingLocation, help: en.geofenceVisitor })
    assert.deepEqual(kioskBlockedCopy("denied", en), { title: en.locationUnavailable, help: en.geofenceVisitor })
    assert.deepEqual(kioskBlockedCopy("no_fix", en), { title: en.locationUnavailable, help: en.geofenceVisitor })
    assert.deepEqual(kioskBlockedCopy("outside", en), { title: en.geofenceVisitor, help: en.geofenceBlockedHelp })
    assert.equal(kioskBlockedCopy("outside", es).help, es.geofenceBlockedHelp)
    assert.equal(kioskBlockedCopy("no_sites", en).title, en.noSitesStaff)
  })

  it("hides visitor and staff actions from the welcome card when sign-in is not offered", () => {
    assert.match(welcomeSrc, /offerSignIn \? \(/)
    assert.match(welcomeSrc, /KioskGeofenceBlocked/)
    assert.match(welcomeSrc, /\{offerSignIn \? \(/)
    assert.match(welcomeSrc, /onClick=\{onStaff\}/)
    assert.match(welcomeSrc, /\{offerSignIn \? \([\s\S]*copy\.staffSignIn/)
    assert.doesNotMatch(
      welcomeSrc,
      /disabled=\{visitorBlocked\}/,
      "blocked visitors must not still see a disabled sign-in action",
    )
  })

  it("gates kiosk home and employee login on the shared visibility helper", () => {
    assert.match(pageSrc, /kioskHomeSignInVisibility/)
    assert.match(pageSrc, /offerSignIn=\{signInOffer\.offerVisitorSignIn\}/)
    assert.match(pageSrc, /signInOffer\.offerEmployeeSignIn/)
    assert.match(pageSrc, /\/api\/kiosk\/employee-signin/)
    assert.match(employeeLoginSrc, /completeEmployeeSiteSignIn/)
    assert.match(pageSrc, /mode === "receptionist-login"/)
  })

  it("does not write an employee site sign-in from the Microsoft callback", () => {
    assert.match(callbackSrc, /employee_pending_signin=true/)
    assert.doesNotMatch(
      callbackSrc,
      /from\("employee_sign_ins"\)\.insert/,
      "OAuth callback must not insert employee_sign_ins before the fence check",
    )
  })
})
