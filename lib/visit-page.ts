import { formatDate, formatDateTimeWithZone } from "@/lib/timezone"
import {
  formatTrainingDay,
  formatTrainingMonthYear,
  type HostTrainingSnapshot,
  type HostTrainingState,
} from "@/lib/training-clearance"

export function visitorFullName(firstName?: string | null, lastName?: string | null): string {
  const name = `${firstName || ""} ${lastName || ""}`.replace(/\s+/g, " ").trim()
  return name || "Visitor"
}

/**
 * Third-person training line for the host /visit/[token] page.
 * Visitor-facing /t and kiosk copy stays on formatClearanceMessage.
 */
export function formatHostTrainingLine(
  snapshot: HostTrainingSnapshot,
  visitorName: string,
  locale: "en" | "es" = "en",
): string {
  const name = visitorName.trim() || "Visitor"
  const done = snapshot.completedAt ? formatTrainingDay(snapshot.completedAt, locale) : ""
  const until = snapshot.expiresAt ? formatTrainingMonthYear(snapshot.expiresAt, locale) : ""
  return hostTrainingCopy(snapshot.state, { name, done, until, locale })
}

export function hostTrainingCopy(
  state: HostTrainingState,
  parts: { name: string; done: string; until: string; locale?: "en" | "es" },
): string {
  const locale = parts.locale ?? "en"
  if (locale === "es") {
    switch (state) {
      case "cleared":
        if (parts.done && parts.until) {
          return `${parts.name} completó el video de seguridad el ${parts.done}. Autorizado hasta ${parts.until}.`
        }
        if (parts.done) return `${parts.name} completó el video de seguridad el ${parts.done}. Autorizado.`
        return `${parts.name} está autorizado.`
      case "expired":
        if (parts.done && parts.until) {
          return `${parts.name} completó el video de seguridad el ${parts.done}. Esa autorización venció en ${parts.until}.`
        }
        if (parts.until) return `La capacitación de seguridad de ${parts.name} venció en ${parts.until}.`
        return `La capacitación de seguridad de ${parts.name} venció.`
      case "not_required":
        return "Esta visita no requiere capacitación de seguridad."
      default:
        return `${parts.name} aún no ha completado el video de seguridad.`
    }
  }
  switch (state) {
    case "cleared":
      if (parts.done && parts.until) {
        return `${parts.name} completed the safety video on ${parts.done}. Cleared until ${parts.until}.`
      }
      if (parts.done) return `${parts.name} completed the safety video on ${parts.done}. Cleared.`
      return `${parts.name} is cleared.`
    case "expired":
      if (parts.done && parts.until) {
        return `${parts.name} completed the safety video on ${parts.done}. That clearance expired in ${parts.until}.`
      }
      if (parts.until) return `${parts.name}'s safety training expired in ${parts.until}.`
      return `${parts.name}'s safety training has expired.`
    case "not_required":
      return "No safety training required for this visit."
    default:
      return `${parts.name} has not completed the safety video.`
  }
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
