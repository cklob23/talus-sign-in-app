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
import { Plus, Calendar, CheckCircle, XCircle, Trash2 } from "lucide-react"
import type { Booking, Host, VisitorType } from "@/types/database"

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [visitorTypes, setVisitorTypes] = useState<VisitorType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    hostId: "",
    visitorTypeId: "",
    expectedArrival: "",
    purpose: "",
  })

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()

    const [{ data: bookingsData }, { data: hostsData }, { data: typesData }] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          `
          *,
          host:hosts(*),
          visitor_type:visitor_types(*)
        `,
        )
        .order("expected_arrival", { ascending: true }),
      supabase.from("hosts").select("*").eq("is_active", true).order("name"),
      supabase.from("visitor_types").select("*").order("name"),
    ])

    if (bookingsData) setBookings(bookingsData as Booking[])
    if (hostsData) setHosts(hostsData)
    if (typesData) setVisitorTypes(typesData)
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleCreateBooking(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    // Get location
    const { data: locations } = await supabase.from("locations").select("id").limit(1)
    if (!locations || locations.length === 0) return

    await supabase.from("bookings").insert({
      visitor_first_name: form.firstName,
      visitor_last_name: form.lastName,
      visitor_email: form.email || null,
      visitor_company: form.company || null,
      host_id: form.hostId || null,
      visitor_type_id: form.visitorTypeId || null,
      expected_arrival: new Date(form.expectedArrival).toISOString(),
      purpose: form.purpose || null,
      location_id: locations[0].id,
    })

    setForm({
      firstName: "",
      lastName: "",
      email: "",
      company: "",
      hostId: "",
      visitorTypeId: "",
      expectedArrival: "",
      purpose: "",
    })
    setIsDialogOpen(false)
    loadData()
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
                  <Label htmlFor="host">Host</Label>
                  <Select value={form.hostId} onValueChange={(value) => setForm({ ...form, hostId: value })}>
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
                  <Label htmlFor="arrival">Expected Arrival</Label>
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
                      <span>Host: {booking.host?.name || "-"}</span>
                      <span>
                        {new Date(booking.expected_arrival).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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
                          {new Date(booking.expected_arrival).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
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
