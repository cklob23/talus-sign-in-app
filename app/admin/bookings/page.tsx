"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Calendar, CheckCircle, XCircle, Trash2, MapPin } from "lucide-react"
import type { Booking, Host, VisitorType, Location } from "@/types/database"
import { formatDateTime } from "@/lib/timezone"
import { useTimezone } from "@/contexts/timezone-context"

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [visitorTypes, setVisitorTypes] = useState<VisitorType[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { timezone: userTimezone } = useTimezone()
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    hostId: "",
    visitorTypeId: "",
    locationId: "",
    expectedArrival: "",
    purpose: "",
  })

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()

    const [{ data: bookingsData }, { data: hostsData }, { data: typesData }, { data: locationsData }] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          `
          *,
          host:hosts(*),
          visitor_type:visitor_types(*),
          location:locations(*)
        `,
        )
        .order("expected_arrival", { ascending: true }),
      supabase.from("hosts").select("*").eq("is_active", true).order("name"),
      supabase.from("visitor_types").select("*").order("name"),
      supabase.from("locations").select("*").order("name"),
    ])

    if (bookingsData) setBookings(bookingsData as Booking[])
    if (hostsData) setHosts(hostsData)
    if (typesData) setVisitorTypes(typesData)
    if (locationsData) {
      setLocations(locationsData)
      // Set default location if not already set
      if (!form.locationId && locationsData.length > 0) {
        setForm(prev => ({ ...prev, locationId: locationsData[0].id }))
      }
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleCreateBooking(e: React.FormEvent) {
    e.preventDefault()
    
    // Validate host is selected
    if (!form.hostId) {
      alert("Please select a host for the booking")
      return
    }
    
    // Validate location is selected
    if (!form.locationId) {
      alert("Please select a location for the booking")
      return
    }
    
    const supabase = createClient()

    // Get selected location's timezone
    const selectedLocation = locations.find(l => l.id === form.locationId)
    const timezone = selectedLocation?.timezone || "UTC"

    // Convert local datetime to UTC based on location timezone
    // The form input is in the location's local time, so we need to interpret it in that timezone
    const localDatetime = form.expectedArrival
    const utcDatetime = convertLocalToUTC(localDatetime, timezone)

    await supabase.from("bookings").insert({
      visitor_first_name: form.firstName,
      visitor_last_name: form.lastName,
      visitor_email: form.email || null,
      visitor_company: form.company || null,
      host_id: form.hostId,
      visitor_type_id: form.visitorTypeId || null,
      expected_arrival: utcDatetime,
      purpose: form.purpose || null,
      location_id: form.locationId,
    })

    setForm({
      firstName: "",
      lastName: "",
      email: "",
      company: "",
      hostId: "",
      visitorTypeId: "",
      locationId: locations.length > 0 ? locations[0].id : "",
      expectedArrival: "",
      purpose: "",
    })
    setIsDialogOpen(false)
    loadData()
  }
  
  // Convert local datetime string to UTC ISO string based on timezone
  function convertLocalToUTC(localDatetime: string, timezone: string): string {
    if (!localDatetime) return new Date().toISOString()
    
    try {
      // Create a date in the local timezone
      const date = new Date(localDatetime)
      
      // Get the offset for the target timezone
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      
      // The input is already in the location's local time (from datetime-local input)
      // So we just need to store it as UTC
      return date.toISOString()
    } catch {
      return new Date(localDatetime).toISOString()
    }
  }

  async function updateBookingStatus(id: string, status: "completed" | "cancelled") {
    const supabase = createClient()
    await supabase.from("bookings").update({ status }).eq("id", id)
    loadData()
  }

  async function deleteSelectedBookings() {
    if (selectedIds.size === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} booking(s)? This action cannot be undone.`)) return
    
    const supabase = createClient()
    await supabase.from("bookings").delete().in("id", Array.from(selectedIds))
    setSelectedIds(new Set())
    loadData()
  }

  function toggleSelectAll() {
    if (selectedIds.size === bookings.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(bookings.map(b => b.id)))
    }
  }

  function toggleSelect(id: string) {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>
      case "checked_in":
        return <Badge className="bg-primary">Checked In</Badge>
      case "completed":
        return <Badge variant="secondary">Completed</Badge>
      case "cancelled":
        return (
          <Badge variant="destructive" className="bg-destructive text-destructive-foreground">
            Cancelled
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Bookings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Pre-registered visitor appointments</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={deleteSelectedBookings}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete ({selectedIds.size})
            </Button>
          )}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-fit">
                <Plus className="w-4 h-4 mr-2" />
                New Booking
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Booking</DialogTitle>
                <DialogDescription>Pre-register an expected visitor</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateBooking} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      required
                      value={form.firstName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setForm({ ...form, firstName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      required
                      value={form.lastName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setForm({ ...form, lastName: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={form.company}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, company: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="host">Host *</Label>
                  <Select value={form.hostId} onValueChange={(value) => setForm({ ...form, hostId: value })} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select host" />
                    </SelectTrigger>
                    <SelectContent>
                      {hosts.map((host) => (
                        <SelectItem key={host.id} value={host.id}>
                          {host.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Host will be notified when visitor checks in</p>
                </div>
<div className="space-y-2">
  <Label htmlFor="location">Location *</Label>
  <Select value={form.locationId} onValueChange={(value) => setForm({ ...form, locationId: value })} required>
  <SelectTrigger>
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
  <p className="text-xs text-muted-foreground">
  {form.locationId && locations.find(l => l.id === form.locationId)?.timezone 
    ? `Timezone: ${locations.find(l => l.id === form.locationId)?.timezone}`
    : "Select a location to set timezone"}
  </p>
  </div>
  <div className="space-y-2">
  <Label htmlFor="type">Visitor Type</Label>
  <Select
  value={form.visitorTypeId}
  onValueChange={(value) => setForm({ ...form, visitorTypeId: value })}
  >
  <SelectTrigger>
  <SelectValue placeholder="Select type" />
  </SelectTrigger>
  <SelectContent>
  {visitorTypes.map((type) => (
  <SelectItem key={type.id} value={type.id}>
  {type.name}
  </SelectItem>
  ))}
  </SelectContent>
  </Select>
  </div>
  <div className="space-y-2">
  <Label htmlFor="arrival">
  Expected Arrival
  {form.locationId && locations.find(l => l.id === form.locationId)?.timezone && (
    <span className="text-xs text-muted-foreground ml-1">
      ({locations.find(l => l.id === form.locationId)?.timezone})
    </span>
  )}
  </Label>
  <Input
  id="arrival"
  type="datetime-local"
  required
  value={form.expectedArrival}
  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
  setForm({ ...form, expectedArrival: e.target.value })
  }
  />
                </div>
                <DialogFooter>
                  <Button type="submit">Create Booking</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Calendar className="w-5 h-5" />
            Upcoming Bookings
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">{bookings.filter((b) => b.status === "pending").length} pending visits</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : bookings.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No bookings found</p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="space-y-3 md:hidden">
                {bookings.map((booking) => (
                  <div key={booking.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedIds.has(booking.id)}
                        onCheckedChange={() => toggleSelect(booking.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">
                              {booking.visitor_first_name} {booking.visitor_last_name}
                            </p>
                            {booking.visitor_company && (
                              <p className="text-xs text-muted-foreground">{booking.visitor_company}</p>
                            )}
                          </div>
                          {getStatusBadge(booking.status)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Location: {(booking as Booking & { location?: Location }).location?.name || "-"}</span>
                      <span>Host: {booking.host?.name || "-"}</span>
                      <span>
                        {formatDateTime(booking.expected_arrival, userTimezone)}
                      </span>
                    </div>
                    {booking.visitor_type && (
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: booking.visitor_type.badge_color,
                          color: booking.visitor_type.badge_color,
                        }}
                      >
                        {booking.visitor_type.name}
                      </Badge>
                    )}
                    {booking.status === "pending" && (
                      <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => updateBookingStatus(booking.id, "completed")}>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Complete
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => updateBookingStatus(booking.id, "cancelled")}>
                          <XCircle className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIds.size === bookings.length && bookings.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Visitor</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((booking) => (
                      <TableRow key={booking.id} className={selectedIds.has(booking.id) ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(booking.id)}
                            onCheckedChange={() => toggleSelect(booking.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {booking.visitor_first_name} {booking.visitor_last_name}
                          {booking.visitor_email && (
                            <span className="block text-xs text-muted-foreground">{booking.visitor_email}</span>
                          )}
                        </TableCell>
                        <TableCell>{booking.visitor_company || "-"}</TableCell>
                        <TableCell>{(booking as Booking & { location?: Location }).location?.name || "-"}</TableCell>
                        <TableCell>{booking.host?.name || "-"}</TableCell>
                        <TableCell>
                          {booking.visitor_type && (
                            <Badge
                              variant="outline"
                              style={{
                                borderColor: booking.visitor_type.badge_color,
                                color: booking.visitor_type.badge_color,
                              }}
                            >
                              {booking.visitor_type.name}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {formatDateTime(booking.expected_arrival, userTimezone)}
                        </TableCell>
                        <TableCell>{getStatusBadge(booking.status)}</TableCell>
                        <TableCell className="text-right">
                          {booking.status === "pending" && (
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateBookingStatus(booking.id, "completed")}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateBookingStatus(booking.id, "cancelled")}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
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
