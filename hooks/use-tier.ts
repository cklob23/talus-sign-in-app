import { useTenantOptional } from "@/contexts/tenant-context"
import {
  getTierFeatures,
  getCurrentTier,
  getTierName,
  hasFeature,
  getRequiredTier,
  type PlanTier,
  type TierFeatures,
} from "@/lib/tier"

/**
 * Hook that provides current plan tier features for client components.
 * Reads from TenantProvider context if available, otherwise falls back
 * to the global tier state (set by server-side tenant loading from DB).
 */
export function useTier() {
  const tenantCtx = useTenantOptional()

  if (tenantCtx) {
    return {
      tier: tenantCtx.tier,
      tierName: tenantCtx.tierName,
      features: tenantCtx.features,
      hasFeature: tenantCtx.hasFeature,
      getRequiredTier: tenantCtx.getRequiredTier,
    }
  }

  // Fallback to global state (setCurrentTenant from DB-loaded tenant)
  const tier = getCurrentTier()
  const features = getTierFeatures()
  const tierName = getTierName()

  return {
    tier,
    tierName,
    features,
    hasFeature,
    getRequiredTier,
  }
}

export type { PlanTier, TierFeatures }
