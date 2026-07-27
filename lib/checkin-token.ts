import { getAdminClient } from "@/lib/supabase/server"

/**
 * Shared resolution of a public check-in token.
 *
 * Both the check-in page and the sign-in API go through this so the rules
 * (token must be active, feature must be enabled) can never drift apart.
 */

export interface CheckinLocation {
    id: string
    name: string
    address: string | null
    timezone: string | null
}

export type CheckinTokenResult =
    | { ok: true; location: CheckinLocation }
    | { ok: false; reason: string; status: number; kind: "invalid" | "disabled" }

/** True when QR check-in is switched on globally in Settings. */
export async function isQrCheckinEnabled(): Promise<boolean> {
    const admin = getAdminClient()
    const { data } = await admin
        .from("settings")
        .select("value")
        .eq("key", "qr_checkin_enabled")
        .is("location_id", null)
        .maybeSingle()
    return data?.value === true || data?.value === "true"
}

export async function resolveCheckinToken(token: string): Promise<CheckinTokenResult> {
    // Cheap sanity check before touching the database.
    if (!token || token.length < 16 || token.length > 128) {
        return { ok: false, reason: "This QR code is not valid.", status: 404, kind: "invalid" }
    }

    const admin = getAdminClient()
    const { data, error } = await admin
        .from("location_qr_codes")
        .select("location_id, locations ( id, name, address, timezone )")
        .eq("token", token)
        .eq("is_active", true)
        .maybeSingle()

    if (error) {
        console.log("[v0] Check-in token lookup failed:", error.message)
        return { ok: false, reason: "Sign-in is temporarily unavailable.", status: 500, kind: "invalid" }
    }

    const joined = data?.locations
    const location = (Array.isArray(joined) ? joined[0] : joined) as CheckinLocation | undefined
    if (!location) {
        return {
            ok: false,
            reason: "This QR code is no longer active. Please ask reception to sign you in.",
            status: 404,
            kind: "invalid",
        }
    }

    if (!(await isQrCheckinEnabled())) {
        return {
            ok: false,
            reason: "Self sign-in is currently turned off. Please ask reception to sign you in.",
            status: 403,
            kind: "disabled",
        }
    }

    return { ok: true, location }
}
