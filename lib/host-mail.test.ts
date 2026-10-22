import assert from "node:assert/strict"
import { describe, it } from "node:test"
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
  trainingLine: "Cleared",
})

describe("host arrival email", () => {
  it("leads with who, when, and where, plus a visit link", () => {
    assert.match(arrival.subject, /Carlos/)
    assert.match(arrival.subject, /Houston HQ/)
    assert.match(arrival.preheader, /Gulf Coast Electric/)
    assert.match(arrival.html, /Carlos is here to see you/)
    assert.match(arrival.html, /Open visit details/)
    assert.match(arrival.html, /https:\/\/signin\.talusag\.com\/visit\/abc/)
    assert.match(arrival.text, /Open visit details/)
    assert.equal(arrival.html.includes("waiting for you at the reception area"), false)
    assert.equal(arrival.html.includes("<img src=x"), false)
    assert.match(arrival.html, /&lt;img src=x/)
    assert.match(arrival.html, /color-scheme/)
    assert.match(arrival.html, /role="presentation"/)
    assert.match(arrival.html, /#00854c/)
  })
})

describe("training, sign-out, and reset emails", () => {
  it("shares the table shell, plaintext, and one footer", () => {
    const training = renderHostTrainingEmail({
      visitorName: "Carlos Mendoza",
      locationName: "Houston HQ",
      visitUrl: "https://signin.talusag.com/visit/abc",
    })
    const signout = renderSignoutSummaryEmail({
      kind: "location",
      hostName: "Maya Chen",
      locationName: "Houston HQ",
      whenLabel: "6:00 PM",
      visitors: [{ name: "Carlos Mendoza", company: "Gulf Coast Electric", badge: "V4821", signedInAt: "8:01 AM" }],
      reviewUrl: "https://signin.talusag.com/admin/history",
    })
    const reset = renderPasswordResetEmail({
      email: "maya@talusag.com",
      resetUrl: "https://signin.talusag.com/auth/reset?token=abc",
    })

    assert.match(training.preheader, /Ready in about 3 minutes/)
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
