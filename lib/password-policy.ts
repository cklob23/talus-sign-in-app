import { createClient } from "@/lib/supabase/client"

export interface PasswordPolicy {
  password_expiration: string // "never", "30", "60", "90", "180", "365"
  force_reauth: string // "never", "1", "7", "14", "30"
  force_2fa: boolean
  prevent_reuse: boolean
  password_reuse_count: number
}

const DEFAULT_POLICY: PasswordPolicy = {
  password_expiration: "never",
  force_reauth: "never",
  force_2fa: false,
  prevent_reuse: false,
  password_reuse_count: 5,
}

/**
 * Load password policy settings from the database
 */
export async function loadPasswordPolicy(): Promise<PasswordPolicy> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .is("location_id", null)
      .in("key", ["password_expiration", "force_reauth", "force_2fa", "prevent_reuse", "password_reuse_count"])
    
    if (!data || data.length === 0) {
      return DEFAULT_POLICY
    }
    
    const policy: PasswordPolicy = { ...DEFAULT_POLICY }
    
    for (const setting of data) {
      if (setting.key === "password_expiration") policy.password_expiration = String(setting.value || "never")
      if (setting.key === "force_reauth") policy.force_reauth = String(setting.value || "never")
      if (setting.key === "force_2fa") policy.force_2fa = setting.value === true || setting.value === "true"
      if (setting.key === "prevent_reuse") policy.prevent_reuse = setting.value === true || setting.value === "true"
      if (setting.key === "password_reuse_count") policy.password_reuse_count = Number(setting.value) || 5
    }
    
    return policy
  } catch (error) {
    console.error("Failed to load password policy:", error)
    return DEFAULT_POLICY
  }
}

/**
 * Check if user's password has expired based on policy
 * Returns true if password is expired
 */
export function isPasswordExpired(
  lastPasswordChange: string | null,
  policy: PasswordPolicy
): boolean {
  if (policy.password_expiration === "never") {
    return false
  }
  
  if (!lastPasswordChange) {
    // If we don't know when password was last changed, assume it's expired
    // This encourages users to set a new password
    return true
  }
  
  const expirationDays = parseInt(policy.password_expiration, 10)
  if (isNaN(expirationDays)) {
    return false
  }
  
  const lastChange = new Date(lastPasswordChange)
  const expirationDate = new Date(lastChange.getTime() + expirationDays * 24 * 60 * 60 * 1000)
  
  return new Date() > expirationDate
}

/**
 * Check if user needs to re-authenticate based on policy
 * Returns true if re-authentication is required
 */
export function needsReauthentication(
  lastAuthTime: string | null,
  policy: PasswordPolicy
): boolean {
  if (policy.force_reauth === "never") {
    return false
  }
  
  if (!lastAuthTime) {
    return true
  }
  
  const reauthDays = parseInt(policy.force_reauth, 10)
  if (isNaN(reauthDays)) {
    return false
  }
  
  const lastAuth = new Date(lastAuthTime)
  const reauthDate = new Date(lastAuth.getTime() + reauthDays * 24 * 60 * 60 * 1000)
  
  return new Date() > reauthDate
}

/**
 * Get password expiration date
 */
export function getPasswordExpirationDate(
  lastPasswordChange: string | null,
  policy: PasswordPolicy
): Date | null {
  if (policy.password_expiration === "never" || !lastPasswordChange) {
    return null
  }
  
  const expirationDays = parseInt(policy.password_expiration, 10)
  if (isNaN(expirationDays)) {
    return null
  }
  
  const lastChange = new Date(lastPasswordChange)
  return new Date(lastChange.getTime() + expirationDays * 24 * 60 * 60 * 1000)
}

/**
 * Get days until password expires
 */
export function getDaysUntilExpiration(
  lastPasswordChange: string | null,
  policy: PasswordPolicy
): number | null {
  const expirationDate = getPasswordExpirationDate(lastPasswordChange, policy)
  if (!expirationDate) {
    return null
  }
  
  const now = new Date()
  const diffMs = expirationDate.getTime() - now.getTime()
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
}

/**
 * Format password policy for display
 */
export function formatPasswordExpiration(policy: PasswordPolicy): string {
  if (policy.password_expiration === "never") {
    return "Never"
  }
  
  const days = parseInt(policy.password_expiration, 10)
  if (days === 365) {
    return "1 year"
  }
  
  return `${days} days`
}

/**
 * Format re-authentication policy for display
 */
export function formatForceReauth(policy: PasswordPolicy): string {
  if (policy.force_reauth === "never") {
    return "Never"
  }
  
  const days = parseInt(policy.force_reauth, 10)
  if (days === 1) {
    return "Every day"
  }
  if (days === 7) {
    return "Every week"
  }
  if (days === 14) {
    return "Every 2 weeks"
  }
  if (days === 30) {
    return "Every month"
  }
  
  return `Every ${days} days`
}
