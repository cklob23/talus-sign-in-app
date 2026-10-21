/**
 * Allow only same-origin relative paths after login.
 * Rejects protocol-relative URLs, backslashes, and scheme-smuggling values
 * such as next=@evil.com or next=//evil.com.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/admin"): string {
  if (!next || typeof next !== "string") return fallback
  const value = next.trim()
  if (!value.startsWith("/")) return fallback
  if (value.startsWith("//")) return fallback
  if (value.includes("\\")) return fallback
  if (value.includes("://")) return fallback
  if (/[\s]/.test(value)) return fallback
  return value
}
