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
import { Plus, Pencil, Trash2, Settings, Tag, MapPin } from "lucide-react"
import type { VisitorType } from "@/types/database"

interface SystemSettings {
  auto_sign_out: boolean
  host_notifications: boolean
  badge_printing: boolean
  use_miles: boolean
}

interface Location {
  id: string
  name: string
  address: string | null
}

export default function SettingsPage() {
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

  // Load locations on mount
  useEffect(() => {
    loadLocations()
    loadData()
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
    </div>
  )
}
