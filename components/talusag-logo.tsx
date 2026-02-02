"use client"

import Image from "next/image"
import { useBranding } from "@/hooks/use-branding"

interface TalusAgLogoProps {
  variant?: "light" | "dark"
  className?: string
  width?: number
  height?: number
  borderRadius?: string
}

export function TalusAgLogo({ variant = "dark", className = "", height = 40, borderRadius = "sm" }: TalusAgLogoProps) {
  const { branding, isLoading } = useBranding()

  // If custom logo is set, use it
  if (branding.companyLogo) {
    return (
      <div className={`flex items-center ${className}`}>
        <Image
          src={branding.companyLogo || "/talusAg_Logo.png"}
          alt={branding.companyName}
          width={150}
          height={height}
          className={`h-10 w-auto object-contain rounded-${borderRadius}`}
          priority
        />
      </div>
    )
  }

  // Default logo - use the talusAg_Logo.png image
  return (
    <div className={`flex items-center ${className}`}>
      <Image
        src="/talusAg_Logo.png"
        alt={branding.companyName}
        width={150}
        height={height}
        className={`h-10 w-auto object-contain rounded-${borderRadius}`}
        priority
      />
    </div>
  )
}

// Icon-only version for collapsed sidebar
export function TalusAgLogoIcon({ className = "", borderRadius = "sm" }: { className?: string, borderRadius?: string }) {
  const { branding } = useBranding()

  // If custom small logo is set, use it
  if (branding.companyLogoSmall) {
    return (
      <Image
        src={branding.companyLogoSmall || "/icon.svg"}
        alt={branding.companyName}
        width={40}
        height={40}
        className={`object-contain ${className} rounded-${borderRadius}`}
        priority
      />
    )
  }

  // Fallback to full logo if small not set but full is
  if (branding.companyLogo) {
    return (
      <Image
        src={branding.companyLogo || "/talusAg_Logo.png"}
        alt={branding.companyName}
        width={40}
        height={40}
        className={`object-contain ${className} rounded-${borderRadius}`}
        priority
      />
    )
  }

  // Default logo image
  return (
    <Image
      src="/icon.svg"
      alt={"Talus Logo"}
      width={40}
      height={40}
      className={`object-contain ${className} rounded-${borderRadius}`}
      priority
    />
  )
}
