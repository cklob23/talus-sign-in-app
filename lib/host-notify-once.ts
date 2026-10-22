import { after } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { sendHostNotification, type HostNotificationType } from "@/lib/host-notification"
import {
  claimNotificationOnce,
  finalizeNotificationClaim,
  isUndefinedColumn,
  isUndefinedTable,
  type NotificationClaim,
  type NotificationClaimRecord,
  type NotificationClaimStatus,
  type NotificationStore,
} from "@/lib/idempotency"
import { notifyErrorMessage } from "@/lib/host-notify-retry"

function recordFromRow(data: { status?: string | null; created_at?: string | null; updated_at?: string | null } | null): NotificationClaimRecord | null {
  if (!data) return null
  const status = data.status
  if (status === "pending" || status === "sent" || status === "failed") {
    return { status, createdAt: data.created_at ?? null, updatedAt: data.updated_at ?? null }
  }
  return { status: "sent", createdAt: data.created_at ?? null, updatedAt: data.updated_at ?? null }
}

function supabaseNotificationStore(): NotificationStore {
  const admin = getAdminClient()

  async function lookup(claim: NotificationClaim): Promise<NotificationClaimRecord | null> {
    const load = async (select: string) => {
      if (claim.signInId) {
        const { data, error } = await admin
          .from("host_notifications")
          .select(select)
          .eq("sign_in_id", claim.signInId)
          .eq("notification_type", claim.notificationType)
          .maybeSingle()
        if (error) return { data: null, error }
        if (data) return { data, error: null }
      }
      if (claim.idempotencyKey) {
        const { data, error } = await admin
          .from("host_notifications")
          .select(select)
          .eq("idempotency_key", claim.idempotencyKey)
          .maybeSingle()
        return { data, error }
      }
      return { data: null, error: null }
    }

    const first = await load("id, status, created_at, updated_at")
    if (first.error && isUndefinedColumn(first.error)) {
      const fallback = await load("id")
      if (fallback.data) return { status: "sent" }
      return null
    }
    if (first.error && isUndefinedTable(first.error)) return null
    return recordFromRow(first.data)
  }

  return {
    async findExisting(claim: NotificationClaim) {
      return lookup(claim)
    },
    async insert(claim: NotificationClaim) {
      const row = {
        sign_in_id: claim.signInId || null,
        notification_type: claim.notificationType,
        idempotency_key: claim.idempotencyKey || null,
        status: "pending" as const,
        error_message: null,
      }
      const { error } = await admin.from("host_notifications").insert(row)
      if (error && isUndefinedColumn(error)) {
        const { status: _status, error_message: _errorMessage, ...legacy } = row
        const retry = await admin.from("host_notifications").insert(legacy)
        return { error: retry.error }
      }
      return { error }
    },
    async updateStatus(claim: NotificationClaim, status: NotificationClaimStatus, errorMessage?: string | null) {
      const payload = {
        status,
        error_message: errorMessage ?? null,
        updated_at: new Date().toISOString(),
      }
      let query = admin.from("host_notifications").update(payload)
      if (claim.signInId) {
        query = query.eq("sign_in_id", claim.signInId).eq("notification_type", claim.notificationType)
      } else if (claim.idempotencyKey) {
        query = query.eq("idempotency_key", claim.idempotencyKey)
      } else {
        return { error: { message: "missing claim key" } }
      }
      const { error } = await query
      if (error && isUndefinedColumn(error)) return { error: null }
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

  const store = supabaseNotificationStore()
  const claim: NotificationClaim = {
    signInId: args.signInId ?? null,
    notificationType: args.notificationType,
    idempotencyKey: args.idempotencyKey ?? null,
  }
  const outcome = await claimNotificationOnce(store, claim)
  if (outcome === "duplicate") {
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

  let sent = false
  let errorMessage: string | null = null
  try {
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
      signInId: args.signInId ?? null,
    })
    sent = result.sent
    if (!sent) errorMessage = result.reason || "notify_failed"
  } catch (error) {
    errorMessage = notifyErrorMessage(error)
    console.error(
      `[Host Notify] sign_in=${args.signInId || "none"} type=${args.notificationType} send failed:`,
      errorMessage,
    )
  }

  await finalizeNotificationClaim(store, claim, sent ? "sent" : "failed", errorMessage)
  return { sent, replayed: false }
}

/**
 * Queue the host email/SMS after the HTTP response. The visitor must not wait
 * on SMTP or Twilio. At most one successful send per sign_in id + type
 * (or idempotency key). A failed send can be retried.
 */
export function scheduleHostNotification(args: ScheduledHostNotification): void {
  if (!args.hostId) return
  after(() => {
    void sendHostNotificationOnce(args).catch((error) => {
      console.error("[Host Notify] after() send failed:", notifyErrorMessage(error))
    })
  })
}
