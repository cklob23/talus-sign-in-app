"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AvatarUpload } from "@/components/admin/avatar-upload"
import { Loader2 } from "lucide-react"

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userEmail: string
}

interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  department: string | null
}

export function ProfileModal({ open, onOpenChange, userId, userEmail }: ProfileModalProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    department: "",
  })

  useEffect(() => {
    if (open && userId) {
      loadProfile()
    }
  }, [open, userId])

  async function loadProfile() {
    setLoading(true)
    const supabase = createClient()
    
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()

    if (data) {
      setProfile(data)
      setForm({
        full_name: data.full_name || "",
        phone: data.phone || "",
        department: data.department || "",
      })
    } else if (error && error.code === "PGRST116") {
      // Profile doesn't exist, create it
      const { data: newProfile } = await supabase
        .from("profiles")
        .insert({ id: userId })
        .select()
        .single()
      
      if (newProfile) {
        setProfile(newProfile)
      }
    }
    
    setLoading(false)
  }

  async function handleSave() {
    if (!userId) return
    
    setSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name || null,
        phone: form.phone || null,
        department: form.department || null,
      })
      .eq("id", userId)

    if (!error) {
      // Refresh profile
      await loadProfile()
      onOpenChange(false)
    }
    
    setSaving(false)
  }

  function handleAvatarUpload(url: string) {
    setProfile(prev => prev ? { ...prev, avatar_url: url } : null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your profile information and avatar
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Avatar Upload */}
            <div className="flex justify-center">
              <AvatarUpload
                profileId={userId}
                currentUrl={profile?.avatar_url}
                name={form.full_name || userEmail}
                onUploadComplete={handleAvatarUpload}
                size="lg"
              />
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={userEmail}
                disabled
                className="bg-muted"
              />
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                placeholder="Enter your full name"
                value={form.full_name}
                onChange={(e) => setForm(prev => ({ ...prev, full_name: e.target.value }))}
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="Enter your phone number"
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>

            {/* Department */}
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                placeholder="Enter your department"
                value={form.department}
                onChange={(e) => setForm(prev => ({ ...prev, department: e.target.value }))}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
