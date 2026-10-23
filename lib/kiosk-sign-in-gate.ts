import type { VisitorCopy } from "@/lib/visitor-i18n"

export type KioskGateReason = "off" | "checking" | "denied" | "no_fix" | "outside" | "poor_accuracy" | "ok"

export type KioskHomeSignInVisibility = {
  offerVisitorSignIn: boolean
  offerEmployeeSignIn: boolean
  offerBooking: boolean
  showBlockedState: boolean
}

/**
 * Home-screen sign-in actions (visitor, staff, booking) are offered only when
 * the shared kiosk/QR fence says the device is on site, or staff overrode it.
 * Receptionist unlock stays on a separate screen and is not gated here.
 */
export function kioskHomeSignInVisibility(input: {
  gateBlocked: boolean
  staffOverride: boolean
  hasLocations: boolean
}): KioskHomeSignInVisibility {
  const allowed = input.hasLocations && (input.staffOverride || !input.gateBlocked)
  return {
    offerVisitorSignIn: allowed,
    offerEmployeeSignIn: allowed,
    offerBooking: allowed,
    showBlockedState: !allowed,
  }
}

export function kioskBlockedCopy(
  reason: KioskGateReason | "no_sites",
  copy: Pick<VisitorCopy, "checkingLocation" | "locationUnavailable" | "geofenceVisitor" | "geofenceBlockedHelp" | "noSitesStaff">,
): { title: string; help: string } {
  if (reason === "no_sites") {
    return { title: copy.noSitesStaff, help: copy.geofenceVisitor }
  }
  if (reason === "checking") {
    return { title: copy.checkingLocation, help: copy.geofenceVisitor }
  }
  if (reason === "denied" || reason === "no_fix" || reason === "poor_accuracy") {
    return { title: copy.locationUnavailable, help: copy.geofenceVisitor }
  }
  return { title: copy.geofenceVisitor, help: copy.geofenceBlockedHelp }
}
