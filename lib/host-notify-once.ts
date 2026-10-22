import { after } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { sendHostNotification, type HostNotificationType } from "@/lib/host-notification"
import { claimNotificationOnce, type NotificationClaim, type NotificationStore } from "@/lib/idempotency"

function supabaseNotificationStore(): NotificationStore {
  const admin = getAdminClient()
  return {
    async findExisting(claim: NotificationClaim) {
      if (claim.signInId) {
        const { data } = await admin
          .from("host_notifications")
          .select("id")
          .eq("sign_in_id", claim.signInId)
          .eq("notification_type", claim.notificationType)
          .maybeSingle()
        if (data) return true
      }
      if (claim.idempotencyKey) {
        const { data } = await admin
          .from("host_notifications")
          .select("id")
          .eq("idempotency_key", claim.idempotencyKey)
          .maybeSingle()
        if (data) return true
      }
      return false
    },
    async insert(claim: NotificationClaim) {
      const { error } = await admin.from("host_notifications").insert({
        sign_in_id: claim.signInId || null,
        notification_type: claim.notificationType,
        idempotency_key: claim.idempotencyKey || null,
      })
      return { error }
    },
  }
}

export interface ScheduledHostNotification {
  hostId: string | null
  locationId: string
  locationName?: string | null
  notificationType: HostNotificationType
  visitorName: string
  visitorCompany?: string | null
  visitorTypeName?: string | null
  badgeNumber?: string | null
  visitorPhotoUrl?: string | null
  purpose?: string | null
  signInId?: string | null
  idempotencyKey?: string | null
}

export async function sendHostNotificationOnce(args: ScheduledHostNotification): Promise<{ sent: boolean; replayed: boolean }> {
  if (!args.hostId) return { sent: false, replayed: false }

  const claim = await claimNotificationOnce(supabaseNotificationStore(), {
    signInId: args.signInId ?? null,
    notificationType: args.notificationType,
    idempotencyKey: args.idempotencyKey ?? null,
  })
  if (claim === "duplicate") {
    return { sent: false, replayed: true }
  }

  let locationName = args.locationName || ""
  if (!locationName && args.locationId) {
    const admin = getAdminClient()
    const { data: location } = await admin
      .from("locations")
      .select("name")
      .eq("id", args.locationId)
      .maybeSingle()
    locationName = location?.name || ""
  }

  const result = await sendHostNotification({
    hostId: args.hostId,
    locationId: args.locationId,
    locationName,
    notificationType: args.notificationType,
    visitorName: args.visitorName,
    visitorCompany: args.visitorCompany ?? null,
    visitorTypeName: args.visitorTypeName ?? null,
    badgeNumber: args.badgeNumber ?? null,
    visitorPhotoUrl: args.visitorPhotoUrl ?? null,
    purpose: args.purpose ?? null,
  })
  return { sent: result.sent, replayed: false }
}

/**
 * Queue the host email/SMS after the HTTP response. The visitor must not wait
 * on SMTP or Twilio. at most one send per sign_in id + type (or idempotency key).
 */
export function scheduleHostNotification(args: ScheduledHostNotification): void {
  if (!args.hostId) return
  after(() => {
    void sendHostNotificationOnce(args).catch((error) => {
      console.error("[host-notify] after() send failed:", error)
    })
  })
}
