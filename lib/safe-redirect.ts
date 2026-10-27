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
  if (/[\u0000-\u001F\u007F]/.test(value)) return fallback
  const queryAt = value.indexOf("?")
  const path = queryAt === -1 ? value : value.slice(0, queryAt)
  if (/\s/.test(path)) return fallback
  return value
}

/** Login URL that sends the caller back to a same-origin admin path after sign-in. */
export function loginUrlForProtectedPath(pathname: string, search = ""): string {
  const next = safeNextPath(`${pathname}${search}`)
  return `/auth/login?next=${encodeURIComponent(next)}`
}

export function adminPageLoginRedirect(status: 401 | 403, pathname = "/admin", search = ""): string {
  if (status === 401) return loginUrlForProtectedPath(pathname, search)
  return "/auth/login?error=not_authorized"
}
