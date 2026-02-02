"use client"

import Image from "next/image"
import { useBranding } from "@/hooks/use-branding"

interface TalusAgLogoProps {
  variant?: "light" | "dark"
  className?: string
  width?: number
  height?: number
}

// Default SVG logo component (used when no custom logo is set)
function DefaultLogoIcon({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
    >
      <rect width="40" height="40" rx="8" fill="#10B981" />
      <path
        d="M12 14H28M20 14V28M16 18L20 14L24 18"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="26" r="2" fill="white" />
    </svg>
  )
}

export function TalusAgLogo({ variant = "dark", className = "", height = 40 }: TalusAgLogoProps) {
  const { branding } = useBranding()
  // If custom logo is set, use it
  if (branding.companyLogo) {
    return (
        <Image
          src={branding.companyLogo || "/placeholder.svg"}
          alt={branding.companyName}
          width={150}
          height={height}
          className="h-10 w-auto object-contain"
          priority
        />
    )
  }

  // Default logo with company name
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <DefaultLogoIcon size={height} />
      <span className={`font-bold text-xl tracking-tight ${variant === "dark" ? "text-foreground" : "text-white"}`}>
        {branding.companyName}
      </span>
    </div>
  )
}

// Icon-only version for collapsed sidebar
export function TalusAgLogoIcon({ className = "" }: { className?: string }) {
  const { branding } = useBranding()

  // If custom small logo is set, use it
  if (branding.companyLogoSmall) {
    return (
      <Image
        src={branding.companyLogoSmall || "/placeholder.svg"}
        alt={branding.companyName}
        width={40}
        height={40}
        className={`object-contain ${className}`}
        priority
      />
    )
  }

  // Fallback to full logo if small not set but full is
  if (branding.companyLogo) {
    return (
      <Image
        src={branding.companyLogo || "/placeholder.svg"}
        alt={branding.companyName}
        width={40}
        height={40}
        className={`object-contain ${className}`}
        priority
      />
    )
  }

  // Default SVG icon
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="40" height="40" rx="8" fill="#10B981" />
      <path
        d="M12 14H28M20 14V28M16 18L20 14L24 18"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="26" r="2" fill="white" />
    </svg>
  )
}
