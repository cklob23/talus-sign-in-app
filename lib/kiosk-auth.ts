import { NextResponse } from "next/server"
import { resolveCheckinToken } from "@/lib/checkin-token"
import {
  KIOSK_SESSION_COOKIE,
  verifyReceptionistSession,
  type ReceptionistSession,
} from "@/lib/kiosk-session"

export type KioskContext =
  | { source: "receptionist"; session: ReceptionistSession }
  | { source: "qr"; token: string; locationId: string }

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    if (trimmed.slice(0, eq) === name) {
      return decodeURIComponent(trimmed.slice(eq + 1))
    }
  }
  return null
}

export function kioskUnauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 })
}

/**
 * Require a valid kiosk context: a signed receptionist cookie, or a
 * location_qr_codes token resolved server-side (QR visitor flow).
 */
export async function requireKioskContext(
  request: Request,
  options?: { qrToken?: string | null },
): Promise<{ ok: true; context: KioskContext } | { ok: false; response: NextResponse }> {
  const cookieValue = readCookie(request, KIOSK_SESSION_COOKIE)
  const session = verifyReceptionistSession(cookieValue)
  if (session) {
    return { ok: true, context: { source: "receptionist", session } }
  }

  const headerToken =
    request.headers.get("x-checkin-token") ||
    request.headers.get("x-qr-token")
  const queryToken = new URL(request.url).searchParams.get("token")
  const token = (options?.qrToken || headerToken || queryToken || "").trim()

  if (token) {
    const resolved = await resolveCheckinToken(token)
    if (resolved.ok) {
      return {
        ok: true,
        context: { source: "qr", token, locationId: resolved.location.id },
      }
    }
  }

  return { ok: false, response: kioskUnauthorized() }
}

/**
 * Same as requireKioskContext but never distinguishes "not on site" from
 * "not signed in". Use on lookup endpoints that would otherwise leak presence.
 */
export async function requireKioskContextOrHide(
  request: Request,
  options?: { qrToken?: string | null },
): Promise<{ ok: true; context: KioskContext } | { ok: false; response: NextResponse }> {
  const result = await requireKioskContext(request, options)
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No active sign-in found" }, { status: 404 }),
    }
  }
  return result
}
