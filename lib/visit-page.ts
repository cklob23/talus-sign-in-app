import { formatDate, formatDateTimeWithZone } from "@/lib/timezone"

export function visitorFullName(firstName?: string | null, lastName?: string | null): string {
  const name = `${firstName || ""} ${lastName || ""}`.replace(/\s+/g, " ").trim()
  return name || "Visitor"
}

export function visitLinkFooter(hostName: string, expiresAt: number | string, timezone = "UTC"): string {
  const iso = typeof expiresAt === "number" ? new Date(expiresAt).toISOString() : expiresAt
  return `This link works for ${hostName} and expires on ${formatDate(iso, timezone)}`
}

export function visitActionsVisible(signedOut: boolean): boolean {
  return !signedOut
}

export function visitDepartureStamp(signedOutAt: string | null | undefined, timezone = "UTC"): string | null {
  if (!signedOutAt) return null
  return formatDateTimeWithZone(signedOutAt, timezone)
}
