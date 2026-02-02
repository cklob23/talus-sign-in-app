"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export interface BrandingSettings {
  companyName: string
  companyLogo: string
  companyLogoSmall: string
}

const defaultBranding: BrandingSettings = {
  companyName: "Talus",
  companyLogo: "",
  companyLogoSmall: "",
}

// Cache for branding settings to avoid repeated fetches
let cachedBranding: BrandingSettings | null = null
let fetchPromise: Promise<BrandingSettings> | null = null

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

export function useBranding() {
  const [branding, setBranding] = useState<BrandingSettings>(cachedBranding || defaultBranding)
  const [isLoading, setIsLoading] = useState(!cachedBranding)

  useEffect(() => {
    // If we have cached branding, use it
    if (cachedBranding) {
      setBranding(cachedBranding)
      setIsLoading(false)
      return
    }

    // If a fetch is already in progress, wait for it
    if (fetchPromise) {
      fetchPromise.then((result) => {
        setBranding(result)
        setIsLoading(false)
      })
      return
    }

    // Start a new fetch
    fetchPromise = fetchBrandingSettings()
    fetchPromise.then((result) => {
      cachedBranding = result
      setBranding(result)
      setIsLoading(false)
      fetchPromise = null
    }).catch(() => {
      setIsLoading(false)
      fetchPromise = null
    })
  }, [])

  // Function to refresh branding (useful after settings update)
  const refreshBranding = async () => {
    setIsLoading(true)
    const result = await fetchBrandingSettings()
    cachedBranding = result
    setBranding(result)
    setIsLoading(false)
  }

  return { branding, isLoading, refreshBranding }
}
