import { getAdminClient } from "@/lib/supabase/server"
import { POST as notifyHostHandler } from "@/app/api/notify-host/route"

/**
 * Server-side host notification used by the public QR self sign-in flow.
 *
 * The kiosk resolves host contact details and the `host_notifications` toggle in
 * the browser, but the QR flow is driven by unauthenticated visitors, so all of
 * that has to happen on the server. This keeps both flows behaviourally
 * identical while never trusting a client-supplied email address.
 */

export type HostNotificationType = "arrived" | "completing_training"

/**
 * Resolves a host's contact details, preferring their linked profile.
 *
 * The kiosk gives the profile precedence over the denormalised `hosts` columns,
 * which can go stale when someone updates their account. Mirroring that order
 * here keeps notifications going to the same address in both flows.
 */
async function resolveHostContact(hostId: string, locationId: string) {
    const admin = getAdminClient()

    // Scoping to the location means one site's poster can never be used to
    // notify (or spam) a host who belongs to a different site.
    const { data: host } = await admin
        .from("hosts")
        .select("id, name, email, phone, profile_id, is_active")
        .eq("id", hostId)
        .eq("location_id", locationId)
        .eq("is_active", true)
        .maybeSingle()

    if (!host) return null

    let name = host.name
    let email = host.email
    let phone = host.phone

    if (host.profile_id) {
        const { data: profile } = await admin
            .from("profiles")
            .select("full_name, email, phone")
            .eq("id", host.profile_id)
            .maybeSingle()

        if (profile) {
            name = profile.full_name || name
            email = profile.email || email
            phone = profile.phone || phone
        }
    }

    if (!email && !phone) return null
    return { name, email, phone }
}

/**
 * True unless an admin has explicitly disabled host notifications.
 *
 * The row is absent on a fresh install, and the admin UI treats that as on, so
 * defaulting to `true` here avoids silently dropping notifications.
 */
async function hostNotificationsEnabled(): Promise<boolean> {
    const admin = getAdminClient()
    const { data } = await admin
        .from("settings")
        .select("value")
        .eq("key", "host_notifications")
        .is("location_id", null)
        .maybeSingle()

    if (!data) return true
    return data.value === true || data.value === "true"
}

/**
 * Sends a host notification for a QR self sign-in.
 *
 * Always resolves — a notification failure must never stop a visitor getting
 * on site, since that would leave them physically present but unrecorded.
 */
export async function sendHostNotification(args: {
    hostId: string | null
    locationId: string
    locationName: string
    notificationType: HostNotificationType
    visitorName: string
    visitorCompany?: string | null
    visitorTypeName?: string | null
    badgeNumber?: string | null
    visitorPhotoUrl?: string | null
    purpose?: string | null
}): Promise<{ sent: boolean; reason?: string }> {
    if (!args.hostId) return { sent: false, reason: "no_host" }

    try {
        if (!(await hostNotificationsEnabled())) {
            return { sent: false, reason: "disabled" }
        }

        const host = await resolveHostContact(args.hostId, args.locationId)
        if (!host) return { sent: false, reason: "host_not_found" }

        // Invoke the notification handler in-process rather than doing an HTTP
        // round trip back to our own server. A self-fetch has to guess its own
        // origin, and guessing wrong fails at the TLS layer (an https origin
        // pointed at a plain-http port), which silently swallowed every email.
        const res = await notifyHostHandler(
            new Request("https://internal.invalid/api/notify-host", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    hostEmail: host.email,
                    hostName: host.name,
                    hostPhone: host.phone,
                    visitorName: args.visitorName,
                    visitorCompany: args.visitorCompany ?? null,
                    purpose: args.purpose ?? null,
                    badgeNumber: args.badgeNumber ?? null,
                    locationName: args.locationName,
                    locationId: args.locationId,
                    notificationType: args.notificationType,
                    visitorTypeName: args.visitorTypeName ?? null,
                    visitorPhotoUrl: args.visitorPhotoUrl ?? null,
                }),
            }),
        )

        if (!res.ok) {
            console.log("[v0] host notification rejected:", args.notificationType, res.status)
            return { sent: false, reason: "notify_failed" }
        }
        return { sent: true }
    } catch (error) {
        console.log("[v0] host notification error:", args.notificationType, error)
        return { sent: false, reason: "error" }
    }
}
