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
  // Visitor type actions
  | "visitor_type.created"
  | "visitor_type.updated"
  | "visitor_type.deleted"

export type EntityType = 
  | "user"
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
    const { data: { user } } = await supabase.auth.getUser()
    
    await supabase.from("audit_logs").insert({
      user_id: user?.id || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      description: description || null,
      metadata,
      // Note: ip_address and user_agent should be set server-side if needed
    })
  } catch (error) {
    // Don't throw - audit logging should never break the app
    console.error("Failed to log audit entry:", error)
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
