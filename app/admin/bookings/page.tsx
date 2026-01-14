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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Calendar, CheckCircle, XCircle } from "lucide-react"
import type { Booking, Host, VisitorType } from "@/types/database"

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [visitorTypes, setVisitorTypes] = useState<VisitorType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bookings</h1>
          <p className="text-muted-foreground">Pre-registered visitor appointments</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Booking
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Upcoming Bookings
          </CardTitle>
          <CardDescription>{bookings.filter((b) => b.status === "pending").length} pending visits</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : bookings.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No bookings found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                  <TableRow key={booking.id}>
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
