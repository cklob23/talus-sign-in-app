import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { emailButton } from "./email-shell.ts"
import { escapeHtml, sanitizeAppUrl, sanitizePlainText } from "./html-escape.ts"
import { renderHostArrivalEmail } from "./host-mail.ts"

const ORIGIN = "https://signin.talusag.com"

describe("email-shell URLs", () => {
  it("never truncates a long same-origin URL in the button or arrival email", () => {
    const url = `${ORIGIN}/t/${"a".repeat(600)}.${"b".repeat(43)}?lang=es`
    assert.ok(url.length > 500)
    assert.equal(sanitizePlainText(url, 500).length, 500)
    assert.notEqual(sanitizePlainText(url, 500), url)
    assert.equal(sanitizeAppUrl(url, ORIGIN), url)

    const button = emailButton(url, "Watch the safety video")
    const href = `href="${escapeHtml(url)}"`
    assert.ok(button.includes(href), "emailButton must keep the full href")
    assert.equal(button.includes(url.slice(0, 500) + '"'), false)

    const arrival = renderHostArrivalEmail({
      visitorName: "Carlos Mendoza",
      locationName: "Houston HQ",
      visitUrl: url,
      appOrigin: ORIGIN,
    })
    assert.ok(arrival.html.includes(href))
    assert.ok(arrival.text.includes(url))
  })
})
