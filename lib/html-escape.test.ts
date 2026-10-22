import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { escapeHtml, sanitizeAppUrl, sanitizePlainText } from "./html-escape.ts"

describe("escapeHtml", () => {
  it("returns an empty string for nullish values", () => {
    assert.equal(escapeHtml(null), "")
    assert.equal(escapeHtml(undefined), "")
  })

  it("leaves plain text unchanged", () => {
    assert.equal(escapeHtml("Jane Doe"), "Jane Doe")
  })

  it("escapes HTML-significant characters", () => {
    assert.equal(
      escapeHtml(`<img src=x onerror=alert(1)> & "quoted" 'name'`),
      "&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot; &#39;name&#39;",
    )
  })

  it("escapes a visitor name that injects a fake host greeting", () => {
    const injected = `Alice</td></tr></table><script>alert(1)</script>`
    const escaped = escapeHtml(injected)
    assert.equal(escaped.includes("<script>"), false)
    assert.equal(escaped.includes("&lt;script&gt;"), true)
  })

  it("stringifies non-string values", () => {
    assert.equal(escapeHtml(42), "42")
  })
})

describe("sanitizePlainText", () => {
  it("strips CR/LF so SMS and email headers cannot be injected", () => {
    assert.equal(
      sanitizePlainText("Alice\r\nBcc: attacker@evil.com"),
      "Alice Bcc: attacker@evil.com",
    )
  })

  it("collapses whitespace and caps length", () => {
    assert.equal(sanitizePlainText("  Jane\nDoe  "), "Jane Doe")
    assert.equal(sanitizePlainText("x".repeat(20), 8), "xxxxxxxx")
  })
})

describe("sanitizeAppUrl", () => {
  const origin = "https://signin.talusag.com"

  it("returns a same-origin http(s) URL intact, including long tokens", () => {
    const url = `${origin}/t/${"a".repeat(600)}.${"b".repeat(43)}?lang=es`
    assert.equal(sanitizeAppUrl(url, origin), url)
    assert.ok(sanitizeAppUrl(url, origin).length > 500)
  })

  it("rejects javascript, other origins, and credentials", () => {
    assert.equal(sanitizeAppUrl("javascript:alert(1)", origin), "")
    assert.equal(sanitizeAppUrl("https://evil.example/t/token", origin), "")
    assert.equal(sanitizeAppUrl("https://user:pass@signin.talusag.com/t/x", origin), "")
    assert.equal(sanitizeAppUrl("not a url", origin), "")
  })
})
