"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Plus, Pencil, Trash2, Building2, MapPin, Loader2, Crosshair, Search } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import type { Location } from "@/types/database"
import { logAudit } from "@/lib/audit-log"
import { notifyError, notifySuccess } from "@/hooks/admin-notify"
import { COMMON_TIMEZONES } from "@/hooks/use-user-timezone"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DEFAULT_RADIUS_METERS,
  MAX_RADIUS_METERS,
  MIN_RADIUS_METERS,
  formatRadiusMeters,
  parseLocationRadius,
  radiusOverCap,
} from "@/lib/location-radius"

function endOfDayOverrideLabel(location: Location): string {
  const parts: string[] = []
  if (location.auto_sign_out_employees != null || location.auto_sign_out_employees_time) {
    const enabled =
      location.auto_sign_out_employees == null
        ? "global on/off"
        : location.auto_sign_out_employees
          ? "on"
          : "off"
    const time = location.auto_sign_out_employees_time ? ` ${location.auto_sign_out_employees_time}` : ""
    parts.push(`Emp ${enabled}${time}`)
  }
  if (location.auto_sign_out_visitors != null || location.auto_sign_out_visitors_time) {
    const enabled =
      location.auto_sign_out_visitors == null
        ? "global on/off"
        : location.auto_sign_out_visitors
          ? "on"
          : "off"
    const time = location.auto_sign_out_visitors_time ? ` ${location.auto_sign_out_visitors_time}` : ""
    parts.push(`Vis ${enabled}${time}`)
  }
  return parts.length ? parts.join(", ") : "Global default"
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [isGettingGPS, setIsGettingGPS] = useState(false)
  const [form, setForm] = useState({
    name: "",
    address: "",
    timezone: "America/Chicago",
    latitude: null as number | null,
    longitude: null as number | null,
    auto_signin_radius_meters: DEFAULT_RADIUS_METERS,
    auto_signout_minutes: 30,
    geofence_enabled: true,
    auto_sign_out_employees: null as boolean | null,
    auto_sign_out_employees_time: null as string | null,
    auto_sign_out_visitors: null as boolean | null,
    auto_sign_out_visitors_time: null as string | null,
  })
  const [radiusError, setRadiusError] = useState<string | null>(null)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)
  const [geocodeType, setGeocodeType] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from("locations").select("*").order("name")
    if (data) setLocations(data)
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Capture precise GPS coordinates from the device
  // This is more accurate than geocoding an address because it uses the
  // device's actual GPS hardware rather than estimating from address text
  async function captureGPSCoordinates() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser")
      return
    }

    setIsGettingGPS(true)

    // Use watchPosition and keep the best (most accurate) reading
    let bestAccuracy = Infinity
    let bestLat = 0
    let bestLng = 0

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        if (accuracy < bestAccuracy) {
          bestAccuracy = accuracy
          bestLat = latitude
          bestLng = longitude
          // Update form in real time with the best reading so far
          setForm(prev => ({ ...prev, latitude: bestLat, longitude: bestLng }))
        }
        // Stop once we get a GPS-quality fix (<=30m) 
        if (accuracy <= 30) {
          navigator.geolocation.clearWatch(watchId)
          clearTimeout(timer)
          setIsGettingGPS(false)
        }
      },
      (error) => {
        console.error("GPS error:", error.message)
        alert("Unable to get your location. Make sure location services are enabled.")
        clearTimeout(timer)
        setIsGettingGPS(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )

    // Timeout after 10s — use whatever we have
    const timer = setTimeout(() => {
      navigator.geolocation.clearWatch(watchId)
      setIsGettingGPS(false)
      if (bestAccuracy < Infinity) {
        setForm(prev => ({ ...prev, latitude: bestLat, longitude: bestLng }))
      }
    }, 10000)
  }

  // Only runs when the admin asks. Save never calls this.
  async function lookupAddress() {
    if (!form.address.trim()) {
      setGeocodeError("Enter an address first.")
      return
    }

    setIsGeocoding(true)
    setGeocodeError(null)
    setGeocodeType(null)
    try {
      const response = await fetch(
        `/api/geocode?address=${encodeURIComponent(form.address)}`
      )
      const data = await response.json()

      if (!response.ok || data.lat == null || data.lng == null) {
        setGeocodeError(typeof data.error === "string" ? data.error : "Address lookup failed.")
        return
      }

      const locationType = typeof data.location_type === "string" ? data.location_type : ""
      if (locationType === "APPROXIMATE") {
        setGeocodeError(
          "Google only found an approximate point (town or region). Type coordinates or use your location instead.",
        )
        setGeocodeType(locationType)
        return
      }

      setForm((prev) => ({ ...prev, latitude: data.lat, longitude: data.lng }))
      setGeocodeType(locationType || "OK")
    } catch (error) {
      console.error("Geocoding error:", error)
      setGeocodeError("Address lookup failed.")
    } finally {
      setIsGeocoding(false)
    }
  }

  function openCreateDialog() {
    setEditingLocation(null)
    setForm({
      name: "",
      address: "",
      timezone: "America/Chicago",
      latitude: null,
      longitude: null,
      auto_signin_radius_meters: DEFAULT_RADIUS_METERS,
      auto_signout_minutes: 30,
      geofence_enabled: true,
      auto_sign_out_employees: null,
      auto_sign_out_employees_time: null,
      auto_sign_out_visitors: null,
      auto_sign_out_visitors_time: null,
    })
    setRadiusError(null)
    setGeocodeError(null)
    setGeocodeType(null)
    setSaveError(null)
    setIsDialogOpen(true)
  }

  function openEditDialog(location: Location) {
    setEditingLocation(location)
    setForm({
      name: location.name,
      address: location.address || "",
      timezone: location.timezone,
      latitude: location.latitude,
      longitude: location.longitude,
      auto_signin_radius_meters:
        location.auto_signin_radius_meters === 0
          ? 0
          : location.auto_signin_radius_meters ?? DEFAULT_RADIUS_METERS,
      auto_signout_minutes: location.auto_signout_minutes ?? 30,
      geofence_enabled: location.geofence_enabled !== false && location.auto_signin_radius_meters !== 0,
      auto_sign_out_employees: location.auto_sign_out_employees ?? null,
      auto_sign_out_employees_time: location.auto_sign_out_employees_time ?? null,
      auto_sign_out_visitors: location.auto_sign_out_visitors ?? null,
      auto_sign_out_visitors_time: location.auto_sign_out_visitors_time ?? null,
    })
    setRadiusError(null)
    setGeocodeError(null)
    setGeocodeType(null)
    setSaveError(null)
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)

    const radius = parseLocationRadius(
      form.geofence_enabled ? form.auto_signin_radius_meters : 0,
      editingLocation?.auto_signin_radius_meters,
    )
    if (!radius.ok) {
      setRadiusError(radius.error)
      return
    }
    setRadiusError(null)
    setIsSaving(true)

    try {
      const payload = {
        id: editingLocation?.id,
        name: form.name,
        address: form.address || null,
        timezone: form.timezone,
        latitude: form.latitude,
        longitude: form.longitude,
        auto_signin_radius_meters: radius.meters,
        auto_signout_minutes: form.auto_signout_minutes,
        geofence_enabled: radius.enabled,
        auto_sign_out_employees: form.auto_sign_out_employees,
        auto_sign_out_employees_time: form.auto_sign_out_employees_time,
        auto_sign_out_visitors: form.auto_sign_out_visitors,
        auto_sign_out_visitors_time: form.auto_sign_out_visitors_time,
      }
      const response = await fetch("/api/admin/locations", {
        method: editingLocation ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = typeof json.error === "string" ? json.error : "Could not save location."
        setSaveError(message)
        notifyError("Could not save location", message)
        return
      }
      notifySuccess(editingLocation ? "Location updated" : "Location created")
      setIsDialogOpen(false)
      loadData()
    } catch (error) {
      console.error("Location save failed:", error)
      setSaveError("Could not save location.")
      notifyError("Could not save location", "Could not save location.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this location? This will affect all associated data.")) return
    const supabase = createClient()
    const locationToDelete = locations.find(l => l.id === id)
    const { error } = await supabase.from("locations").delete().eq("id", id)
    if (error) {
      notifyError("Could not delete location", error.message)
      return
    }
    await logAudit({
      action: "location.deleted",
      entityType: "location",
      entityId: id,
      description: `Location deleted: ${locationToDelete?.name || id}`,
    })
    notifySuccess("Location deleted")
    loadData()
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Locations</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage facility locations</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} size="sm" className="w-fit">
              <Plus className="w-4 h-4 mr-2" />
              Add Location
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="location-edit-dialog">
            <DialogHeader>
              <DialogTitle className="text-lg">{editingLocation ? "Edit Location" : "Add Location"}</DialogTitle>
              <DialogDescription className="text-sm">
                {editingLocation ? "Update location details" : "Add a new facility location"}
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
                  placeholder="e.g., Main Office"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <div className="flex gap-2">
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="123 Main Street, City, State"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={lookupAddress}
                    disabled={isGeocoding}
                    className="shrink-0"
                  >
                    {isGeocoding ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="ml-1.5 hidden sm:inline">Look up address</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Looking up an address only fills coordinates when you click the button. Saving never overwrites a GPS or typed point.
                </p>
                {geocodeError && <p className="text-xs text-destructive">{geocodeError}</p>}
                {geocodeType && !geocodeError && (
                  <p className="text-xs text-muted-foreground">Google match type: {geocodeType}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={form.timezone}
                  onValueChange={(value) => setForm({ ...form, timezone: value })}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue placeholder="America/Chicago" />
                  </SelectTrigger>
                  <SelectContent>
                    {(COMMON_TIMEZONES.some((zone) => zone.value === form.timezone)
                      ? COMMON_TIMEZONES
                      : [{ value: form.timezone, label: form.timezone }, ...COMMON_TIMEZONES]
                    ).map((zone) => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  End-of-day times use this timezone. US sites should be America/Chicago (6 PM CT). Kenya sites should be Africa/Nairobi. Spain Site should be Europe/Madrid.
                </p>
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div>
                  <Label>End-of-day auto sign-out</Label>
                  <p className="text-xs text-muted-foreground">
                    Leave a field on Global default to use Settings (employees 18:00, visitors 23:45 unless changed). A custom value applies only at this location, in the timezone above.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="employeeSignoutEnabled" className="text-xs">Employees</Label>
                    <select
                      id="employeeSignoutEnabled"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.auto_sign_out_employees === null ? "" : form.auto_sign_out_employees ? "on" : "off"}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          auto_sign_out_employees: e.target.value === "" ? null : e.target.value === "on",
                        })
                      }
                    >
                      <option value="">Global default</option>
                      <option value="on">On</option>
                      <option value="off">Off</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="employeeSignoutTime" className="text-xs">Employee time</Label>
                    <div className="flex gap-2">
                      <Input
                        id="employeeSignoutTime"
                        type="time"
                        value={form.auto_sign_out_employees_time ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, auto_sign_out_employees_time: e.target.value || null })
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => setForm({ ...form, auto_sign_out_employees_time: null })}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="visitorSignoutEnabled" className="text-xs">Visitors</Label>
                    <select
                      id="visitorSignoutEnabled"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.auto_sign_out_visitors === null ? "" : form.auto_sign_out_visitors ? "on" : "off"}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          auto_sign_out_visitors: e.target.value === "" ? null : e.target.value === "on",
                        })
                      }
                    >
                      <option value="">Global default</option>
                      <option value="on">On</option>
                      <option value="off">Off</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="visitorSignoutTime" className="text-xs">Visitor time</Label>
                    <div className="flex gap-2">
                      <Input
                        id="visitorSignoutTime"
                        type="time"
                        value={form.auto_sign_out_visitors_time ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, auto_sign_out_visitors_time: e.target.value || null })
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => setForm({ ...form, auto_sign_out_visitors_time: null })}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="geofenceEnabled">Enforce on-site check</Label>
                    <p className="text-xs text-muted-foreground">
                      Off only when you turn this switch off. A blank radius uses {formatRadiusMeters(DEFAULT_RADIUS_METERS)}.
                    </p>
                  </div>
                  <Switch
                    id="geofenceEnabled"
                    checked={form.geofence_enabled}
                    onCheckedChange={(checked) => {
                      setForm({
                        ...form,
                        geofence_enabled: checked,
                        auto_signin_radius_meters: checked
                          ? form.auto_signin_radius_meters || DEFAULT_RADIUS_METERS
                          : 0,
                      })
                      setRadiusError(null)
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="radius">On-site radius</Label>
                <Input
                  id="radius"
                  type="number"
                  min={MIN_RADIUS_METERS}
                  max={MAX_RADIUS_METERS}
                  disabled={!form.geofence_enabled}
                  value={form.geofence_enabled ? form.auto_signin_radius_meters : 0}
                  onChange={(e) => {
                    const raw = e.target.value === "" ? DEFAULT_RADIUS_METERS : parseInt(e.target.value, 10)
                    setForm({ ...form, auto_signin_radius_meters: Number.isFinite(raw) ? raw : DEFAULT_RADIUS_METERS })
                    const parsed = parseLocationRadius(
                      Number.isFinite(raw) ? raw : DEFAULT_RADIUS_METERS,
                      editingLocation?.auto_signin_radius_meters,
                    )
                    setRadiusError(parsed.ok ? null : parsed.error)
                  }}
                  placeholder="500"
                />
                <p className="text-xs text-muted-foreground">
                  {form.geofence_enabled
                    ? `${formatRadiusMeters(form.auto_signin_radius_meters || DEFAULT_RADIUS_METERS)}. Allowed range ${MIN_RADIUS_METERS} m to ${formatRadiusMeters(MAX_RADIUS_METERS)}. Used for QR and kiosk sign-in.`
                    : "On-site check is off for this location."}
                </p>
                {radiusOverCap(form.auto_signin_radius_meters) && (
                  <p className="text-xs text-amber-700">
                    This stored radius is {formatRadiusMeters(form.auto_signin_radius_meters)}. Tighten it to {formatRadiusMeters(MAX_RADIUS_METERS)} or less before the fence is useful.
                  </p>
                )}
                {radiusError && <p className="text-xs text-destructive">{radiusError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="autoSignout">Auto Sign-Out Time (minutes)</Label>
                <Input
                  id="autoSignout"
                  type="number"
                  min={0}
                  value={form.auto_signout_minutes}
                  onChange={(e) => setForm({ ...form, auto_signout_minutes: parseInt(e.target.value) || 0 })}
                  placeholder="30"
                />
                <p className="text-xs text-muted-foreground">
                  Employees outside the sign-in radius for this long will be automatically signed out. Set to 0 to disable.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Coordinates</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={captureGPSCoordinates}
                    disabled={isGettingGPS}
                  >
                    {isGettingGPS ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Crosshair className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {isGettingGPS ? "Getting GPS..." : "Use My Location"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="latitude" className="text-xs text-muted-foreground">Latitude</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      value={form.latitude ?? ""}
                      onChange={(e) => setForm({ ...form, latitude: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="e.g. 34.052235"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="longitude" className="text-xs text-muted-foreground">Longitude</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="any"
                      value={form.longitude ?? ""}
                      onChange={(e) => setForm({ ...form, longitude: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="e.g. -118.243683"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use your location or type the point. Save keeps these values. Address lookup only runs when you ask.
                </p>
                {saveError && <p className="text-sm text-destructive">{saveError}</p>}
                {form.latitude && form.longitude && (
                  <div className="p-2.5 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg text-sm">
                    <p className="font-medium flex items-center gap-1 text-green-700 dark:text-green-400">
                      <MapPin className="w-3.5 h-3.5" />
                      Coordinates Set
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-500 font-mono mt-0.5">
                      {form.latitude.toFixed(7)}, {form.longitude.toFixed(7)}
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isGeocoding || isSaving || Boolean(radiusError)}>
                  {(isGeocoding || isSaving) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingLocation ? "Save Changes" : "Add Location"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Building2 className="w-5 h-5" />
            All Locations
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">{locations.length} registered locations</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : locations.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No locations found</p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="space-y-3 md:hidden">
                {locations.map((location) => (
                  <div key={location.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{location.name}</p>
                        {location.address && <p className="text-xs text-muted-foreground">{location.address}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>TZ: {location.timezone}</span>
                      <span>
                        Radius:{" "}
                        {location.auto_signin_radius_meters === 0 || location.geofence_enabled === false
                          ? "Off"
                          : location.auto_signin_radius_meters != null
                            ? formatRadiusMeters(location.auto_signin_radius_meters)
                            : "default 500 m"}
                      </span>
                      <span>Auto SO Time (minutes): {location.auto_signout_minutes || "-"}</span>
                      <span>End of day: {endOfDayOverrideLabel(location)}</span>
                      {location.latitude && location.longitude ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {location.latitude.toFixed(7)}, {location.longitude.toFixed(7)}
                        </span>
                      ) : (
                        <span>No coords</span>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(location)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(location.id)}>
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
                      <TableHead>Address</TableHead>
                      <TableHead>Coordinates</TableHead>
                      <TableHead>Timezone</TableHead>
                      <TableHead>On-site radius</TableHead>
                      <TableHead>Auto Sign-Out Time (minutes)</TableHead>
                      <TableHead>End of day</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations.map((location) => (
                      <TableRow key={location.id}>
                        <TableCell className="font-medium">{location.name}</TableCell>
                        <TableCell>{location.address || "-"}</TableCell>
                        <TableCell>
                          {location.latitude && location.longitude ? (
                            <span className="text-xs font-mono text-green-600 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {location.latitude.toFixed(7)}, {location.longitude.toFixed(7)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not set</span>
                          )}
                        </TableCell>
                        <TableCell>{location.timezone}</TableCell>
                        <TableCell>
                          {location.auto_signin_radius_meters === 0 || location.geofence_enabled === false
                            ? "Off"
                            : location.auto_signin_radius_meters != null
                              ? formatRadiusMeters(location.auto_signin_radius_meters)
                              : "500 m"}
                        </TableCell>
                        <TableCell>{location.auto_signout_minutes || "-"}</TableCell>
                        <TableCell>{endOfDayOverrideLabel(location)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(location)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(location.id)}>
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
    </div>
  )
}
