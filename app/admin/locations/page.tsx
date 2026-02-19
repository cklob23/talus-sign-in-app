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
import { Plus, Pencil, Trash2, Building2, MapPin, Loader2, Crosshair } from "lucide-react"
import type { Location } from "@/types/database"
import { logAudit } from "@/lib/audit-log"

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
    timezone: "America/New_York",
    latitude: null as number | null,
    longitude: null as number | null,
    auto_signin_radius_meters: 500,
  })

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

  // Geocode address using Google Maps Geocoding API (via server-side route)
  async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!address.trim()) return null

    setIsGeocoding(true)
    try {
      const response = await fetch(
        `/api/geocode?address=${encodeURIComponent(address)}`
      )
      const data = await response.json()

      if (response.ok && data.lat != null && data.lng != null) {
        return { lat: data.lat, lng: data.lng }
      }
      console.error("Geocoding failed:", data.error)
      return null
    } catch (error) {
      console.error("Geocoding error:", error)
      return null
    } finally {
      setIsGeocoding(false)
    }
  }

  function openCreateDialog() {
    setEditingLocation(null)
    setForm({
      name: "",
      address: "",
      timezone: "America/New_York",
      latitude: null,
      longitude: null,
      auto_signin_radius_meters: 500,
    })
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
      auto_signin_radius_meters: location.auto_signin_radius_meters || 500,
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    // Try to geocode if address changed and no coords set
    let latitude = form.latitude
    let longitude = form.longitude

    if (form.address && (
      !editingLocation ||
      editingLocation.address !== form.address ||
      !latitude || !longitude
    )) {
      const coords = await geocodeAddress(form.address)
      if (coords) {
        latitude = coords.lat
        longitude = coords.lng
      }
    }

    const data = {
      name: form.name,
      address: form.address || null,
      timezone: form.timezone,
      latitude,
      longitude,
      auto_signin_radius_meters: form.auto_signin_radius_meters,
    }

    if (editingLocation) {
      await supabase.from("locations").update(data).eq("id", editingLocation.id)
      await logAudit({
        action: "location.updated",
        entityType: "location",
        entityId: editingLocation.id,
        description: `Location updated: ${data.name}`,
        metadata: { name: data.name, address: data.address }
      })
    } else {
      const { data: newLocation } = await supabase.from("locations").insert(data).select().single()
      await logAudit({
        action: "location.created",
        entityType: "location",
        entityId: newLocation?.id,
        description: `Location created: ${data.name}`,
        metadata: { name: data.name, address: data.address }
      })
    }

    setIsDialogOpen(false)
    loadData()
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this location? This will affect all associated data.")) return
    const supabase = createClient()
    const locationToDelete = locations.find(l => l.id === id)
    await supabase.from("locations").delete().eq("id", id)
    await logAudit({
      action: "location.deleted",
      entityType: "location",
      entityId: id,
      description: `Location deleted: ${locationToDelete?.name || id}`,
    })
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
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main Street, City, State"
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Coordinates will be auto-detected from address
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  placeholder="America/New_York"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="radius">Auto Sign-In Radius (meters)</Label>
                <Input
                  id="radius"
                  type="number"
                  value={form.auto_signin_radius_meters}
                  onChange={(e) => setForm({ ...form, auto_signin_radius_meters: parseInt(e.target.value) || 500 })}
                  placeholder="500"
                />
                <p className="text-xs text-muted-foreground">
                  Employees within this distance can auto sign-in
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
                  Auto-filled from address, or use GPS/manual entry for best precision.
                </p>
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
                <Button type="submit" disabled={isGeocoding}>
                  {isGeocoding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
