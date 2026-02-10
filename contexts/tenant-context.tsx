"use client"

import { createContext, useContext, useEffect, type ReactNode } from "react"
import {
  setCurrentTenant,
  type TenantInfo,
  type PlanTier,
  type TierFeatures,
  buildTierFeatures,
  getRequiredTier,
  isAddon,
} from "@/lib/tier"

interface TenantContextValue {
  tenant: TenantInfo
  tier: PlanTier
  tierName: string
  features: TierFeatures
  hasFeature: (feature: keyof TierFeatures) => boolean
  getRequiredTier: (feature: keyof TierFeatures) => PlanTier | "addon"
  isAddon: (feature: keyof TierFeatures) => boolean
}

const TenantContext = createContext<TenantContextValue | null>(null)

interface TenantProviderProps {
  tenant: TenantInfo
  children: ReactNode
}

export function TenantProvider({ tenant, children }: TenantProviderProps) {
  // Set the global tenant so non-hook code (tier-gate, sidebar, etc.) can still use hasFeature()
  useEffect(() => {
    setCurrentTenant(tenant)
    return () => setCurrentTenant(null)
  }, [tenant])

  // Also set it synchronously for SSR/initial render
  setCurrentTenant(tenant)

  const features = buildTierFeatures(tenant)

  const value: TenantContextValue = {
    tenant,
    tier: tenant.plan,
    tierName: tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1),
    features,
    hasFeature: (feature: keyof TierFeatures) => features[feature],
    getRequiredTier,
    isAddon,
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext)
  if (!ctx) {
    throw new Error("useTenant must be used within a TenantProvider")
  }
  return ctx
}

export function useTenantOptional(): TenantContextValue | null {
  return useContext(TenantContext)
}
