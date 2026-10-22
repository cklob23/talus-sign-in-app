/**
 * Escape text so it is safe to interpolate into an HTML email template.
 * Attribute and text contexts are both covered by replacing the five
 * HTML-significant characters.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Strip CR/LF and other ASCII control characters so visitor-entered text
 * cannot inject extra SMTP/SMS headers or break URL/SMS bodies.
 *
 * Do not use this for URLs or signed tokens. Length caps will cut HMAC
 * signatures. Use sanitizeAppUrl instead.
 */
export function sanitizePlainText(value: unknown, maxLength = 500): string {
  if (value === null || value === undefined) return ""
  const cleaned = String(value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned.slice(0, maxLength)
}

function configuredAppOrigins(extraOrigin?: string): Set<string> {
  const origins = new Set<string>()
  for (const candidate of [
    extraOrigin,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]) {
    const trimmed = typeof candidate === "string" ? candidate.trim() : ""
    if (!trimmed) continue
    try {
      origins.add(new URL(trimmed).origin)
    } catch {
      // ignore invalid configured origins
    }
  }
  return origins
}

/**
 * Validate an http(s) URL on the app origin and return it intact.
 * Never truncates. Rejects javascript:, data:, credentials, and off-origin links.
 */
export function sanitizeAppUrl(value: unknown, allowedOrigin?: string): string {
  if (value === null || value === undefined) return ""
  const raw = String(value).trim()
  if (!raw || /[\u0000-\u001F\u007F]/.test(raw)) return ""

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return ""
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return ""
  if (parsed.username || parsed.password) return ""

  const allowed = configuredAppOrigins(allowedOrigin)
  if (allowed.size === 0 || !allowed.has(parsed.origin)) return ""
  return raw
}
