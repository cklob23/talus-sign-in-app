/**
 * Plan Tier Feature Flags - Multi-Tenant
 *
 * Tier and add-on data is stored per-tenant in the `tenants` table.
 * On the server, the admin layout calls `getTenantForUser()` to load the
 * tenant from the DB. On the client, the TenantProvider context injects
 * the data and `hasFeature()` / `getTierName()` read from it.
 *
 * There is NO env-var fallback. All plan data comes from the database.
 * If no tenant is loaded (e.g. DB error), defaults to Starter with no add-ons.
 */

export type PlanTier = "starter" | "pro" | "enterprise"

export interface TenantInfo {
  id: string
  name: string
  slug: string
  plan: PlanTier
  status: string
  addons: {
    sso: boolean
    sms: boolean
    ndas: boolean
    audit_logs: boolean
  }
}

export interface TierFeatures {
  // --- Starter (included in all tiers) ---
  visitors: boolean
  signInSignOut: boolean
  basicVisitorLogs: boolean
  emailNotifications: boolean
  customWelcomeMessage: boolean
  mobileFriendlyCheckIn: boolean

  // --- Pro ---
  visitorPreRegistration: boolean
  photoCapture: boolean
  badgePrinting: boolean
  customBranding: boolean
  analyticsDashboard: boolean

  // --- Enterprise ---
  emergencyEvacuations: boolean
  apiAccess: boolean
  customIntegrations: boolean

  // --- Add-Ons (independent, enabled via tenant addons or Enterprise tier) ---
  ssoIntegration: boolean
  smsNotifications: boolean
  visitorNdasWaivers: boolean
  advancedAuditLogs: boolean
}

const TIER_LEVEL: Record<PlanTier, number> = {
  starter: 1,
  pro: 2,
  enterprise: 3,
}

function hasAtLeast(current: PlanTier, required: PlanTier): boolean {
  return TIER_LEVEL[current] >= TIER_LEVEL[required]
}

/**
 * Build the full feature flags from a tenant record.
 */
export function buildTierFeatures(tenant: TenantInfo): TierFeatures {
  const plan = tenant.plan
  const addons = tenant.addons || { sso: false, sms: false, ndas: false, audit_logs: false }
  const isEnterprise = plan === "enterprise"

  return {
    // Starter - always enabled
    visitors: true,
    signInSignOut: true,
    basicVisitorLogs: true,
    emailNotifications: true,
    customWelcomeMessage: true,
    mobileFriendlyCheckIn: true,

    // Pro
    visitorPreRegistration: hasAtLeast(plan, "pro"),
    photoCapture: hasAtLeast(plan, "pro"),
    badgePrinting: hasAtLeast(plan, "pro"),
    customBranding: hasAtLeast(plan, "pro"),
    analyticsDashboard: hasAtLeast(plan, "pro"),

    // Enterprise
    emergencyEvacuations: hasAtLeast(plan, "enterprise"),
    apiAccess: hasAtLeast(plan, "enterprise"),
    customIntegrations: hasAtLeast(plan, "enterprise"),

    // Add-Ons (independent, or auto-enabled on Enterprise)
    ssoIntegration: isEnterprise || addons.sso,
    smsNotifications: isEnterprise || addons.sms,
    visitorNdasWaivers: isEnterprise || addons.ndas,
    advancedAuditLogs: isEnterprise || addons.audit_logs,
  }
}

// ============================================================================
// Global tenant state (set by TenantProvider on client, or by middleware/layout on server)
// ============================================================================

let _currentTenant: TenantInfo | null = null

export function setCurrentTenant(tenant: TenantInfo | null) {
  _currentTenant = tenant
}

export function getCurrentTenant(): TenantInfo | null {
  return _currentTenant
}

/**
 * Default tenant when no DB tenant is loaded (safe Starter baseline).
 * This is only used as a last resort if the DB query fails.
 */
const DEFAULT_TENANT: TenantInfo = {
  id: "",
  name: "Default",
  slug: "default",
  plan: "starter",
  status: "active",
  addons: {
    sso: false,
    sms: false,
    ndas: false,
    audit_logs: false,
  },
}

// ============================================================================
// Public API - these are used throughout the app
// ============================================================================

export function getCurrentTier(): PlanTier {
  const tenant = _currentTenant || DEFAULT_TENANT
  return tenant.plan
}

export function getTierName(): string {
  const tier = getCurrentTier()
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

export function getTierFeatures(): TierFeatures {
  const tenant = _currentTenant || DEFAULT_TENANT
  return buildTierFeatures(tenant)
}

export function hasFeature(feature: keyof TierFeatures): boolean {
  return getTierFeatures()[feature]
}

/**
 * Whether a feature is a purchasable add-on (not tier-bundled)
 */
const ADDON_FEATURES: (keyof TierFeatures)[] = [
  "ssoIntegration",
  "smsNotifications",
  "visitorNdasWaivers",
  "advancedAuditLogs",
]

export function isAddon(feature: keyof TierFeatures): boolean {
  return ADDON_FEATURES.includes(feature)
}

/**
 * Get the minimum tier required for a tier-bundled feature,
 * or "addon" if it's a purchasable add-on.
 */
export function getRequiredTier(feature: keyof TierFeatures): PlanTier | "addon" {
  if (ADDON_FEATURES.includes(feature)) return "addon"

  const proFeatures: (keyof TierFeatures)[] = [
    "visitorPreRegistration",
    "photoCapture",
    "badgePrinting",
    "customBranding",
    "analyticsDashboard",
  ]
  const enterpriseFeatures: (keyof TierFeatures)[] = [
    "emergencyEvacuations",
    "apiAccess",
    "customIntegrations",
  ]

  if (enterpriseFeatures.includes(feature)) return "enterprise"
  if (proFeatures.includes(feature)) return "pro"
  return "starter"
}
