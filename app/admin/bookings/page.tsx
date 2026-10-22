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
import { Plus, Calendar, CheckCircle, XCircle, Trash2, Send, Mail } from "lucide-react"
import type { Booking, Host, VisitorType, Location } from "@/types/database"
import { formatDateTime } from "@/lib/timezone"
import { DEFAULT_INVITE_LEAD_MINUTES, inviteCooldownActive } from "@/lib/booking-invite"
import { useTimezone } from "@/contexts/timezone-context"
import { logAudit } from "@/lib/audit-log"
import { AdminLoadError } from "@/components/admin/load-error"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [visitorTypes, setVisitorTypes] = useState<VisitorType[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null)
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null)
  const [isAdhocOpen, setIsAdhocOpen] = useState(false)
  const [adhocSending, setAdhocSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const { timezone: userTimezone } = useTimezone()
  const emptyForm = {
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    hostId: "",
    visitorTypeId: "",
    locationId: "",
    expectedArrival: "",
    purpose: "",
    preferredLanguage: "en" as "en" | "es",
    inviteMode: "scheduled" as "now" | "scheduled" | "manual",
    inviteLeadPreset: String(DEFAULT_INVITE_LEAD_MINUTES),
    customLeadHours: "48",
  }
  const [form, setForm] = useState(emptyForm)

  async function loadData() {
    setIsLoading(true)
    setLoadError(null)
    const supabase = createClient()

    const [{ data: bookingsData, error: bookingsErr }, { data: hostsData }, { data: typesData }, { data: locationsData }] = await Promise.all([
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

    if (bookingsErr) {
      setLoadError(bookingsErr.message || "Could not load bookings.")
      setIsLoading(false)
      return
    }

    if (bookingsData) setBookings(bookingsData as Booking[])
    if (hostsData) setHosts(hostsData)
    if (typesData) setVisitorTypes(typesData)
    if (locationsData) {
      setLocations(locationsData)
      if (!form.locationId && locationsData.length > 0) {
        setForm(prev => ({ ...prev, locationId: locationsData[0].id }))
      }
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  function inviteLeadMinutes(): number {
    if (form.inviteLeadPreset === "custom") {
      const hours = Number(form.customLeadHours)
      if (!Number.isFinite(hours) || hours < 1) return DEFAULT_INVITE_LEAD_MINUTES
      return Math.round(hours * 60)
    }
    const preset = Number(form.inviteLeadPreset)
    return Number.isFinite(preset) && preset > 0 ? preset : DEFAULT_INVITE_LEAD_MINUTES
  }

  async function handleCreateBooking(e: React.FormEvent) {
    e.preventDefault()

    if (!form.hostId) {
      alert("Please select a host for the booking")
      return
    }

    if (!form.locationId) {
      alert("Please select a location for the booking")
      return
    }

    if (!form.email.trim()) {
      alert("Visitor email is required")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          company: form.company || null,
          hostId: form.hostId,
          visitorTypeId: form.visitorTypeId || null,
          expectedArrival: form.expectedArrival,
          purpose: form.purpose || null,
          locationId: form.locationId,
          preferredLanguage: form.preferredLanguage,
          inviteMode: form.inviteMode,
          inviteLeadMinutes: inviteLeadMinutes(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not create the booking.")

      setForm({
        ...emptyForm,
        locationId: locations.length > 0 ? locations[0].id : "",
      })
      setIsDialogOpen(false)
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not create the booking.")
    } finally {
      setSaving(false)
    }
  }

  async function sendTrainingLink(bookingId: string) {
    setSendingLinkId(bookingId)
    try {
      const res = await fetch("/api/admin/training-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not send the training link.")
      alert(json.sent ? "Training link sent." : "Link created. Email was not sent (check SMTP).")
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not send the training link.")
    } finally {
      setSendingLinkId(null)
    }
  }

  async function sendAdhocTrainingLink() {
    setAdhocSending(true)
    try {
      const res = await fetch("/api/admin/training-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          company: form.company,
          visitorTypeId: form.visitorTypeId,
          locationId: form.locationId,
          hostId: form.hostId || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not send the training link.")
      alert(json.sent ? "Training link sent." : "Link created. Email was not sent (check SMTP).")
      setIsAdhocOpen(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not send the training link.")
    } finally {
      setAdhocSending(false)
    }
  }

  async function sendBookingInvite(bookingId: string) {
    setSendingInviteId(bookingId)
    try {
      const res = await fetch("/api/admin/bookings/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not send the invite.")
      alert(json.sent ? "Invite sent." : json.reason === "smtp_not_configured" ? "Invite was not sent (check SMTP)." : "Invite failed.")
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not send the invite.")
    } finally {
      setSendingInviteId(null)
    }
  }

  async function updateBookingStatus(id: string, status: "completed" | "cancelled") {
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not update the booking.")
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update the booking.")
    }
  }

  async function deleteSelectedBookings() {
    if (selectedIds.size === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} booking(s)? This action cannot be undone.`)) return
    
    const supabase = createClient()
    const idsToDelete = Array.from(selectedIds)
    await supabase.from("bookings").delete().in("id", idsToDelete)
    
    // Log each deletion
    for (const id of idsToDelete) {
      await logAudit({
        action: "booking.cancelled",
        entityType: "booking",
        entityId: id,
        description: `Booking deleted`,
      })
    }
    
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

  function locationTimezone(booking: Booking): string {
    return (booking as Booking & { location?: Location }).location?.timezone || userTimezone
  }

  function getInviteBadge(booking: Booking) {
    const status = booking.invite_status
    if (status === "scheduled" && booking.invite_send_at) {
      return <Badge variant="outline">Scheduled for {formatDateTime(booking.invite_send_at, locationTimezone(booking))}</Badge>
    }
    if (status === "sent") return <Badge className="bg-primary">Sent</Badge>
    if (status === "failed") return <Badge variant="destructive">Failed</Badge>
    if (status === "sending") return <Badge variant="outline">Sending</Badge>
    return null
  }

  function inviteButtonLabel(booking: Booking): string {
    return booking.invite_count && booking.invite_count > 0 || booking.invite_status === "sent" ? "Resend invite" : "Send invite now"
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
          <Dialog open={isAdhocOpen} onOpenChange={setIsAdhocOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="w-fit">
                <Send className="w-4 h-4 mr-2" />
                Send training link
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Send a training link</DialogTitle>
                <DialogDescription>Email a visitor so they can watch the safety video before they arrive.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                  <Input placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
                <Input type="email" placeholder="Visitor email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                <Select value={form.visitorTypeId} onValueChange={(value) => setForm({ ...form, visitorTypeId: value })}>
                  <SelectTrigger><SelectValue placeholder="Visitor type" /></SelectTrigger>
                  <SelectContent>
                    {visitorTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={form.locationId} onValueChange={(value) => setForm({ ...form, locationId: value })}>
                  <SelectTrigger><SelectValue placeholder="Site" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={form.hostId} onValueChange={(value) => setForm({ ...form, hostId: value })}>
                  <SelectTrigger><SelectValue placeholder="Host (optional)" /></SelectTrigger>
                  <SelectContent>
                    {hosts.map((host) => (
                      <SelectItem key={host.id} value={host.id}>{host.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button onClick={() => void sendAdhocTrainingLink()} disabled={adhocSending}>
                  {adhocSending ? "Sending..." : "Send link"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preferredLanguage">Invite language</Label>
                  <Select
                    value={form.preferredLanguage}
                    onValueChange={(value) => setForm({ ...form, preferredLanguage: value === "es" ? "es" : "en" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
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
                <div className="space-y-3 rounded-lg border p-3">
                  <Label>Send invite</Label>
                  <RadioGroup
                    value={form.inviteMode}
                    onValueChange={(value) =>
                      setForm({ ...form, inviteMode: value === "now" || value === "manual" ? value : "scheduled" })
                    }
                    className="gap-2"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="now" id="invite-now" />
                      Now on save
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="scheduled" id="invite-scheduled" />
                      Scheduled
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="manual" id="invite-manual" />
                      Don't send automatically
                    </label>
                  </RadioGroup>
                  {form.inviteMode === "scheduled" && (
                    <div className="space-y-2 pl-6">
                      <Label htmlFor="lead">Lead time</Label>
                      <Select
                        value={form.inviteLeadPreset}
                        onValueChange={(value) => setForm({ ...form, inviteLeadPreset: value })}
                      >
                        <SelectTrigger id="lead">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1440">1 day before</SelectItem>
                          <SelectItem value="2880">2 days before</SelectItem>
                          <SelectItem value="4320">3 days before</SelectItem>
                          <SelectItem value="10080">7 days before</SelectItem>
                          <SelectItem value="custom">Custom hours before</SelectItem>
                        </SelectContent>
                      </Select>
                      {form.inviteLeadPreset === "custom" && (
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          value={form.customLeadHours}
                          onChange={(e) => setForm({ ...form, customLeadHours: e.target.value })}
                          aria-label="Hours before arrival"
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        If that time has already passed, the invite is sent now.
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Create Booking"}</Button>
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
          ) : loadError ? (
            <AdminLoadError title="Could not load bookings" detail={loadError} onRetry={loadData} />
          ) : bookings.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No bookings found</p>
              <p className="mt-1 text-sm text-muted-foreground">Create a booking to pre-register a visitor.</p>
            </div>
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
                        <div className="mt-1">{getInviteBadge(booking)}</div>
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
                        {booking.visitor_email && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={sendingInviteId === booking.id || inviteCooldownActive(booking.invite_sent_at)}
                            onClick={() => void sendBookingInvite(booking.id)}
                          >
                            <Mail className="w-4 h-4 mr-1" />
                            {inviteButtonLabel(booking)}
                          </Button>
                        )}
                        {booking.visitor_email && booking.visitor_type?.requires_training && (
                          <Button variant="outline" size="sm" disabled={sendingLinkId === booking.id} onClick={() => void sendTrainingLink(booking.id)}>
                            <Send className="w-4 h-4 mr-1" />
                            Training
                          </Button>
                        )}
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
                      <TableHead>Invite</TableHead>
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
                        <TableCell>{getInviteBadge(booking)}</TableCell>
                        <TableCell className="text-right">
                          {booking.status === "pending" && (
                            <div className="flex justify-end gap-2">
                              {booking.visitor_email && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={sendingInviteId === booking.id || inviteCooldownActive(booking.invite_sent_at)}
                                  onClick={() => void sendBookingInvite(booking.id)}
                                >
                                  <Mail className="w-4 h-4 mr-1" />
                                  {inviteButtonLabel(booking)}
                                </Button>
                              )}
                              {booking.visitor_email && booking.visitor_type?.requires_training && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={sendingLinkId === booking.id}
                                  onClick={() => void sendTrainingLink(booking.id)}
                                >
                                  <Send className="w-4 h-4" />
                                </Button>
                              )}
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
