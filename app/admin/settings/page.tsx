"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Pencil, Trash2, Settings, Tag, MapPin, Sun, Moon, Monitor, Upload, Building2, Mail, Eye, EyeOff, ImageIcon, X, Palette } from "lucide-react"
import { useTheme } from "next-themes"
import type { VisitorType } from "@/types/database"
import Image from "next/image"

interface SystemSettings {
  auto_sign_out: boolean
  host_notifications: boolean
  badge_printing: boolean
  use_miles: boolean
}

interface BrandingSettings {
  company_name: string
  company_logo: string
  company_logo_small: string
}

interface ColorSettings {
  primary_color_light: string
  primary_color_dark: string
  accent_color_light: string
  accent_color_dark: string
}

interface SmtpSettings {
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_pass: string
  smtp_from_email: string
}

interface Location {
  id: string
  name: string
  address: string | null
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [visitorTypes, setVisitorTypes] = useState<VisitorType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingType, setEditingType] = useState<VisitorType | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [settings, setSettings] = useState<SystemSettings>({
    auto_sign_out: true,
    host_notifications: true,
    badge_printing: false,
    use_miles: false,
  })
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [branding, setBranding] = useState<BrandingSettings>({
    company_name: "",
    company_logo: "",
    company_logo_small: "",
  })
  const [smtp, setSmtp] = useState<SmtpSettings>({
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_pass: "",
    smtp_from_email: "",
  })
  const [showSmtpPassword, setShowSmtpPassword] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingSmallLogo, setUploadingSmallLogo] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [smallLogoPreview, setSmallLogoPreview] = useState<string | null>(null)
  const [savingBranding, setSavingBranding] = useState(false)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [colorSettings, setColorSettings] = useState<ColorSettings>({
    primary_color_light: "#10B981",
    primary_color_dark: "#10B981",
    accent_color_light: "#059669",
    accent_color_dark: "#34D399",
  })
  const [savingColors, setSavingColors] = useState(false)
  const [form, setForm] = useState({
    name: "",
    badgeColor: "#10B981",
    requiresHost: true,
    requiresCompany: false,
    requiresTraining: false,
    trainingVideoUrl: "",
    trainingTitle: "",
  })

  async function loadLocations() {
    const supabase = createClient()
    const { data } = await supabase.from("locations").select("id, name, address").order("name")
    if (data && data.length > 0) {
      setLocations(data)
      // Set the first location as default if none selected
      if (!selectedLocationId) {
        setSelectedLocationId(data[0].id)
      }
    }
  }

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from("visitor_types").select("*").order("name")
    if (data) setVisitorTypes(data)
    setIsLoading(false)
  }

  async function loadSettings(locationId: string) {
    setSettingsLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .eq("location_id", locationId)

    // Reset to defaults first
    const loadedSettings: SystemSettings = {
      auto_sign_out: true,
      host_notifications: true,
      badge_printing: false,
      use_miles: false,
    }

    if (data && data.length > 0) {
      for (const setting of data) {
        if (setting.key === "auto_sign_out") loadedSettings.auto_sign_out = setting.value === true || setting.value === "true"
        if (setting.key === "host_notifications") loadedSettings.host_notifications = setting.value === true || setting.value === "true"
        if (setting.key === "badge_printing") loadedSettings.badge_printing = setting.value === true || setting.value === "true"
        if (setting.key === "distance_unit_miles") loadedSettings.use_miles = setting.value === true || setting.value === "true"
      }
    }

    setSettings(loadedSettings)
    setSettingsLoading(false)
  }

  async function loadBrandingSettings() {
    const supabase = createClient()
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .is("location_id", null)
      .in("key", ["company_name", "company_logo", "company_logo_small"])

    if (data && data.length > 0) {
      const loadedBranding: BrandingSettings = {
        company_name: "",
        company_logo: "",
        company_logo_small: "",
      }
      for (const setting of data) {
        if (setting.key === "company_name") loadedBranding.company_name = String(setting.value || "")
        if (setting.key === "company_logo") loadedBranding.company_logo = String(setting.value || "")
        if (setting.key === "company_logo_small") loadedBranding.company_logo_small = String(setting.value || "")
      }
      setBranding(loadedBranding)
    }
  }

  async function loadSmtpSettings() {
    const supabase = createClient()
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .is("location_id", null)
      .in("key", ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_email"])

    if (data && data.length > 0) {
      const loadedSmtp: SmtpSettings = {
        smtp_host: "",
        smtp_port: "587",
        smtp_user: "",
        smtp_pass: "",
        smtp_from_email: "",
      }
      for (const setting of data) {
        if (setting.key === "smtp_host") loadedSmtp.smtp_host = String(setting.value || "")
        if (setting.key === "smtp_port") loadedSmtp.smtp_port = String(setting.value || "587")
        if (setting.key === "smtp_user") loadedSmtp.smtp_user = String(setting.value || "")
        if (setting.key === "smtp_pass") loadedSmtp.smtp_pass = String(setting.value || "")
        if (setting.key === "smtp_from_email") loadedSmtp.smtp_from_email = String(setting.value || "")
      }
      setSmtp(loadedSmtp)
    }
  }

  async function loadColorSettings() {
    const supabase = createClient()
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .is("location_id", null)
      .in("key", ["primary_color_light", "primary_color_dark", "accent_color_light", "accent_color_dark"])

    if (data && data.length > 0) {
      const loadedColors: ColorSettings = {
        primary_color_light: "#10B981",
        primary_color_dark: "#10B981",
        accent_color_light: "#059669",
        accent_color_dark: "#34D399",
      }
      for (const setting of data) {
        if (setting.key === "primary_color_light") loadedColors.primary_color_light = String(setting.value || "#10B981")
        if (setting.key === "primary_color_dark") loadedColors.primary_color_dark = String(setting.value || "#10B981")
        if (setting.key === "accent_color_light") loadedColors.accent_color_light = String(setting.value || "#059669")
        if (setting.key === "accent_color_dark") loadedColors.accent_color_dark = String(setting.value || "#34D399")
      }
      setColorSettings(loadedColors)
      // Apply color settings to CSS
      applyColorSettings(loadedColors)
    }
  }

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
    const f = (t: number) => t > 0.008856 ? Math.pow(t, 1 / 3) : (903.3 * t + 16) / 116
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

    // Approximate OKLCH values
    const oklchL = Math.max(0, Math.min(1, L / 100))
    const oklchC = Math.max(0, Math.min(0.4, C / 150))

    return `oklch(${oklchL.toFixed(3)} ${oklchC.toFixed(3)} ${H.toFixed(1)})`
  }

  function applyColorSettings(colors: ColorSettings) {
    // Remove existing theme colors style if present
    const existing = document.getElementById("theme-colors")
    if (existing) existing.remove()

    const primaryLightOklch = hexToOklch(colors.primary_color_light)
    const primaryDarkOklch = hexToOklch(colors.primary_color_dark)
    const accentLightOklch = hexToOklch(colors.accent_color_light)
    const accentDarkOklch = hexToOklch(colors.accent_color_dark)

    // Create CSS that overrides the theme colors at all levels
    // We need to override both the base CSS variables AND the Tailwind theme variables
    const style = document.createElement("style")
    style.id = "theme-colors"
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

  async function saveColorSettings() {
    setSavingColors(true)
    const supabase = createClient()

    const colorKeys = ["primary_color_light", "primary_color_dark", "accent_color_light", "accent_color_dark"] as const
    for (const key of colorKeys) {
      const { data: existing } = await supabase
        .from("settings")
        .select("id")
        .eq("key", key)
        .is("location_id", null)
        .single()

      if (existing) {
        await supabase
          .from("settings")
          .update({ value: colorSettings[key] })
          .eq("key", key)
          .is("location_id", null)
      } else {
        await supabase
          .from("settings")
          .insert({
            key,
            value: colorSettings[key],
            location_id: null,
          })
      }
    }

    // Apply the colors
    applyColorSettings(colorSettings)
    setSavingColors(false)
  }

  async function saveBrandingSettings() {
    setSavingBranding(true)
    const supabase = createClient()

    const brandingKeys = ["company_name", "company_logo", "company_logo_small"] as const
    for (const key of brandingKeys) {
      // Convert empty strings to null
      const value = branding[key].trim() === "" ? null : branding[key]

      // First try to update existing record
      const { data: existing } = await supabase
        .from("settings")
        .select("id")
        .eq("key", key)
        .is("location_id", null)
        .single()

      if (existing) {
        // Update existing record - set to null if empty
        await supabase
          .from("settings")
          .update({ value })
          .eq("key", key)
          .is("location_id", null)
      } else if (value !== null) {
        // Only insert new record if value is not null
        await supabase
          .from("settings")
          .insert({
            key,
            value,
            location_id: null,
          })
      }
    }

    setSavingBranding(false)
  }

  async function saveSmtpSettings() {
    setSavingSmtp(true)
    const supabase = createClient()

    const smtpKeys = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_email"] as const
    for (const key of smtpKeys) {
      // First try to update existing record
      const { data: existing } = await supabase
        .from("settings")
        .select("id")
        .eq("key", key)
        .is("location_id", null)
        .single()

      if (existing) {
        // Update existing record
        await supabase
          .from("settings")
          .update({ value: smtp[key] })
          .eq("key", key)
          .is("location_id", null)
      } else {
        // Insert new record
        await supabase
          .from("settings")
          .insert({
            key,
            value: smtp[key],
            location_id: null,
          })
      }
    }

    setSavingSmtp(false)
  }

  async function handleLogoUpload(file: File, type: "full" | "small") {
    if (type === "full") setUploadingLogo(true)
    else setUploadingSmallLogo(true)

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      if (type === "full") {
        setLogoPreview(result)
      } else {
        setSmallLogoPreview(result)
      }
    }
    reader.readAsDataURL(file)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", type)

      const response = await fetch("/api/admin/upload-logo", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Upload failed")
      }

      const { url } = await response.json()
      // Add cache buster to force refresh
      const urlWithCacheBuster = `${url}?t=${Date.now()}`

      if (type === "full") {
        setBranding(prev => ({ ...prev, company_logo: urlWithCacheBuster }))
        setLogoPreview(null)
      } else {
        setBranding(prev => ({ ...prev, company_logo_small: urlWithCacheBuster }))
        setSmallLogoPreview(null)
      }
    } catch (error) {
      console.error("Upload error:", error)
      alert(error instanceof Error ? error.message : "Failed to upload image")
      // Clear preview on error
      if (type === "full") setLogoPreview(null)
      else setSmallLogoPreview(null)
    } finally {
      if (type === "full") setUploadingLogo(false)
      else setUploadingSmallLogo(false)
    }
  }

  async function removeLogo(type: "full" | "small") {
    const url = type === "full" ? branding.company_logo : branding.company_logo_small
    if (!url) return

    try {
      await fetch("/api/admin/upload-logo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
    } catch {
      // Ignore delete errors
    }

    if (type === "full") {
      setBranding(prev => ({ ...prev, company_logo: "" }))
    } else {
      setBranding(prev => ({ ...prev, company_logo_small: "" }))
    }
  }

  async function updateSetting(key: keyof SystemSettings, value: boolean) {
    if (!selectedLocationId) return

    const supabase = createClient()
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)

    // Map the state key to the database key
    const dbKey = key === "use_miles" ? "distance_unit_miles" : key

    // Try to update first
    const { data: existingData } = await supabase
      .from("settings")
      .select("id")
      .eq("key", dbKey)
      .eq("location_id", selectedLocationId)
      .single()

    if (existingData) {
      // Update existing setting
      await supabase
        .from("settings")
        .update({ value: value, updated_at: new Date().toISOString() })
        .eq("key", dbKey)
        .eq("location_id", selectedLocationId)
    } else {
      // Insert new setting for this location
      await supabase.from("settings").insert({
        key: dbKey,
        value: value,
        location_id: selectedLocationId
      })
    }
  }

  // Set mounted state for hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load locations and global settings on mount
  useEffect(() => {
    loadLocations()
    loadData()
    loadBrandingSettings()
    loadSmtpSettings()
    loadColorSettings()
  }, [])

  // Load settings when location changes
  useEffect(() => {
    if (selectedLocationId) {
      loadSettings(selectedLocationId)
    }
  }, [selectedLocationId])

  function openCreateDialog() {
    setEditingType(null)
    setForm({
      name: "",
      badgeColor: "#10B981",
      requiresHost: true,
      requiresCompany: false,
      requiresTraining: false,
      trainingVideoUrl: "",
      trainingTitle: "",
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(type: VisitorType) {
    setEditingType(type)
    setForm({
      name: type.name,
      badgeColor: type.badge_color,
      requiresHost: type.requires_host,
      requiresCompany: type.requires_company,
      requiresTraining: type.requires_training,
      trainingVideoUrl: type.training_video_url || "",
      trainingTitle: type.training_title || "",
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    // Get location
    const { data: locations } = await supabase.from("locations").select("id").limit(1)
    if (!locations || locations.length === 0) return

    const data = {
      name: form.name,
      badge_color: form.badgeColor,
      requires_host: form.requiresHost,
      requires_company: form.requiresCompany,
      requires_training: form.requiresTraining,
      training_video_url: form.trainingVideoUrl || null,
      training_title: form.trainingTitle || null,
      location_id: locations[0].id,
    }

    if (editingType) {
      await supabase.from("visitor_types").update(data).eq("id", editingType.id)
    } else {
      await supabase.from("visitor_types").insert(data)
    }

    setIsDialogOpen(false)
    loadData()
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this visitor type?")) return
    const supabase = createClient()
    await supabase.from("visitor_types").delete().eq("id", id)
    loadData()
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Configure visitor management settings</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-6">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Tag className="w-5 h-5" />
              Visitor Types
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Configure categories for different visitor types</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} size="sm" className="w-fit">
                <Plus className="w-4 h-4 mr-2" />
                Add Type
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingType ? "Edit Visitor Type" : "Add Visitor Type"}</DialogTitle>
                <DialogDescription>
                  {editingType ? "Update visitor type settings" : "Create a new visitor category"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Contractor, Interview"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Badge Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="color"
                      type="color"
                      value={form.badgeColor}
                      onChange={(e) => setForm({ ...form, badgeColor: e.target.value })}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={form.badgeColor}
                      onChange={(e) => setForm({ ...form, badgeColor: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="requiresHost">Requires Host</Label>
                  <Switch
                    id="requiresHost"
                    checked={form.requiresHost}
                    onCheckedChange={(checked: boolean) => setForm({ ...form, requiresHost: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="requiresCompany">Requires Company</Label>
                  <Switch
                    id="requiresCompany"
                    checked={form.requiresCompany}
                    onCheckedChange={(checked: boolean) => setForm({ ...form, requiresCompany: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requiresTraining">Requires Safety Training</Label>
                    <p className="text-xs text-muted-foreground">Visitors must complete training on first visit</p>
                  </div>
                  <Switch
                    id="requiresTraining"
                    checked={form.requiresTraining}
                    onCheckedChange={(checked: boolean) => setForm({ ...form, requiresTraining: checked })}
                  />
                </div>
                {form.requiresTraining && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="trainingTitle">Training Title</Label>
                      <Input
                        id="trainingTitle"
                        value={form.trainingTitle}
                        onChange={(e) => setForm({ ...form, trainingTitle: e.target.value })}
                        placeholder="e.g., Safety Orientation"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trainingVideoUrl">Training Video URL</Label>
                      <Input
                        id="trainingVideoUrl"
                        value={form.trainingVideoUrl}
                        onChange={(e) => setForm({ ...form, trainingVideoUrl: e.target.value })}
                        placeholder="https://www.youtube.com/embed/..."
                      />
                      <p className="text-xs text-muted-foreground">
                        Use YouTube embed URL format
                      </p>
                    </div>
                  </>
                )}
                <DialogFooter>
                  <Button type="submit">{editingType ? "Save Changes" : "Add Type"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : visitorTypes.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No visitor types configured</p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="space-y-3 md:hidden">
                {visitorTypes.map((type) => (
                  <div key={type.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: type.badge_color }} />
                        <p className="font-medium text-sm">{type.name}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={type.requires_host ? "text-foreground" : "text-muted-foreground"}>
                        Host: {type.requires_host ? "Yes" : "No"}
                      </span>
                      <span className={type.requires_company ? "text-foreground" : "text-muted-foreground"}>
                        Company: {type.requires_company ? "Yes" : "No"}
                      </span>
                      {type.requires_training && (
                        <span className="text-orange-600 font-medium">Training Required</span>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(type)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(type.id)}>
                        <Trash2 className="w-4 h-4 mr-1 text-destructive" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Badge Color</TableHead>
                      <TableHead>Requires Host</TableHead>
                      <TableHead>Requires Company</TableHead>
                      <TableHead>Safety Training</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visitorTypes.map((type) => (
                      <TableRow key={type.id}>
                        <TableCell className="font-medium">{type.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: type.badge_color }} />
                            <span className="text-sm text-muted-foreground">{type.badge_color}</span>
                          </div>
                        </TableCell>
                        <TableCell>{type.requires_host ? "Yes" : "No"}</TableCell>
                        <TableCell>{type.requires_company ? "Yes" : "No"}</TableCell>
                        <TableCell>
                          {type.requires_training ? (
                            <span className="text-orange-600 font-medium">Required</span>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(type)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(type.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Settings className="w-5 h-5" />
                General Settings
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Location-specific configuration options</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select
                value={selectedLocationId || ""}
                onValueChange={(value) => setSelectedLocationId(value)}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4 sm:space-y-6">
          {settingsLoading ? (
            <p className="text-center py-4 text-muted-foreground">Loading settings...</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Label className="text-sm">Auto Sign-Out</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">Automatically sign out visitors at end of day</p>
                </div>
                <Switch
                  checked={settings.auto_sign_out}
                  onCheckedChange={(checked: boolean) => updateSetting("auto_sign_out", checked)}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Label className="text-sm">Host Notifications</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">Email hosts when their visitors arrive</p>
                </div>
                <Switch
                  checked={settings.host_notifications}
                  onCheckedChange={(checked: boolean) => updateSetting("host_notifications", checked)}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Label className="text-sm">Badge Printing</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">Enable automatic visitor badge printing</p>
                </div>
                <Switch
                  checked={settings.badge_printing}
                  onCheckedChange={(checked: boolean) => updateSetting("badge_printing", checked)}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Label className="text-sm">Distance Unit</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">Display distances in miles instead of kilometers on kiosk</p>
                </div>
                <Switch
                  checked={settings.use_miles}
                  onCheckedChange={(checked: boolean) => updateSetting("use_miles", checked)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sun className="w-5 h-5" />
            Appearance
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Customize the look and feel of the admin dashboard</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="space-y-3">
            <Label className="text-sm">Theme</Label>
            {!mounted ? (
              <div className="grid grid-cols-3 gap-3">
                <Button variant="outline" className="bg-transparent">
                  <Sun className="w-4 h-4 mr-2" />
                  Light
                </Button>
                <Button variant="outline" className="bg-transparent">
                  <Moon className="w-4 h-4 mr-2" />
                  Dark
                </Button>
                <Button variant="outline" className="bg-transparent">
                  <Monitor className="w-4 h-4 mr-2" />
                  System
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  className={theme !== "light" ? "bg-transparent" : ""}
                  onClick={() => setTheme("light")}
                >
                  <Sun className="w-4 h-4 mr-2" />
                  Light
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  className={theme !== "dark" ? "bg-transparent" : ""}
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="w-4 h-4 mr-2" />
                  Dark
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  className={theme !== "system" ? "bg-transparent" : ""}
                  onClick={() => setTheme("system")}
                >
                  <Monitor className="w-4 h-4 mr-2" />
                  System
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {!mounted
                ? "Loading theme preference..."
                : theme === "system"
                  ? "Theme will automatically match your system preferences"
                  : `Using ${theme} mode`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Branding Settings Card */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Building2 className="w-5 h-5" />
            Company Branding
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Customize the company logo and name displayed on the kiosk and admin portal
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-6">
          {/* Company Name */}
          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name</Label>
            <Input
              id="company_name"
              placeholder="Enter your company name"
              value={branding.company_name}
              onChange={(e) => setBranding(prev => ({ ...prev, company_name: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              This name will be displayed in the header and emails
            </p>
          </div>

          {/* Full Logo */}
          <div className="space-y-2">
            <Label>Company Logo (Full)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Main logo for headers and larger displays. Recommended: 200x50px or similar aspect ratio.
            </p>
            {(logoPreview || branding.company_logo) ? (
              <div className="flex items-center gap-4">
                <div className="relative w-[200px] h-[60px] border rounded-lg overflow-hidden bg-muted/50 flex items-center justify-center p-2">
                  <Image
                    src={logoPreview || branding.company_logo || "/placeholder.svg"}
                    alt="Company Logo"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                  {uploadingLogo && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleLogoUpload(file, "full")
                      }}
                      disabled={uploadingLogo}
                    />
                    <Button variant="outline" size="sm" className="bg-transparent" asChild disabled={uploadingLogo}>
                      <span>
                        <Upload className="w-4 h-4 mr-1" />
                        Change
                      </span>
                    </Button>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
                    onClick={() => removeLogo("full")}
                    disabled={uploadingLogo}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleLogoUpload(file, "full")
                    }}
                    disabled={uploadingLogo}
                  />
                  <Button variant="outline" className="bg-transparent" asChild disabled={uploadingLogo}>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingLogo ? "Uploading..." : "Upload Logo"}
                    </span>
                  </Button>
                </label>
              </div>
            )}
          </div>

          {/* Small Logo / Icon */}
          <div className="space-y-2">
            <Label>Company Logo (Small / Icon)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Square icon for favicons, collapsed sidebar, and small displays. Recommended: 64x64px.
            </p>
            {(smallLogoPreview || branding.company_logo_small) ? (
              <div className="flex items-center gap-4">
                <div className="relative w-[64px] h-[64px] border rounded-lg overflow-hidden bg-muted/50 flex items-center justify-center p-1">
                  <Image
                    src={smallLogoPreview || branding.company_logo_small || "/placeholder.svg"}
                    alt="Company Icon"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                  {uploadingSmallLogo && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleLogoUpload(file, "small")
                      }}
                      disabled={uploadingSmallLogo}
                    />
                    <Button variant="outline" size="sm" className="bg-transparent" asChild disabled={uploadingSmallLogo}>
                      <span>
                        <Upload className="w-4 h-4 mr-1" />
                        Change
                      </span>
                    </Button>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
                    onClick={() => removeLogo("small")}
                    disabled={uploadingSmallLogo}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleLogoUpload(file, "small")
                    }}
                    disabled={uploadingSmallLogo}
                  />
                  <Button variant="outline" className="bg-transparent" asChild disabled={uploadingSmallLogo}>
                    <span>
                      <ImageIcon className="w-4 h-4 mr-2" />
                      {uploadingSmallLogo ? "Uploading..." : "Upload Icon"}
                    </span>
                  </Button>
                </label>
              </div>
            )}
          </div>

          <div className="pt-2">
            <Button onClick={saveBrandingSettings} disabled={savingBranding}>
              {savingBranding ? "Saving..." : "Save Branding Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SMTP Settings Card */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Mail className="w-5 h-5" />
            Email Notifications (SMTP)
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Configure SMTP settings for sending email notifications to hosts
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="smtp_host">SMTP Host</Label>
              <Input
                id="smtp_host"
                placeholder="smtp.example.com"
                value={smtp.smtp_host}
                onChange={(e) => setSmtp(prev => ({ ...prev, smtp_host: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port">SMTP Port</Label>
              <Input
                id="smtp_port"
                placeholder="587"
                value={smtp.smtp_port}
                onChange={(e) => setSmtp(prev => ({ ...prev, smtp_port: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="smtp_user">SMTP Username</Label>
              <Input
                id="smtp_user"
                placeholder="user@example.com"
                value={smtp.smtp_user}
                onChange={(e) => setSmtp(prev => ({ ...prev, smtp_user: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_pass">SMTP Password</Label>
              <div className="relative">
                <Input
                  id="smtp_pass"
                  type={showSmtpPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={smtp.smtp_pass}
                  onChange={(e) => setSmtp(prev => ({ ...prev, smtp_pass: e.target.value }))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                >
                  {showSmtpPassword ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp_from_email">From Email Address</Label>
            <Input
              id="smtp_from_email"
              type="email"
              placeholder="noreply@yourcompany.com"
              value={smtp.smtp_from_email}
              onChange={(e) => setSmtp(prev => ({ ...prev, smtp_from_email: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              The email address that notifications will be sent from
            </p>
          </div>

          <div className="pt-2">
            <Button onClick={saveSmtpSettings} disabled={savingSmtp}>
              {savingSmtp ? "Saving..." : "Save SMTP Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
