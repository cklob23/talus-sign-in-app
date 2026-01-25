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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, UsersRound, RefreshCw, Cloud, Loader2 } from "lucide-react"
import type { Location } from "@/types/database"

interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  avatar_url: string | null
  location_id: string | null
  created_at: string
  updated_at: string
}

const ROLES = [
  { value: "admin", label: "Admin", color: "bg-purple-500" },
  { value: "staff", label: "Staff", color: "bg-blue-500" },
  { value: "employee", label: "Employee", color: "bg-green-500" },
]

export default function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    role: "employee",
    locationId: "",
    avatarUrl: "",
  })

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()

    const [{ data: profilesData }, { data: locationsData }] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("locations").select("*").order("name"),
    ])

    if (profilesData) setProfiles(profilesData)
    if (locationsData) {
      setLocations(locationsData)
      if (locationsData.length > 0 && !form.locationId) {
        setForm((f) => ({ ...f, locationId: locationsData[0].id }))
      }
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  function openCreateDialog() {
    setEditingProfile(null)
    setForm({
      email: "",
      fullName: "",
      role: "employee",
      locationId: locations[0]?.id || "",
      avatarUrl: "",
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(profile: Profile) {
    setEditingProfile(profile)
    setForm({
      email: profile.email || "",
      fullName: profile.full_name || "",
      role: profile.role || "employee",
      locationId: profile.location_id || locations[0]?.id || "",
      avatarUrl: profile.avatar_url || "",
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    const data = {
      email: form.email || null,
      full_name: form.fullName || null,
      role: form.role,
      location_id: form.locationId || null,
      avatar_url: form.avatarUrl || null,
    }

    if (editingProfile) {
      await supabase.from("profiles").update(data).eq("id", editingProfile.id)
    } else {
      // For new profiles, we need to create them via auth or just insert if they already exist
      // This creates a profile entry - the user would need to sign up separately via Microsoft OAuth
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", form.email)
        .single()

      if (existingProfile) {
        await supabase.from("profiles").update(data).eq("id", existingProfile.id)
      } else {
        // Create a placeholder profile - will be linked when user signs in with Microsoft
        await supabase.from("profiles").insert({
          ...data,
          id: crypto.randomUUID(),
        })
      }
    }

    setIsDialogOpen(false)
    loadData()
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this user profile? This action cannot be undone.")) return
    const supabase = createClient()
    await supabase.from("profiles").delete().eq("id", id)
    loadData()
  }

  async function handleSyncFromAzure() {
    setIsSyncing(true)
    setSyncMessage(null)

    try {
      const response = await fetch("/api/admin/sync-azure-users", {
        method: "POST",
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to sync users")
      }

      setSyncMessage({
        type: "success",
        text: `Successfully synced ${result.synced} users from Azure AD`,
      })
      loadData()
    } catch (error) {
      setSyncMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to sync users from Azure AD",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  function getRoleBadge(role: string | null) {
    const roleConfig = ROLES.find((r) => r.value === role) || { label: role || "Unknown", color: "bg-gray-500" }
    return (
      <Badge className={`${roleConfig.color} text-white`}>
        {roleConfig.label}
      </Badge>
    )
  }

  function getInitials(name: string | null, email: string | null) {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return "?"
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">User Management</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage admin, staff, and employee profiles
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncFromAzure}
            disabled={isSyncing}
            className="w-fit bg-transparent"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Cloud className="w-4 h-4 mr-2" />
            )}
            Sync from Azure AD
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} size="sm" className="w-fit">
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg">
                  {editingProfile ? "Edit User" : "Add User"}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {editingProfile
                    ? "Update user profile information"
                    : "Add a new user profile. They can sign in with Microsoft to access the system."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={!!editingProfile}
                  />
                  {!editingProfile && (
                    <p className="text-xs text-muted-foreground">
                      Use their Microsoft/Azure AD email address
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Select
                    value={form.locationId}
                    onValueChange={(value) => setForm({ ...form, locationId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a location" />
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
                <div className="space-y-2">
                  <Label htmlFor="avatarUrl">Avatar URL</Label>
                  <Input
                    id="avatarUrl"
                    type="url"
                    value={form.avatarUrl}
                    onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                    placeholder="https://..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Will be auto-populated when syncing from Azure AD
                  </p>
                </div>
                {form.avatarUrl && (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={form.avatarUrl || "/placeholder.svg"} />
                      <AvatarFallback>{getInitials(form.fullName, form.email)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-muted-foreground">Avatar preview</span>
                  </div>
                )}
                <DialogFooter>
                  <Button type="submit">{editingProfile ? "Save Changes" : "Add User"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {syncMessage && (
        <div
          className={`p-4 rounded-lg ${
            syncMessage.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {syncMessage.text}
        </div>
      )}

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <UsersRound className="w-5 h-5" />
            All Users
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {profiles.length} registered user{profiles.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : profiles.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No users found</p>
              <Button variant="outline" onClick={handleSyncFromAzure} disabled={isSyncing} className="bg-transparent">
                <Cloud className="w-4 h-4 mr-2" />
                Sync users from Azure AD
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="space-y-3 md:hidden">
                {profiles.map((profile) => (
                  <div key={profile.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={profile.avatar_url || undefined} />
                          <AvatarFallback>
                            {getInitials(profile.full_name, profile.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">
                            {profile.full_name || profile.email || "Unknown"}
                          </p>
                          {profile.email && profile.full_name && (
                            <p className="text-xs text-muted-foreground">{profile.email}</p>
                          )}
                        </div>
                      </div>
                      {getRoleBadge(profile.role)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {profile.location_id && (
                        <span>
                          Location: {locations.find((l) => l.id === profile.location_id)?.name || "-"}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(profile)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(profile.id)}>
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
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map((profile) => (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={profile.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {getInitials(profile.full_name, profile.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {profile.full_name || "No name"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{profile.email || "-"}</TableCell>
                        <TableCell>{getRoleBadge(profile.role)}</TableCell>
                        <TableCell>
                          {locations.find((l) => l.id === profile.location_id)?.name || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(profile)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(profile.id)}>
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
