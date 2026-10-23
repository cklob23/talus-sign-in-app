import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { formatMailClock, formatMailTime } from "./email-shell.ts"
import { renderHostArrivalEmail, renderHostTrainingEmail } from "./host-mail.ts"
import { renderSignoutSummaryEmail } from "./signout-mail.ts"
import { renderPasswordResetEmail } from "./password-mail.ts"

const arrival = renderHostArrivalEmail({
  visitorName: `Carlos <img src=x onerror=alert(1)>`,
  visitorCompany: "Gulf Coast Electric",
  visitorTypeName: "Contractor",
  locationName: "Houston HQ",
  locationLabel: "Reception",
  signedInBy: "QR",
  badgeNumber: "V4821",
  arrivedAt: "2026-10-22T14:05:00.000Z",
  timeZone: "America/Chicago",
  visitUrl: "https://signin.talusag.com/visit/abc",
  appOrigin: "https://signin.talusag.com",
  trainingLine: "Cleared",
})

describe("host arrival email", () => {
  it("leads with who, when, and where, plus a visit link", () => {
    assert.match(arrival.subject, /Carlos/)
    assert.match(arrival.subject, /Houston HQ/)
    assert.match(arrival.preheader, /Gulf Coast Electric/)
    assert.match(arrival.html, /is here to see you/)
    assert.match(arrival.html, /Open visit details/)
    assert.match(arrival.html, /https:\/\/signin\.talusag\.com\/visit\/abc/)
    assert.match(arrival.text, /Open visit details/)
    assert.match(arrival.preheader, /Reception/)
    assert.equal(arrival.preheader.includes("Main lobby kiosk"), false)
    assert.equal(arrival.html.includes("Main lobby kiosk"), false)
    assert.equal(arrival.html.includes("waiting for you at the reception area"), false)
    assert.equal(arrival.html.includes("<img src=x"), false)
    assert.match(arrival.html, /&lt;img src=x/)
    assert.match(arrival.html, /color-scheme/)
    assert.match(arrival.html, /role="presentation"/)
    assert.match(arrival.html, /#00854c/)
    assert.match(arrival.subject, /9:05 AM CDT/)
    assert.equal(arrival.subject.includes("UTC"), false)
    assert.match(arrival.html, /9:05 AM CDT/)
    assert.match(arrival.text, /9:05 AM CDT/)
    assert.match(arrival.html, /Arrived/)
  })

  it("labels a QR sign-in as QR code, not a lobby kiosk", () => {
    const mail = renderHostArrivalEmail({
      visitorName: "QA TEST Link11",
      locationName: "Test Location",
      locationLabel: "QR code",
      signedInBy: "QR code",
    })
    assert.match(mail.preheader, /QR code/)
    assert.match(mail.html, /QR code/)
    assert.match(mail.text, /Location: QR code/)
    assert.equal(mail.html.includes("Main lobby kiosk"), false)
    assert.equal(mail.text.includes("Main lobby kiosk"), false)
  })

  it("uses America/New_York when the location timezone is missing", () => {
    const mail = renderHostArrivalEmail({
      visitorName: "QA TEST Link11",
      locationName: "Test Location",
      arrivedAt: "2026-10-22T13:13:00.000Z",
    })
    const clock = formatMailClock("2026-10-22T13:13:00.000Z")
    assert.equal(mail.subject, `QA TEST Link11 is here (Test Location, ${clock})`)
    assert.match(clock, /9:13/)
    assert.match(clock, /EDT/)
    assert.equal(clock.includes("UTC"), false)
    assert.match(mail.html, /9:13/)
    assert.match(mail.text, /9:13/)
    assert.equal(mail.subject.includes("UTC"), false)
    assert.equal(formatMailClock("2026-10-22T13:13:00.000Z", null), formatMailClock("2026-10-22T13:13:00.000Z", "America/New_York"))
    assert.match(formatMailTime("2026-10-22T13:13:00.000Z"), /EDT/)
    assert.equal(formatMailTime("2026-10-22T13:13:00.000Z").includes("UTC"), false)
  })
})

describe("training, sign-out, and reset emails", () => {
  it("shares the table shell, plaintext, and one footer", () => {
    const training = renderHostTrainingEmail({
      visitorName: "Carlos Mendoza",
      locationName: "Houston HQ",
      locationLabel: "QR code",
      arrivedAt: "2026-10-22T13:13:00.000Z",
      visitUrl: "https://signin.talusag.com/visit/abc",
      appOrigin: "https://signin.talusag.com",
      readyAbout: "about 8 minutes",
    })
    const trainingUnknown = renderHostTrainingEmail({
      visitorName: "Carlos Mendoza",
      locationName: "Houston HQ",
      arrivedAt: "2026-10-22T13:13:00.000Z",
    })
    const signout = renderSignoutSummaryEmail({
      kind: "location",
      hostName: "Maya Chen",
      locationName: "Houston HQ",
      whenLabel: "6:00 PM",
      visitors: [{ name: "Carlos Mendoza", company: "Gulf Coast Electric", badge: "V4821", signedInAt: "8:01 AM" }],
      reviewUrl: "https://signin.talusag.com/admin/history",
      appOrigin: "https://signin.talusag.com",
    })
    const reset = renderPasswordResetEmail({
      email: "maya@talusag.com",
      resetUrl: "https://signin.talusag.com/auth/reset?token=abc",
      appOrigin: "https://signin.talusag.com",
    })

    assert.match(training.preheader, /Ready in about 8 minutes/)
    assert.equal(training.preheader.includes("about 3 minutes"), false)
    assert.match(training.html, /QR code/)
    assert.equal(training.html.includes("Main lobby kiosk"), false)
    assert.equal(trainingUnknown.preheader.includes("Ready in"), false)
    assert.match(training.html, /Training in progress/)
    assert.match(signout.subject, /site sign-out/)
    assert.equal(signout.text.includes("automatically signed out"), false)
    assert.equal(signout.text.includes("it_support@talusag.com") || signout.html.includes("it_support@talusag.com"), true)
    assert.match(signout.text, /Anyone still on site/)
    assert.match(reset.text, /Choose a new password/)
    assert.match(reset.html, /Talus Ag Visitor Management/)
    assert.match(reset.html, /#00854c/)
  })
})
