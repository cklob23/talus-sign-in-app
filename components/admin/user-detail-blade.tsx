"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { logAudit } from "@/lib/audit-log"
import {
    DetailBlade,
    DetailBladeSection,
    DetailBladeField,
} from "@/components/admin/detail-blade"
import { AvatarUpload } from "@/components/admin/avatar-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Pencil,
    KeyRound,
    Trash2,
    RefreshCw,
    Loader2,
    Cloud,
    ShieldCheck,
    Mail,
} from "lucide-react"

export interface UserProfileDetail {
    id: string
    email: string | null
    full_name: string | null
    role: string | null
    custom_role_id: string | null
    avatar_url: string | null
    location_id: string | null
    department: string | null
    phone?: string | null
    job_title?: string | null
    office_location?: string | null
    is_active?: boolean | null
    directory_status?: string | null
    directory_synced_at?: string | null
    azure_object_id?: string | null
    created_at?: string
    updated_at?: string
}

interface RoleOption {
    id: string
    name: string
}
interface LocationOption {
    id: string
    name: string
}
interface HostRow {
    id: string
    profile_id: string | null
    email: string | null
    location_id?: string | null
}

const BUILTIN_ROLES = [
    { value: "admin", label: "Admin" },
    { value: "staff", label: "Staff" },
    { value: "employee", label: "Employee" },
]

