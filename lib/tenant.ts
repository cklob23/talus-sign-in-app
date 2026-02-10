import { createAdminClient } from "@/lib/supabase/server"
import type { TenantInfo, PlanTier } from "@/lib/tier"

/**
 * Server-side utility to load the tenant config from the database.
 *
 * Single-instance model: each company gets their own database and app.
 * The `tenants` table holds exactly ONE row with this instance's
 * plan, add-ons, and company info.
 */

/**
 * Fetch this instance's tenant (the single active row in the tenants table).
 * This is the primary function used by the admin layout and kiosk.
 */
export async function getTenant(): Promise<TenantInfo | null> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, slug, plan, status, addons")
      .eq("status", "active")
      .limit(1)
      .single()

    if (error || !data) return null

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      plan: data.plan as PlanTier,
      status: data.status,
      addons: data.addons as TenantInfo["addons"],
    }
  } catch {
    return null
  }
}

/** @deprecated Use getTenant() instead. Kept for backwards compatibility. */
export async function getTenantForUser(_userId: string): Promise<TenantInfo | null> {
  return getTenant()
}

/** @deprecated Use getTenant() instead. Kept for backwards compatibility. */
export async function getTenantById(_tenantId: string): Promise<TenantInfo | null> {
  return getTenant()
}

/** @deprecated Use getTenant() instead. Kept for backwards compatibility. */
export async function getTenantBySlug(_slug: string): Promise<TenantInfo | null> {
  return getTenant()
}
