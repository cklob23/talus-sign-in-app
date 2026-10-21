export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}

export function asOptionalUuid(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (!isUuid(value)) return undefined
  return value
}

export function asRequiredUuid(value: unknown): string | null {
  return isUuid(value) ? value : null
}

export function asTrimmedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

export function asOptionalString(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > max) return undefined
  return trimmed
}

export function asOptionalEmail(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string") return undefined
  const email = value.trim().toLowerCase()
  if (!email) return null
  if (email.length > 254 || !EMAIL_RE.test(email)) return undefined
  return email
}

export function asRequiredEmail(value: unknown): string | null {
  const email = asOptionalEmail(value)
  if (!email) return null
  return email
}

export function asOptionalHttpUrl(value: unknown, max = 2000): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > max) return undefined
  if (!/^https?:\/\//i.test(trimmed)) return undefined
  return trimmed
}

export function asOptionalIsoDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string") return undefined
  const time = Date.parse(value)
  if (Number.isNaN(time)) return undefined
  return new Date(time).toISOString()
}

export function pickAllowed<T extends Record<string, unknown>>(
  body: unknown,
  keys: readonly (keyof T)[],
): Partial<T> {
  if (!body || typeof body !== "object") return {}
  const source = body as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key as string)) {
      out[key as string] = source[key as string]
    }
  }
  return out as Partial<T>
}
