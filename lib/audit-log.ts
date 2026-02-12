import { createClient } from "@/lib/supabase/client"

export type AuditAction =
  // User actions
  | "user.login"
  | "user.logout"
  | "user.created"
  | "user.updated"
  | "user.deleted"
  // Visitor actions
  | "visitor.sign_in"
  | "visitor.sign_out"
  | "visitor.created"
  | "visitor.updated"
  // Employee actions
  | "employee.sign_in"
  | "employee.sign_out"
  // Booking actions
  | "booking.created"
  | "booking.updated"
  | "booking.cancelled"
  | "booking.checked_in"
  // Host actions
  | "host.created"
  | "host.updated"
  | "host.deleted"
  // Location actions
  | "location.created"
  | "location.updated"
  | "location.deleted"
  // Evacuation actions
  | "evacuation.started"
  | "evacuation.ended"
  // Settings actions
  | "settings.updated"
  | "settings.sync_schedule_updated"
  // Visitor type actions
  | "visitor_type.created"
  | "visitor_type.updated"
  | "visitor_type.deleted"
  // Kiosk actions
  | "kiosk.receptionist_login"
  | "kiosk.receptionist_logout"

export type EntityType =
  | "user"
  | "admin"
  | "visitor"
  | "employee"
  | "booking"
  | "host"
  | "location"
  | "evacuation"
  | "settings"
  | "visitor_type"

interface LogAuditParams {
  action: AuditAction
  entityType: EntityType
  entityId?: string
  description?: string
  metadata?: Record<string, unknown>
}

/**
 * Log an audit entry to the database
 * Can be called from client-side code
 */
export async function logAudit({
  action,
  entityType,
  entityId,
  description,
  metadata = {},
}: LogAuditParams): Promise<void> {
  try {
    const supabase = createClient()

    // Get the current user (if authenticated)
    let userId: string | null = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id || null
    } catch {
      // User might not be authenticated (e.g., kiosk visitor sign-in)
      userId = null
    }

    const { error } = await supabase.from("audit_logs").insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      description: description || null,
      metadata,
      // Note: ip_address and user_agent should be set server-side if needed
    })

    if (error) {
      console.error("[v0] Audit log insert error:", error)
    }
  } catch (error) {
    // Don't throw - audit logging should never break the app
    console.error("[v0] Failed to log audit entry:", error)
  }
}

/**
 * Log audit entry via API route (bypasses RLS)
 * Use this for kiosk actions where the user may not be authenticated
 */
export async function logAuditViaApi({
  action,
  entityType,
  entityId,
  description,
  metadata = {},
  userId,
}: LogAuditParams & { userId?: string | null }): Promise<void> {
  try {
    const response = await fetch("/api/audit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        entityType,
        entityId,
        description,
        metadata,
        userId,
      }),
    })

    if (!response.ok) {
      const result = await response.json()
      console.error("[v0] Audit log API error:", result.error)
    }
  } catch (error) {
    // Don't throw - audit logging should never break the app
    console.error("[v0] Failed to log audit entry via API:", error)
  }
}

/**
 * Server-side audit logging (use in API routes)
 */
export async function logAuditServer({
  supabase,
  userId,
  action,
  entityType,
  entityId,
  description,
  metadata = {},
  ipAddress,
  userAgent,
}: LogAuditParams & {
  supabase: ReturnType<typeof createClient>
  userId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      description: description || null,
      metadata,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    })
  } catch (error) {
    console.error("Failed to log audit entry:", error)
  }
}
