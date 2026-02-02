"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

interface ColorSettings {
  primary_color_light: string
  primary_color_dark: string
  accent_color_light: string
  accent_color_dark: string
}

// Convert hex color to OKLCH format
function hexToOklch(hex: string): string {
  // Ensure hex is properly formatted
  if (!hex || !hex.startsWith("#")) return "oklch(0.65 0.2 160)"
  
  // Convert hex to RGB
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  
  // Convert RGB to linear RGB
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  
  // Convert to XYZ
  const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb
  const z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb
  
  // Convert XYZ to Lab
  const xn = 0.95047, yn = 1.0, zn = 1.08883
  const f = (t: number) => t > 0.008856 ? Math.pow(t, 1/3) : (903.3 * t + 16) / 116
  const fx = f(x / xn)
  const fy = f(y / yn)
  const fz = f(z / zn)
  
  const L = 116 * fy - 16
  const a = 500 * (fx - fy)
  const bVal = 200 * (fy - fz)
  
  // Convert Lab to LCH
  const C = Math.sqrt(a * a + bVal * bVal)
  let H = Math.atan2(bVal, a) * 180 / Math.PI
  if (H < 0) H += 360
  
  // Approximate OKLCH values (simplified conversion)
  const oklchL = Math.max(0, Math.min(1, L / 100))
  const oklchC = Math.max(0, Math.min(0.4, C / 150))
  
  return `oklch(${oklchL.toFixed(3)} ${oklchC.toFixed(3)} ${H.toFixed(1)})`
}

export function ThemeColorsLoader() {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function loadColorSettings() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from("settings")
          .select("key, value")
          .is("location_id", null)
          .in("key", ["primary_color_light", "primary_color_dark", "accent_color_light", "accent_color_dark"])
        
        if (data && data.length > 0) {
          const colors: ColorSettings = {
            primary_color_light: "#10B981",
            primary_color_dark: "#10B981",
            accent_color_light: "#059669",
            accent_color_dark: "#34D399",
          }
          
          for (const setting of data) {
            if (setting.key === "primary_color_light") colors.primary_color_light = String(setting.value || "#10B981")
            if (setting.key === "primary_color_dark") colors.primary_color_dark = String(setting.value || "#10B981")
            if (setting.key === "accent_color_light") colors.accent_color_light = String(setting.value || "#059669")
            if (setting.key === "accent_color_dark") colors.accent_color_dark = String(setting.value || "#34D399")
          }
          
          applyColors(colors)
        }
        setLoaded(true)
      } catch (error) {
        console.error("Failed to load color settings:", error)
        setLoaded(true)
      }
    }

    loadColorSettings()
  }, [])

  function applyColors(colors: ColorSettings) {
    const style = document.createElement("style")
    style.id = "theme-colors"
    
    // Remove existing theme colors style if present
    const existing = document.getElementById("theme-colors")
    if (existing) existing.remove()
    
    const primaryLightOklch = hexToOklch(colors.primary_color_light)
    const primaryDarkOklch = hexToOklch(colors.primary_color_dark)
    const accentLightOklch = hexToOklch(colors.accent_color_light)
    const accentDarkOklch = hexToOklch(colors.accent_color_dark)
    
    // Create CSS that overrides the theme colors at all levels
    // We need to override both the base CSS variables AND the Tailwind theme variables
    style.textContent = `
      :root {
        --primary: ${primaryLightOklch} !important;
        --ring: ${primaryLightOklch} !important;
        --sidebar-primary: ${primaryLightOklch} !important;
        --sidebar-ring: ${primaryLightOklch} !important;
        --chart-1: ${primaryLightOklch} !important;
        --accent: ${accentLightOklch} !important;
        --sidebar-accent: ${accentLightOklch} !important;
        --color-primary: ${primaryLightOklch} !important;
        --color-ring: ${primaryLightOklch} !important;
        --color-sidebar-primary: ${primaryLightOklch} !important;
        --color-sidebar-ring: ${primaryLightOklch} !important;
        --color-chart-1: ${primaryLightOklch} !important;
        --color-accent: ${accentLightOklch} !important;
        --color-sidebar-accent: ${accentLightOklch} !important;
      }
      
      .dark, :root.dark, html.dark {
        --primary: ${primaryDarkOklch} !important;
        --ring: ${primaryDarkOklch} !important;
        --sidebar-primary: ${primaryDarkOklch} !important;
        --sidebar-ring: ${primaryDarkOklch} !important;
        --chart-1: ${primaryDarkOklch} !important;
        --accent: ${accentDarkOklch} !important;
        --sidebar-accent: ${accentDarkOklch} !important;
        --color-primary: ${primaryDarkOklch} !important;
        --color-ring: ${primaryDarkOklch} !important;
        --color-sidebar-primary: ${primaryDarkOklch} !important;
        --color-sidebar-ring: ${primaryDarkOklch} !important;
        --color-chart-1: ${primaryDarkOklch} !important;
        --color-accent: ${accentDarkOklch} !important;
        --color-sidebar-accent: ${accentDarkOklch} !important;
      }
      
      /* Also apply directly to elements using bg-primary */
      .bg-primary {
        background-color: ${primaryLightOklch} !important;
      }
      .dark .bg-primary {
        background-color: ${primaryDarkOklch} !important;
      }
    `
    
    document.head.appendChild(style)
  }

  return null // This component doesn't render anything
}
