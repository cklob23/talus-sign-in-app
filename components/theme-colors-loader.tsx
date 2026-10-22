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
            primary_color_light: "#00854c",
            primary_color_dark: "#00854c",
            accent_color_light: "#00b162",
            accent_color_dark: "#00b162",
          }
          
          for (const setting of data) {
            if (setting.key === "primary_color_light") colors.primary_color_light = String(setting.value || "#00854c")
            if (setting.key === "primary_color_dark") colors.primary_color_dark = String(setting.value || "#00854c")
            if (setting.key === "accent_color_light") colors.accent_color_light = String(setting.value || "#00b162")
            if (setting.key === "accent_color_dark") colors.accent_color_dark = String(setting.value || "#00b162")
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
    
    // Keep admin-chosen colors as hex so AA contrast stays as calculated.
    const primaryLight = colors.primary_color_light
    const primaryDark = colors.primary_color_dark
    const accentLight = colors.accent_color_light
    const accentDark = colors.accent_color_dark
    
    style.textContent = `
      :root {
        --primary: ${primaryLight} !important;
        --ring: #0a5c36 !important;
        --sidebar-primary: ${primaryLight} !important;
        --sidebar-ring: #0a5c36 !important;
        --chart-1: ${hexToOklch(primaryLight)} !important;
        --accent: #e2f4e9 !important;
        --sidebar-accent: #e2f4e9 !important;
        --color-primary: ${primaryLight} !important;
        --color-ring: #0a5c36 !important;
        --color-sidebar-primary: ${primaryLight} !important;
        --color-sidebar-ring: #0a5c36 !important;
        --color-chart-1: ${hexToOklch(primaryLight)} !important;
        --color-accent: #e2f4e9 !important;
        --color-sidebar-accent: #e2f4e9 !important;
        --brand-accent: ${accentLight} !important;
      }
      
      .dark, :root.dark, html.dark {
        --primary: ${primaryDark} !important;
        --ring: #7fe3ad !important;
        --sidebar-primary: ${primaryDark} !important;
        --sidebar-ring: #7fe3ad !important;
        --chart-1: ${hexToOklch(primaryDark)} !important;
        --accent: #123a26 !important;
        --sidebar-accent: #123a26 !important;
        --color-primary: ${primaryDark} !important;
        --color-ring: #7fe3ad !important;
        --color-sidebar-primary: ${primaryDark} !important;
        --color-sidebar-ring: #7fe3ad !important;
        --color-chart-1: ${hexToOklch(primaryDark)} !important;
        --color-accent: #123a26 !important;
        --color-sidebar-accent: #123a26 !important;
        --brand-accent: ${accentDark} !important;
      }
      
      .bg-primary {
        background-color: ${primaryLight} !important;
      }
      .dark .bg-primary {
        background-color: ${primaryDark} !important;
      }
    `
    
    document.head.appendChild(style)
  }

  return null // This component doesn't render anything
}
