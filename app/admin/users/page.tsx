"use client"

import { Checkbox } from "@/components/ui/checkbox"

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
import { Plus, Pencil, Trash2, UsersRound, RefreshCw, Cloud, Loader2, KeyRound, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Location, Host } from "@/types/database"
import { AvatarUpload } from "@/components/admin/avatar-upload"

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
  const [hosts, setHosts] = useState<Host[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [azureUsers, setAzureUsers] = useState<Array<{
    id: string
    displayName: string
    mail: string
    userPrincipalName: string
    photo?: string
    selected: boolean
  }>>([])
  const [isAzurePreviewOpen, setIsAzurePreviewOpen] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [isBulkActionOpen, setIsBulkActionOpen] = useState(false)
  const [bulkAction, setBulkAction] = useState<"role" | "location" | "host" | null>(null)
  const [bulkValue, setBulkValue] = useState("")
  const [isPasswordResetDialogOpen, setIsPasswordResetDialogOpen] = useState(false)
  const [passwordResetUserId, setPasswordResetUserId] = useState<string | null>(null)
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    role: "employee",
    locationId: "",
    avatarUrl: "",
    isHost: false,
  })

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()

    const [{ data: profilesData }, { data: locationsData }, { data: hostsData }] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("locations").select("*").order("name"),
      supabase.from("hosts").select("*"),
    ])

    if (profilesData) setProfiles(profilesData)
    if (hostsData) setHosts(hostsData)
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
      isHost: false,
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(profile: Profile) {
    setEditingProfile(profile)
    // Check if this profile is linked to a host
    const isProfileHost = hosts.some(h => h.profile_id === profile.id || h.email?.toLowerCase() === profile.email?.toLowerCase())
    setForm({
      email: profile.email || "",
      fullName: profile.full_name || "",
      role: profile.role || "employee",
      locationId: profile.location_id || locations[0]?.id || "",
      avatarUrl: profile.avatar_url || "",
      isHost: isProfileHost,
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)

    try {
      const profileData = {
        email: form.email || null,
        full_name: form.fullName || null,
        role: form.role,
        location_id: form.locationId || null,
        avatar_url: form.avatarUrl || null,
      }

      if (editingProfile) {
        // Update existing profile via API
        const response = await fetch("/api/admin/profiles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingProfile.id, ...profileData }),
        })
        
        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || "Failed to update profile")
        }

        // Handle host status
        const supabase = createClient()
        const existingHost = hosts.find(h => h.profile_id === editingProfile.id || h.email?.toLowerCase() === editingProfile.email?.toLowerCase())
        
        if (form.isHost && !existingHost) {
          // Create new host entry
          await supabase.from("hosts").insert({
            name: form.fullName || form.email,
            email: form.email,
            profile_id: editingProfile.id,
            avatar_url: form.avatarUrl || null,
            location_id: form.locationId || locations[0]?.id,
            is_active: true,
          })
        } else if (form.isHost && existingHost) {
          // Update existing host entry
          await supabase.from("hosts").update({
            name: form.fullName || form.email,
            avatar_url: form.avatarUrl || null,
            location_id: form.locationId || existingHost.location_id,
            profile_id: editingProfile.id,
          }).eq("id", existingHost.id)
        } else if (!form.isHost && existingHost) {
          // Remove host entry
          await supabase.from("hosts").delete().eq("id", existingHost.id)
        }
      } else {
        // Create new profile via API
        const response = await fetch("/api/admin/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profileData),
        })
        
        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || "Failed to create profile")
        }
      }

      setIsDialogOpen(false)
      loadData()
    } catch (error) {
      setSyncMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save profile",
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this user profile? This action cannot be undone.")) return
    
    try {
      const response = await fetch(`/api/admin/profiles?id=${id}`, {
        method: "DELETE",
      })
      
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || "Failed to delete profile")
      }
      
      loadData()
    } catch (error) {
      setSyncMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to delete profile",
      })
    }
  }

  async function handleFetchAzureUsers() {
    setIsSyncing(true)
    setSyncMessage(null)

    try {
      const response = await fetch("/api/admin/sync-azure-users?preview=true", {
        method: "GET",
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch Azure users")
      }

      // Mark users as selected by default, but unselect if they already exist
      const existingEmails = new Set(profiles.map(p => p.email?.toLowerCase()))
      const usersWithSelection = result.users.map((user: { mail: string; userPrincipalName: string }) => ({
        ...user,
        selected: !existingEmails.has(user.mail?.toLowerCase() || user.userPrincipalName?.toLowerCase())
      }))

      setAzureUsers(usersWithSelection)
      setIsAzurePreviewOpen(true)
    } catch (error) {
      setSyncMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to fetch Azure AD users",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleImportSelectedUsers() {
    const selectedUsers = azureUsers.filter(u => u.selected)
    if (selectedUsers.length === 0) {
      setSyncMessage({ type: "error", text: "No users selected to import" })
      return
    }

    setIsSyncing(true)
    setSyncMessage(null)

    try {
      const response = await fetch("/api/admin/sync-azure-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: selectedUsers }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to import users")
      }

      setSyncMessage({
        type: "success",
        text: `Successfully imported ${result.synced} users from Azure AD`,
      })
      setIsAzurePreviewOpen(false)
      setAzureUsers([])
      loadData()
    } catch (error) {
      setSyncMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to import users from Azure AD",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  function toggleAzureUserSelection(id: string) {
    setAzureUsers(users => users.map(u => 
      u.id === id ? { ...u, selected: !u.selected } : u
    ))
  }

  function selectAllAzureUsers(selected: boolean) {
    setAzureUsers(users => users.map(u => ({ ...u, selected })))
  }

  function getRoleBadge(role: string | null) {
    const roleConfig = ROLES.find((r) => r.value === role) || { label: role || "Unknown", color: "bg-gray-500" }
    return (
      <Badge className={`${roleConfig.color} text-white`}>
        {roleConfig.label}
      </Badge>
    )
  }

  function isUserHost(profile: Profile): boolean {
    return hosts.some(h => h.profile_id === profile.id || h.email?.toLowerCase() === profile.email?.toLowerCase())
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

  const handleSyncFromAzure = async () => {
    // Placeholder function for handleSyncFromAzure
  }

  function toggleUserSelection(id: string) {
    setSelectedUserIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedUserIds.size === profiles.length) {
      setSelectedUserIds(new Set())
    } else {
      setSelectedUserIds(new Set(profiles.map(p => p.id)))
    }
  }

  async function handleBulkAction() {
    if (!bulkAction || !bulkValue || selectedUserIds.size === 0) return
    
    setIsLoading(true)
    const supabase = createClient()
    
    try {
      const selectedProfiles = profiles.filter(p => selectedUserIds.has(p.id))
      
      if (bulkAction === "role") {
        // Update roles via API
        for (const profile of selectedProfiles) {
          await fetch("/api/admin/profiles", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: profile.id, role: bulkValue }),
          })
        }
        setSyncMessage({ type: "success", text: `Updated role for ${selectedProfiles.length} users` })
      } else if (bulkAction === "location") {
        // Update locations
        for (const profile of selectedProfiles) {
          await fetch("/api/admin/profiles", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: profile.id, location_id: bulkValue }),
          })
        }
        setSyncMessage({ type: "success", text: `Updated location for ${selectedProfiles.length} users` })
      } else if (bulkAction === "host") {
        // Set users as hosts
        const setAsHost = bulkValue === "true"
        for (const profile of selectedProfiles) {
          const existingHost = hosts.find(h => h.profile_id === profile.id || h.email?.toLowerCase() === profile.email?.toLowerCase())
          
          if (setAsHost && !existingHost) {
            await supabase.from("hosts").insert({
              name: profile.full_name || profile.email,
              email: profile.email,
              profile_id: profile.id,
              avatar_url: profile.avatar_url || null,
              location_id: profile.location_id || locations[0]?.id,
              is_active: true,
            })
          } else if (!setAsHost && existingHost) {
            await supabase.from("hosts").delete().eq("id", existingHost.id)
          }
        }
        setSyncMessage({ type: "success", text: setAsHost ? `Added ${selectedProfiles.length} users as hosts` : `Removed ${selectedProfiles.length} users from hosts` })
      }
      
      setSelectedUserIds(new Set())
      setIsBulkActionOpen(false)
      setBulkAction(null)
      setBulkValue("")
      loadData()
    } catch (error) {
      setSyncMessage({ type: "error", text: error instanceof Error ? error.message : "Bulk action failed" })
    } finally {
      setIsLoading(false)
    }
  }

  async function handlePasswordReset(userId: string) {
    const profile = profiles.find(p => p.id === userId)
    if (!profile?.email) {
      setSyncMessage({ type: "error", text: "User does not have an email address" })
      return
    }

    try {
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: profile.email }),
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to send password reset")
      }

      setSyncMessage({ type: "success", text: `Password reset email sent to ${profile.email}` })
      setIsPasswordResetDialogOpen(false)
      setPasswordResetUserId(null)
    } catch (error) {
      setSyncMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to send password reset" })
    }
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
            onClick={handleFetchAzureUsers}
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
                {editingProfile && (
                  <div className="flex items-center space-x-2 py-2">
                    <Checkbox
                      id="isHost"
                      checked={form.isHost}
                      onCheckedChange={(checked) => setForm({ ...form, isHost: checked === true })}
                    />
                    <Label htmlFor="isHost" className="text-sm font-normal cursor-pointer">
                      Set as Host (can receive visitors)
                    </Label>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Profile Photo</Label>
                  {editingProfile ? (
                    <div className="flex justify-center py-2">
                      <AvatarUpload
                        profileId={editingProfile.id}
                        currentUrl={form.avatarUrl}
                        name={form.fullName}
                        onUploadComplete={(url) => setForm({ ...form, avatarUrl: url })}
                        size="lg"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        type="url"
                        placeholder="https://example.com/avatar.jpg"
                        value={form.avatarUrl}
                        onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter an avatar URL. You can upload photos after saving the user.
                      </p>
                      {form.avatarUrl && (
                        <div className="flex justify-center py-2">
                          <Avatar className="h-16 w-16">
                            <AvatarImage src={form.avatarUrl || "/placeholder.svg"} />
                            <AvatarFallback>{getInitials(form.fullName, form.email)}</AvatarFallback>
                          </Avatar>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="submit">{editingProfile ? "Save Changes" : "Add User"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Azure Sync Preview Dialog */}
      <Dialog open={isAzurePreviewOpen} onOpenChange={setIsAzurePreviewOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Users from Azure AD</DialogTitle>
            <DialogDescription>
              Select which users you want to import. Users already in the system are unchecked by default.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {azureUsers.filter(u => u.selected).length} of {azureUsers.length} selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => selectAllAzureUsers(true)} className="bg-transparent">
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={() => selectAllAzureUsers(false)} className="bg-transparent">
                  Deselect All
                </Button>
              </div>
            </div>
            
            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              {azureUsers.length === 0 ? (
                <p className="p-4 text-center text-muted-foreground">No users found in Azure AD</p>
              ) : (
                <div className="divide-y">
                  {azureUsers.map(user => {
                    const existsInSystem = profiles.some(p => 
                      p.email?.toLowerCase() === (user.mail?.toLowerCase() || user.userPrincipalName?.toLowerCase())
                    )
                    return (
                      <div
                        key={user.id}
                        className={`flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer ${existsInSystem ? "opacity-60" : ""}`}
                        onClick={() => toggleAzureUserSelection(user.id)}
                      >
                        <Checkbox
                          checked={user.selected}
                          onCheckedChange={() => toggleAzureUserSelection(user.id)}
                        />
                        <Avatar className="h-10 w-10">
                          {user.photo ? (
                            <AvatarImage src={user.photo || "/placeholder.svg"} />
                          ) : null}
                          <AvatarFallback>
                            {user.displayName?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{user.displayName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {user.mail || user.userPrincipalName}
                          </p>
                        </div>
                        {existsInSystem && (
                          <Badge variant="secondary" className="text-xs">Already exists</Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAzurePreviewOpen(false)} className="bg-transparent">
              Cancel
            </Button>
            <Button onClick={handleImportSelectedUsers} disabled={isSyncing || azureUsers.filter(u => u.selected).length === 0}>
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${azureUsers.filter(u => u.selected).length} Users`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Bulk Action Dialog */}
      <Dialog open={isBulkActionOpen} onOpenChange={setIsBulkActionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Update {selectedUserIds.size} Users</DialogTitle>
            <DialogDescription>
              Select an action to apply to all selected users
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={bulkAction || ""} onValueChange={(v) => { setBulkAction(v as "role" | "location" | "host"); setBulkValue(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">Change Role</SelectItem>
                  <SelectItem value="location">Change Location</SelectItem>
                  <SelectItem value="host">Set Host Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {bulkAction === "role" && (
              <div className="space-y-2">
                <Label>New Role</Label>
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(role => (
                      <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {bulkAction === "location" && (
              <div className="space-y-2">
                <Label>New Location</Label>
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {bulkAction === "host" && (
              <div className="space-y-2">
                <Label>Host Status</Label>
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Set as Host</SelectItem>
                    <SelectItem value="false">Remove as Host</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkActionOpen(false)} className="bg-transparent">Cancel</Button>
            <Button onClick={handleBulkAction} disabled={!bulkAction || !bulkValue || isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Apply to {selectedUserIds.size} Users
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={isPasswordResetDialogOpen} onOpenChange={setIsPasswordResetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Send a password reset email to this user?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              A password reset link will be sent to the user{"'"}s email address. They can use this link to set a new password.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordResetDialogOpen(false)} className="bg-transparent">Cancel</Button>
            <Button onClick={() => passwordResetUserId && handlePasswordReset(passwordResetUserId)}>
              Send Reset Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <UsersRound className="w-5 h-5" />
                All Users
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {profiles.length} registered user{profiles.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            {selectedUserIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{selectedUserIds.size} selected</span>
                <Button size="sm" onClick={() => setIsBulkActionOpen(true)}>
                  Bulk Actions
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedUserIds(new Set())} className="bg-transparent">
                  Clear
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : profiles.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No users found</p>
              <Button variant="outline" onClick={handleFetchAzureUsers} disabled={isSyncing} className="bg-transparent">
                <Cloud className="w-4 h-4 mr-2" />
                Sync users from Azure AD
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="space-y-3 md:hidden">
                {profiles.map((profile) => (
                  <div key={profile.id} className={`border rounded-lg p-3 space-y-2 ${selectedUserIds.has(profile.id) ? "border-primary bg-primary/5" : ""}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedUserIds.has(profile.id)}
                        onCheckedChange={() => toggleUserSelection(profile.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
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
                          <div className="flex flex-wrap gap-1">
                            {getRoleBadge(profile.role)}
                            {isUserHost(profile) && (
                              <Badge variant="outline" className="border-amber-500 text-amber-600">
                                Host
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                          {profile.location_id && (
                            <span>
                              Location: {locations.find((l) => l.id === profile.location_id)?.name || "-"}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openEditDialog(profile)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setPasswordResetUserId(profile.id); setIsPasswordResetDialogOpen(true); }}>
                                <KeyRound className="w-4 h-4 mr-2" />
                                Reset Password
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(profile.id)}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
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
                          checked={selectedUserIds.size === profiles.length && profiles.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map((profile) => (
                      <TableRow key={profile.id} className={selectedUserIds.has(profile.id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedUserIds.has(profile.id)}
                            onCheckedChange={() => toggleUserSelection(profile.id)}
                          />
                        </TableCell>
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
                        <TableCell>
                          <div className="flex gap-1">
                            {getRoleBadge(profile.role)}
                            {isUserHost(profile) && (
                              <Badge variant="outline" className="border-amber-500 text-amber-600">
                                Host
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {locations.find((l) => l.id === profile.location_id)?.name || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openEditDialog(profile)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit User
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setPasswordResetUserId(profile.id); setIsPasswordResetDialogOpen(true); }}>
                                <KeyRound className="w-4 h-4 mr-2" />
                                Reset Password
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(profile.id)}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
