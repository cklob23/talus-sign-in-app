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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { Plus, Pencil, Trash2, UserCog } from "lucide-react"
import type { Host, Location, Profile } from "@/types/database"

export default function HostsPage() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingHost, setEditingHost] = useState<Host | null>(null)
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    locationId: "",
    isActive: true,
    profileId: "",
  })

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()

    const [{ data: hostsData }, { data: locationsData }, { data: profilesData }] = await Promise.all([
      supabase.from("hosts").select("*, profile:profiles(id, full_name, email, phone, department, avatar_url, role, location_id, created_at, updated_at)").order("name"),
      supabase.from("locations").select("*").order("name"),
      supabase.from("profiles").select("id, full_name, email, phone, department, avatar_url, role, location_id, created_at, updated_at").order("full_name"),
    ])

    if (hostsData) setHosts(hostsData)
    if (locationsData) {
      setLocations(locationsData)
      if (locationsData.length > 0 && !form.locationId) {
        setForm((f) => ({ ...f, locationId: locationsData[0].id }))
      }
    }
    if (profilesData) setProfiles(profilesData)
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  function openCreateDialog() {
    setEditingHost(null)
    setForm({
      name: "",
      email: "",
      phone: "",
      department: "",
      locationId: locations[0]?.id || "",
      isActive: true,
      profileId: "",
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(host: Host) {
    setEditingHost(host)
    // Use profile data if linked, otherwise use host's own data
    const linkedProfile = host.profile
    setForm({
      name: linkedProfile?.full_name || host.name,
      email: linkedProfile?.email || host.email || "",
      phone: linkedProfile?.phone || host.phone || "",
      department: linkedProfile?.department || host.department || "",
      locationId: host.location_id,
      isActive: host.is_active,
      profileId: host.profile_id || "",
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    // Get linked profile data if selected
    const linkedProfile = form.profileId ? profiles.find(p => p.id === form.profileId) : null

    const data = {
      name: linkedProfile?.full_name || form.name,
      email: linkedProfile?.email || form.email || null,
      phone: linkedProfile?.phone || form.phone || null,
      department: linkedProfile?.department || form.department || null,
      location_id: form.locationId,
      is_active: form.isActive,
      profile_id: form.profileId || null,
      avatar_url: linkedProfile?.avatar_url || null,
    }

    if (editingHost) {
      await supabase.from("hosts").update(data).eq("id", editingHost.id)
    } else {
      await supabase.from("hosts").insert(data)
    }

    setIsDialogOpen(false)
    loadData()
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this host?")) return
    const supabase = createClient()
    await supabase.from("hosts").delete().eq("id", id)
    loadData()
  }

  async function toggleActive(host: Host) {
    const supabase = createClient()
    await supabase.from("hosts").update({ is_active: !host.is_active }).eq("id", host.id)
    loadData()
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Hosts</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage employees who can receive visitors</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} size="sm" className="w-fit">
              <Plus className="w-4 h-4 mr-2" />
              Add Host
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg">{editingHost ? "Edit Host" : "Add Host"}</DialogTitle>
              <DialogDescription className="text-sm">
                {editingHost ? "Update host information" : "Add a new employee who can receive visitors"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile">Link to User Profile (Optional)</Label>
                <Select 
                  value={form.profileId} 
                  onValueChange={(value) => {
                    const selectedProfile = profiles.find(p => p.id === value)
                    if (selectedProfile) {
                      setForm({ 
                        ...form, 
                        profileId: value,
                        name: selectedProfile.full_name || form.name,
                        email: selectedProfile.email || form.email,
                        phone: selectedProfile.phone || form.phone,
                        department: selectedProfile.department || form.department,
                      })
                    } else {
                      setForm({ ...form, profileId: value })
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user profile..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Manual Entry)</SelectItem>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email} {profile.department ? `(${profile.department})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Link to an existing user to sync their profile info
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={!!form.profileId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={!!form.profileId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input 
                  id="phone" 
                  value={form.phone} 
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} 
                  disabled={!!form.profileId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  disabled={!!form.profileId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Select value={form.locationId} onValueChange={(value) => setForm({ ...form, locationId: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit">{editingHost ? "Save Changes" : "Add Host"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <UserCog className="w-5 h-5" />
            All Hosts
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">{hosts.length} registered hosts</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : hosts.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No hosts found</p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="space-y-3 md:hidden">
                {hosts.map((host) => {
                  const displayName = host.profile?.full_name || host.name
                  const displayEmail = host.profile?.email || host.email
                  const displayPhone = host.profile?.phone || host.phone
                  const displayDept = host.profile?.department || host.department
                  const displayAvatar = host.profile?.avatar_url || host.avatar_url
                  
                  return (
                  <div key={host.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={displayAvatar || undefined} />
                          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{displayName}</p>
                          {displayEmail && <p className="text-xs text-muted-foreground">{displayEmail}</p>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant={host.is_active ? "default" : "secondary"}
                          className="cursor-pointer text-xs"
                          onClick={() => toggleActive(host)}
                        >
                          {host.is_active ? "Active" : "Inactive"}
                        </Badge>
                        {host.profile_id && (
                          <Badge variant="outline" className="text-xs">Linked</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Location: {locations.find(l => l.id === host.location_id)?.name || "-"}</span>
                      {displayPhone && <span>Phone: {displayPhone}</span>}
                      {displayDept && <span>Dept: {displayDept}</span>}
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(host)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(host.id)}>
                        <Trash2 className="w-4 h-4 mr-1 text-destructive" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )})}
              </div>
              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hosts.map((host) => {
                      const displayName = host.profile?.full_name || host.name
                      const displayEmail = host.profile?.email || host.email
                      const displayPhone = host.profile?.phone || host.phone
                      const displayDept = host.profile?.department || host.department
                      const displayAvatar = host.profile?.avatar_url || host.avatar_url
                      
                      return (
                      <TableRow key={host.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={displayAvatar || undefined} />
                              <AvatarFallback className="text-xs">{getInitials(displayName)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="font-medium">{displayName}</span>
                              {host.profile_id && (
                                <Badge variant="outline" className="ml-2 text-xs">Linked</Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{displayEmail || "-"}</TableCell>
                        <TableCell>{locations.find(l => l.id === host.location_id)?.name || "-"}</TableCell>
                        <TableCell>{displayPhone || "-"}</TableCell>
                        <TableCell>{displayDept || "-"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={host.is_active ? "default" : "secondary"}
                            className="cursor-pointer"
                            onClick={() => toggleActive(host)}
                          >
                            {host.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(host)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(host.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )})}
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
