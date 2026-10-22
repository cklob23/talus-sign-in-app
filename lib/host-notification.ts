import { getAdminClient } from "@/lib/supabase/server"
import {
  resolveHostContact,
  sendResolvedHostNotification,
  type HostNotificationType,
} from "@/lib/host-notify-send"

export type { HostNotificationType }

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
 * Host contact is resolved server-side. A notification failure must never
 * stop a visitor getting on site.
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

        const results = await sendResolvedHostNotification({
            host,
            locationId: args.locationId,
            locationName: args.locationName,
            notificationType: args.notificationType,
            visitorName: args.visitorName,
            visitorCompany: args.visitorCompany ?? null,
            visitorTypeName: args.visitorTypeName ?? null,
            badgeNumber: args.badgeNumber ?? null,
            visitorPhotoUrl: args.visitorPhotoUrl ?? null,
            purpose: args.purpose ?? null,
        })

        if (results.email === "sent" || results.sms === "sent" || results.loggedOnly) {
            return { sent: true }
        }
        return { sent: false, reason: "notify_failed" }
    } catch (error) {
        console.log("[v0] host notification error:", args.notificationType, error)
        return { sent: false, reason: "error" }
    }
}
