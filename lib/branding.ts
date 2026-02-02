import { createClient } from "@/lib/supabase/server"

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

// Server-side function to get branding settings
export async function getBrandingSettings(): Promise<BrandingSettings> {
  const supabase = await createClient()
  
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
