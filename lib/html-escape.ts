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
 */
export function sanitizePlainText(value: unknown, maxLength = 500): string {
  if (value === null || value === undefined) return ""
  const cleaned = String(value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned.slice(0, maxLength)
}
