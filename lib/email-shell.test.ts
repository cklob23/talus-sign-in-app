import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { emailButton, emailShell } from "./email-shell.ts"
import { escapeHtml, sanitizeAppUrl, sanitizePlainText } from "./html-escape.ts"
import { renderHostArrivalEmail } from "./host-mail.ts"
import { renderReportEmail } from "./reports/email.ts"

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

describe("email-shell color scheme", () => {
  it("keeps host mail on light-dark and lets report mail opt into light-only", () => {
    const host = renderHostArrivalEmail({
      visitorName: "Carlos Mendoza",
      locationName: "Houston HQ",
      visitUrl: `${ORIGIN}/visit/abc`,
      appOrigin: ORIGIN,
    })
    assert.match(host.html, /<meta name="color-scheme" content="light dark">/)
    assert.match(host.html, /<meta name="supported-color-schemes" content="light dark">/)
    assert.match(host.html, /@media \(prefers-color-scheme: dark\)/)
    assert.match(host.html, /\.card\{background:#111a15/)

    const report = renderReportEmail({
      scheduleName: "Nightly visitor log",
      kind: "visitors",
      periodStart: "2026-10-21T05:00:00.000Z",
      periodEnd: "2026-10-22T05:00:00.000Z",
      timezone: "America/Chicago",
      locationNames: ["Houston HQ"],
      rowCount: 12,
      format: "both",
      csvAttached: true,
    })
    assert.match(report.html, /<meta name="color-scheme" content="light only">/)
    assert.match(report.html, /<meta name="supported-color-schemes" content="light">/)
    assert.equal(report.html.includes("prefers-color-scheme: dark"), false)
    assert.equal(report.html.includes("#111a15"), false)
    assert.match(report.html, /\.rt\{[^}]*table-layout:auto/)
    assert.equal(report.html.includes("table-layout:fixed"), false)
    assert.match(report.html, /\.rt th\{background:#f5f8f6;font-weight:700;white-space:normal\}/)
    assert.match(report.html, /\.rt th,\.rt td\{[^}]*word-break:normal;overflow-wrap:normal/)
    assert.equal(report.html.includes("word-break:break-word"), false)
    assert.match(report.html, /\.rt th,\.rt td\{border:1px solid #dce6df/)
    assert.match(report.html, /\.rt \.rt-em\{display:block;word-break:normal;overflow-wrap:anywhere\}/)
    assert.equal(report.html.includes(".rt-long"), false)
    assert.match(report.html, /\.rt \.rt-time,\.rt \.rt-host\{white-space:normal;min-width:64px;word-break:normal;overflow-wrap:normal/)
    assert.equal(report.html.includes(".rt-time{white-space:nowrap}"), false)

    const defaultShell = emailShell({
      lang: "en",
      preheader: "Hello",
      logoUrl: "",
      bodyHtml: "<tr><td>Hi</td></tr>",
    })
    assert.match(defaultShell, /content="light dark"/)
    assert.match(defaultShell, /prefers-color-scheme: dark/)

    const lightOnly = emailShell({
      lang: "en",
      preheader: "Hello",
      logoUrl: "",
      bodyHtml: "<tr><td>Hi</td></tr>",
      colorScheme: "light-only",
    })
    assert.match(lightOnly, /content="light only"/)
    assert.match(lightOnly, /supported-color-schemes" content="light"/)
    assert.equal(lightOnly.includes("prefers-color-scheme: dark"), false)
  })
})