function formatDate(value?: string | null) {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function DirectoryStatusBadge({ profile }: { profile: UserProfileDetail }) {
    const status = profile.directory_status
    if (status === "removed") return <Badge variant="destructive">Removed from directory</Badge>
    if (profile.is_active === false || status === "disabled")
        return <Badge variant="destructive">Disabled</Badge>
    if (status === "active")
        return (
            <Badge variant="outline" className="border-green-500/50 text-green-600 dark:text-green-400">
                Active in Entra ID
            </Badge>
        )
    return <Badge variant="secondary">Local account</Badge>
}

export function UserDetailBlade({
    profile,
    open,
    onOpenChange,
    roles,
    locations,
    hosts,
    ssoConfigured,
    onChanged,
    onDeleted,
}: {
    profile: UserProfileDetail | null
    open: boolean
    onOpenChange: (open: boolean) => void
    roles: RoleOption[]
    locations: LocationOption[]
    hosts: HostRow[]
    ssoConfigured: boolean
    onChanged: () => void
    onDeleted: () => void
}) {
    const [mode, setMode] = useState<"view" | "edit">("view")
    const [busy, setBusy] = useState(false)
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)
    const [pwOpen, setPwOpen] = useState(false)
    const [pwMode, setPwMode] = useState<"email" | "temporary">("email")
    const [tempPassword, setTempPassword] = useState("")

    const existingHost = profile
        ? hosts.find(
            (h) => h.profile_id === profile.id || h.email?.toLowerCase() === profile.email?.toLowerCase(),
        )
        : undefined

    const [form, setForm] = useState({
        email: "",
        fullName: "",
        role: "employee",
        customRoleId: "",
        locationId: "",
        department: "",
        avatarUrl: "",
        isHost: false,
    })

    // Reset local UI whenever a different user is opened.
    useEffect(() => {
        if (!profile) return
        setMode("view")
        setFeedback(null)
        setPwOpen(false)
        setPwMode("email")
        setTempPassword("")
        setForm({
            email: profile.email || "",
            fullName: profile.full_name || "",
            role: profile.role || "employee",
            customRoleId: profile.custom_role_id || "",
            locationId: profile.location_id || "",
            department: profile.department || "",
            avatarUrl: profile.avatar_url || "",
            isHost: Boolean(existingHost),
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.id])

    if (!profile) return null

    const isDirectoryManaged = Boolean(profile.azure_object_id)
    const roleLabel =
        BUILTIN_ROLES.find((r) => r.value === profile.role)?.label || profile.role || "Unknown"
    const customRole = profile.custom_role_id ? roles.find((r) => r.id === profile.custom_role_id) : null
    const locationName = locations.find((l) => l.id === profile.location_id)?.name

    async function handleSave() {
        setBusy(true)
        setFeedback(null)
        try {
            const response = await fetch("/api/admin/profiles", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: profile!.id,
                    email: form.email || null,
                    full_name: form.fullName || null,
                    role: form.role,
                    custom_role_id: form.role !== "admin" && form.customRoleId ? form.customRoleId : null,
                    location_id: form.locationId || null,
                    department: form.department || null,
                    avatar_url: form.avatarUrl || null,
                }),
            })
            if (!response.ok) {
                const result = await response.json()
                throw new Error(result.error || "Failed to update profile")
            }

            // Sync host membership using the same rules as the page's edit dialog.
            const supabase = createClient()
            if (form.isHost && !existingHost) {
                await supabase.from("hosts").insert({
                    name: form.fullName || form.email,
                    email: form.email,
                    profile_id: profile!.id,
                    avatar_url: form.avatarUrl || null,
                    location_id: form.locationId || locations[0]?.id,
                    is_active: true,
                })
            } else if (form.isHost && existingHost) {
                await supabase
                    .from("hosts")
                    .update({
                        name: form.fullName || form.email,
                        avatar_url: form.avatarUrl || null,
                        location_id: form.locationId || existingHost.location_id,
                        profile_id: profile!.id,
                    })
                    .eq("id", existingHost.id)
            } else if (!form.isHost && existingHost) {
                await supabase.from("hosts").delete().eq("id", existingHost.id)
            }

            await logAudit({
                action: "user.updated",
                entityType: "user",
                entityId: profile!.id,
                description: `Admin updated user: ${form.fullName || form.email}`,
                metadata: { email: form.email, role: form.role, department: form.department },
            })

            setFeedback({ type: "success", text: "User updated" })
            setMode("view")
            onChanged()
        } catch (error) {
            setFeedback({ type: "error", text: error instanceof Error ? error.message : "Update failed" })
        } finally {
            setBusy(false)
        }
    }

    async function handleDelete() {
        if (!confirm("Delete this user profile? This cannot be undone.")) return
        setBusy(true)
        setFeedback(null)
        try {
            const response = await fetch(`/api/admin/profiles?id=${profile!.id}`, { method: "DELETE" })
            if (!response.ok) {
                const result = await response.json()
                throw new Error(result.error || "Failed to delete profile")
            }
            await logAudit({
                action: "user.deleted",
                entityType: "user",
                entityId: profile!.id,
                description: `Admin deleted user: ${profile!.full_name || profile!.email || profile!.id}`,
            })
            onDeleted()
            onOpenChange(false)
        } catch (error) {
            setFeedback({ type: "error", text: error instanceof Error ? error.message : "Delete failed" })
        } finally {
            setBusy(false)
        }
    }

    async function handleSyncFromEntra() {
        setBusy(true)
        setFeedback(null)
        try {
            const response = await fetch("/api/admin/sync-single-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ profileId: profile!.id }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || "Sync failed")
            setFeedback({ type: "success", text: "Synced from Entra ID" })
            onChanged()
        } catch (error) {
            setFeedback({ type: "error", text: error instanceof Error ? error.message : "Sync failed" })
        } finally {
            setBusy(false)
        }
    }

    async function handlePasswordReset() {
        if (!profile!.email) {
            setFeedback({ type: "error", text: "User has no email address" })
            return
        }
        if (pwMode === "temporary" && tempPassword.length < 8) {
            setFeedback({ type: "error", text: "Password must be at least 8 characters" })
            return
        }
        setBusy(true)
        setFeedback(null)
        try {
            const endpoint =
                pwMode === "email" ? "/api/admin/reset-password" : "/api/admin/set-temporary-password"
            const body =
                pwMode === "email"
                    ? { userId: profile!.id, email: profile!.email }
                    : { userId: profile!.id, email: profile!.email, password: tempPassword }
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || "Password reset failed")
            setFeedback({
                type: "success",
                text:
                    pwMode === "email"
                        ? `Reset email sent to ${profile!.email}`
                        : "Temporary password set",
            })
            setPwOpen(false)
            setTempPassword("")
            setPwMode("email")
        } catch (error) {
            setFeedback({ type: "error", text: error instanceof Error ? error.message : "Reset failed" })
        } finally {
            setBusy(false)
        }
    }

    const displayName = profile.full_name || profile.email || "Unknown user"

    return (
        <DetailBlade
            open={open}
            onOpenChange={onOpenChange}
            eyebrow="User"
            title={displayName}
            subtitle={profile.email || undefined}
            avatarUrl={mode === "edit" ? undefined : profile.avatar_url}
            status={
                <>
                    <Badge className="bg-primary text-primary-foreground">{roleLabel}</Badge>
                    {customRole ? (
                        <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
                            <ShieldCheck className="h-3 w-3" />
                            {customRole.name}
                        </Badge>
                    ) : null}
                    <DirectoryStatusBadge profile={profile} />
                    {existingHost ? <Badge variant="secondary">Host</Badge> : null}
                </>
            }
            footer={
                mode === "edit" ? (
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setMode("view")} disabled={busy}>
                            Cancel
                        </Button>
                        <Button className="flex-1" onClick={handleSave} disabled={busy}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save changes
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {feedback ? (
                            <p className={`text-sm ${feedback.type === "error" ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                                {feedback.text}
                            </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => setMode("edit")} disabled={busy}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                            </Button>
                            <Button size="sm" variant="outline" className="bg-transparent" onClick={() => setPwOpen((v) => !v)} disabled={busy}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                Reset password
                            </Button>
                            {ssoConfigured && isDirectoryManaged ? (
                                <Button size="sm" variant="outline" className="bg-transparent" onClick={handleSyncFromEntra} disabled={busy}>
                                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Sync from Entra ID
                                </Button>
                            ) : null}
                            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={busy}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </Button>
                        </div>
                    </div>
                )
            }
        >
            {mode === "edit" ? (
                <div className="flex flex-col gap-5">
                    <div className="flex justify-center">
                        <AvatarUpload
                            profileId={profile.id}
                            currentUrl={form.avatarUrl}
                            name={form.fullName}
                            onUploadComplete={(url) => setForm((f) => ({ ...f, avatarUrl: url }))}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="blade-name">Full name</Label>
                        <Input id="blade-name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="blade-email">Email</Label>
                        <Input id="blade-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="blade-dept">Department</Label>
                        <Input id="blade-dept" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                        <Label>Role</Label>
                        <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {BUILTIN_ROLES.map((r) => (
                                    <SelectItem key={r.value} value={r.value}>
                                        {r.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {form.role !== "admin" && roles.length > 0 ? (
                        <div className="grid gap-2">
                            <Label>Custom role</Label>
                            <Select
                                value={form.customRoleId || "none"}
                                onValueChange={(v) => setForm((f) => ({ ...f, customRoleId: v === "none" ? "" : v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="None" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {roles.map((r) => (
                                        <SelectItem key={r.id} value={r.id}>
                                            {r.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : null}
                    {locations.length > 0 ? (
                        <div className="grid gap-2">
                            <Label>Location</Label>
                            <Select value={form.locationId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, locationId: v === "none" ? "" : v }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="No location" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No location</SelectItem>
                                    {locations.map((l) => (
                                        <SelectItem key={l.id} value={l.id}>
                                            {l.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : null}
                    <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                            <p className="text-sm font-medium">Host</p>
                            <p className="text-xs text-muted-foreground">Selectable as a host for visitors</p>
                        </div>
                        <Switch checked={form.isHost} onCheckedChange={(v) => setForm((f) => ({ ...f, isHost: v }))} />
                    </div>
                    {isDirectoryManaged ? (
                        <p className="text-xs text-muted-foreground">
                            This account is managed by Entra ID. Directory fields (job title, office, phone, status) update on the
                            next sync and may overwrite manual edits.
                        </p>
                    ) : null}
                </div>
            ) : (
                <>
                    {pwOpen ? (
                        <DetailBladeSection title="Reset password">
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant={pwMode === "email" ? "default" : "outline"}
                                    className={pwMode === "email" ? "" : "bg-transparent"}
                                    onClick={() => setPwMode("email")}
                                >
                                    <Mail className="mr-2 h-4 w-4" />
                                    Email link
                                </Button>
                                <Button
                                    size="sm"
                                    variant={pwMode === "temporary" ? "default" : "outline"}
                                    className={pwMode === "temporary" ? "" : "bg-transparent"}
                                    onClick={() => setPwMode("temporary")}
                                >
                                    <KeyRound className="mr-2 h-4 w-4" />
                                    Temporary
                                </Button>
                            </div>
                            {pwMode === "temporary" ? (
                                <Input
                                    type="text"
                                    placeholder="Temporary password (min 8 chars)"
                                    value={tempPassword}
                                    onChange={(e) => setTempPassword(e.target.value)}
                                />
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Sends a password reset link to {profile.email}.
                                </p>
                            )}
                            <Button size="sm" onClick={handlePasswordReset} disabled={busy}>
                                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {pwMode === "email" ? "Send reset email" : "Set temporary password"}
                            </Button>
                            <Separator />
                        </DetailBladeSection>
                    ) : null}

                    <DetailBladeSection title="Contact">
                        <DetailBladeField label="Email" value={profile.email} showEmpty />
                        <DetailBladeField label="Phone" value={profile.phone} showEmpty />
                        <DetailBladeField label="Department" value={profile.department} showEmpty />
                        <DetailBladeField label="Job title" value={profile.job_title} showEmpty />
                        <DetailBladeField label="Office" value={profile.office_location} showEmpty />
                    </DetailBladeSection>

                    <DetailBladeSection title="Access">
                        <DetailBladeField label="Role" value={roleLabel} />
                        <DetailBladeField label="Custom role" value={customRole?.name} />
                        <DetailBladeField label="Location" value={locationName} showEmpty />
                        <DetailBladeField label="Host" value={existingHost ? "Yes" : "No"} />
                    </DetailBladeSection>

                    <DetailBladeSection title="Directory">
                        <DetailBladeField
                            label="Source"
                            value={isDirectoryManaged ? "Microsoft Entra ID" : "Local account"}
                        />
                        <DetailBladeField label="Status" value={<DirectoryStatusBadge profile={profile} />} />
                        <DetailBladeField label="Last synced" value={formatDate(profile.directory_synced_at)} showEmpty />
                        {isDirectoryManaged ? (
                            <DetailBladeField
                                label="Entra object ID"
                                value={<span className="break-all font-mono text-xs">{profile.azure_object_id}</span>}
                            />
                        ) : null}
                    </DetailBladeSection>

                    <DetailBladeSection title="Record">
                        <DetailBladeField label="Created" value={formatDate(profile.created_at)} showEmpty />
                        <DetailBladeField label="Updated" value={formatDate(profile.updated_at)} showEmpty />
                    </DetailBladeSection>
                </>
            )}
        </DetailBlade>
    )
}
