import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { escapeHtml } from "./html-escape.ts"
import { formatBookingWhen, renderBookingInviteEmail } from "./booking-mail.ts"

const ORIGIN = "https://signin.talusag.com"
const ARRIVAL = "2026-10-25T14:00:00.000Z"
const SITE_TZ = "America/Chicago"

describe("renderBookingInviteEmail", () => {
  it("renders the English registered email with site, local time, host, and kiosk/QR instructions", () => {
    const when = formatBookingWhen(ARRIVAL, SITE_TZ, "en")
    const rendered = renderBookingInviteEmail({
      lang: "en",
      visitorFirstName: "Diego",
      hostName: "Caleb",
      siteName: "Houston HQ",
      expectedArrival: ARRIVAL,
      timezone: SITE_TZ,
      training: { kind: "none" },
    })

    assert.match(rendered.subject, /You are registered at Houston HQ/)
    assert.match(rendered.html, /You are registered/)
    assert.match(rendered.html, /Houston HQ/)
    assert.match(rendered.html, new RegExp(escapeHtml(when)))
    assert.match(rendered.html, /Caleb/)
    assert.match(rendered.html, /I have a booking/)
    assert.match(rendered.html, /scan the QR code at reception/i)
    assert.equal(rendered.html.includes("Watch the safety video"), false)
    assert.equal(rendered.html.includes("cleared until"), false)
    assert.match(rendered.text, /At the kiosk, tap I have a booking and enter this email/)
    assert.equal(rendered.html.includes("—"), false)
    assert.equal(rendered.text.includes("—"), false)
  })

  it("includes a training link when the visitor still needs the video", () => {
    const watchUrl = `${ORIGIN}/t/${"token.part" }?lang=es`
    const rendered = renderBookingInviteEmail({
      lang: "en",
      visitorFirstName: "Diego",
      hostName: "Caleb",
      siteName: "Houston HQ",
      expectedArrival: ARRIVAL,
      timezone: SITE_TZ,
      training: { kind: "link", watchUrl, videoTitle: "Site Safety Orientation" },
      appOrigin: ORIGIN,
    })
    assert.match(rendered.html, /Please watch the safety video before you arrive/)
    assert.ok(rendered.html.includes(`href="${escapeHtml(watchUrl)}"`))
    assert.ok(rendered.text.includes(watchUrl))
  })

  it("says training is cleared until a date and omits the watch button", () => {
    const rendered = renderBookingInviteEmail({
      lang: "en",
      visitorFirstName: "Diego",
      hostName: "Caleb",
      siteName: "Houston HQ",
      expectedArrival: ARRIVAL,
      timezone: SITE_TZ,
      training: { kind: "cleared", until: "Oct 2027" },
    })
    assert.match(rendered.html, /cleared until/)
    assert.match(rendered.html, /Oct 2027/)
    assert.equal(rendered.html.includes("Watch the safety video"), false)
  })

  it("renders the Spanish registered email without a training section when none is needed", () => {
    const rendered = renderBookingInviteEmail({
      lang: "es",
      visitorFirstName: "Diego",
      hostName: "Caleb",
      siteName: "Houston HQ",
      expectedArrival: ARRIVAL,
      timezone: SITE_TZ,
      training: { kind: "none" },
    })
    assert.match(rendered.subject, /Está registrado en Houston HQ/)
    assert.match(rendered.html, /Tengo una reserva/)
    assert.match(rendered.html, /código QR/)
    assert.equal(rendered.html.includes("Ver el video de seguridad"), false)
    assert.equal(rendered.html.includes("—"), false)
  })
})
