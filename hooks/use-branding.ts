"use client"

import { useState, useEffect, useCallback, useSyncExternalStore } from "react"
import { createClient } from "@/lib/supabase/client"

export interface BrandingSettings {
  companyName: string
  companyLogo: string
  companyLogoSmall: string
}

const defaultBranding: BrandingSettings = {
  companyName: "Talus Ag",
  companyLogo: "",
  companyLogoSmall: "",
}

// ---- Shared branding store (singleton, module-scoped) ----
let cachedBranding: BrandingSettings = defaultBranding
let initialFetchDone = false
let fetchPromise: Promise<BrandingSettings> | null = null

// Subscribers: every mounted useBranding() hook registers a callback here.
// When the cache changes, all subscribers re-render with the new value.
const subscribers = new Set<() => void>()

function subscribe(cb: () => void) {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

function getSnapshot(): BrandingSettings {
  return cachedBranding
}

function notify() {
  for (const cb of subscribers) cb()
}

async function fetchBrandingSettings(): Promise<BrandingSettings> {
  const supabase = createClient()
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .is("location_id", null)
    .in("key", ["company_name", "company_logo", "company_logo_small"])

  const branding = { ...defaultBranding }

  if (data && data.length > 0) {
    for (const setting of data) {
      if (setting.key === "company_name" && setting.value) {
        branding.companyName = String(setting.value)
      }
      if (setting.key === "company_logo" && setting.value) {
        branding.companyLogo = String(setting.value)
      }
      if (setting.key === "company_logo_small" && setting.value) {
        branding.companyLogoSmall = String(setting.value)
      }
    }
  }

  return branding
}

/**
 * Refresh the shared branding cache and notify ALL mounted consumers.
 * Can be called from anywhere (including outside React components).
 */
export async function refreshBranding() {
  const result = await fetchBrandingSettings()
  cachedBranding = result
  initialFetchDone = true
  notify()
  return result
}

// ---- Hook ----

export function useBranding() {
  const branding = useSyncExternalStore(subscribe, getSnapshot, () => defaultBranding)
  const [isLoading, setIsLoading] = useState(!initialFetchDone)

  useEffect(() => {
    if (initialFetchDone) {
      setIsLoading(false)
      return
    }

    // Deduplicate the initial fetch across all hook instances
    if (!fetchPromise) {
      fetchPromise = refreshBranding()
      fetchPromise.finally(() => { fetchPromise = null })
    }

    fetchPromise.then(() => setIsLoading(false)).catch(() => setIsLoading(false))
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    await refreshBranding()
    setIsLoading(false)
  }, [])

  return { branding, isLoading, refreshBranding: refresh }
}
