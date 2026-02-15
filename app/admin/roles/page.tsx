"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plus, Pencil, Trash2, Shield, ShieldCheck } from "lucide-react"
import { ALL_PERMISSIONS, PERMISSION_LABELS, type PermissionKey, type Role } from "@/lib/permissions"
import { logAudit } from "@/lib/audit-log"
import { Textarea } from "@/components/ui/textarea"

export default function RolesPage() {
    const [roles, setRoles] = useState<Role[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingRole, setEditingRole] = useState<Role | null>(null)
    const [deleteRole, setDeleteRole] = useState<Role | null>(null)
    const [userCounts, setUserCounts] = useState<Record<string, number>>({})
    const [form, setForm] = useState({
        name: "",
        description: "",
        permissions: [] as PermissionKey[],
    })

    async function loadData() {
        setIsLoading(true)
        const supabase = createClient()

        const [{ data: rolesData }, { data: profilesData }] = await Promise.all([
            supabase.from("roles").select("*").order("is_system", { ascending: false }).order("name"),
            supabase.from("profiles").select("custom_role_id").not("custom_role_id", "is", null),
        ])

        if (rolesData) setRoles(rolesData as Role[])

        // Count users per role
        const counts: Record<string, number> = {}
        if (profilesData) {
            for (const p of profilesData) {
                if (p.custom_role_id) {
                    counts[p.custom_role_id] = (counts[p.custom_role_id] || 0) + 1
                }
            }
        }
        setUserCounts(counts)
        setIsLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [])

    function resetForm() {
        setForm({ name: "", description: "", permissions: [] })
        setEditingRole(null)
    }

    function openCreate() {
        resetForm()
        setIsDialogOpen(true)
    }

    function openEdit(role: Role) {
        setEditingRole(role)
        setForm({
            name: role.name,
            description: role.description || "",
            permissions: [...role.permissions],
        })
        setIsDialogOpen(true)
    }

    function togglePermission(key: PermissionKey) {
        setForm((prev) => ({
            ...prev,
            permissions: prev.permissions.includes(key)
                ? prev.permissions.filter((p) => p !== key)
                : [...prev.permissions, key],
        }))
    }

    function toggleAll() {
        if (form.permissions.length === ALL_PERMISSIONS.length) {
            setForm((prev) => ({ ...prev, permissions: [] }))
        } else {
            setForm((prev) => ({ ...prev, permissions: [...ALL_PERMISSIONS] }))
        }
    }

    async function handleSave() {
        const supabase = createClient()

        if (editingRole) {
            const { error } = await supabase
                .from("roles")
                .update({
                    name: form.name,
                    description: form.description || null,
                    permissions: form.permissions,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", editingRole.id)

            if (error) {
                console.error("Failed to update role:", error)
                return
            }

            await logAudit({
                action: "role.updated",
                entityType: "role",
                entityId: editingRole.id,
                description: `Updated role: ${form.name}`,
                metadata: { permissions: form.permissions },
            })
        } else {
            const { error } = await supabase.from("roles").insert({
                name: form.name,
                description: form.description || null,
                permissions: form.permissions,
            })

            if (error) {
                console.error("Failed to create role:", error)
                return
            }

            await logAudit({
                action: "role.created",
                entityType: "role",
                description: `Created role: ${form.name}`,
                metadata: { permissions: form.permissions },
            })
        }

        setIsDialogOpen(false)
        resetForm()
        loadData()
    }

    async function handleDelete() {
        if (!deleteRole) return
        const supabase = createClient()

        // Unassign users first
        await supabase
            .from("profiles")
            .update({ custom_role_id: null })
            .eq("custom_role_id", deleteRole.id)

        const { error } = await supabase.from("roles").delete().eq("id", deleteRole.id)
        if (error) {
            console.error("Failed to delete role:", error)
            setDeleteRole(null)
            return
        }

        await logAudit({
            action: "role.deleted",
            entityType: "role",
            entityId: deleteRole.id,
            description: `Deleted role: ${deleteRole.name}`,
        })

        setDeleteRole(null)
        loadData()
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Roles</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Create roles with specific page permissions and assign them to users.
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm() }}>
                    <DialogTrigger asChild>
                        <Button onClick={openCreate}>
                            <Plus className="w-4 h-4 mr-2" />
                            Create Role
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingRole ? "Edit Role" : "Create Role"}</DialogTitle>
                            <DialogDescription>
                                {editingRole
                                    ? "Update the role name, description, and permissions."
                                    : "Define a new role with specific admin page access."}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label htmlFor="role-name">Name</Label>
                                <Input
                                    id="role-name"
                                    placeholder="e.g. Location Manager"
                                    value={form.name}
                                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                    disabled={editingRole?.is_system}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role-description">Description</Label>
                                <Textarea
                                    id="role-description"
                                    placeholder="Describe what this role is for..."
                                    rows={2}
                                    value={form.description}
                                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label>Page Permissions</Label>
                                    <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs h-7">
                                        {form.permissions.length === ALL_PERMISSIONS.length ? "Deselect All" : "Select All"}
                                    </Button>
                                </div>
                                <div className="rounded-lg border divide-y">
                                    {ALL_PERMISSIONS.map((key) => (
                                        <label
                                            key={key}
                                            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                                        >
                                            <Checkbox
                                                checked={form.permissions.includes(key)}
                                                onCheckedChange={() => togglePermission(key)}
                                            />
                                            <span className="text-sm">{PERMISSION_LABELS[key]}</span>
                                        </label>
                                    ))}
                                </div>
                                {form.permissions.length === 0 && (
                                    <p className="text-xs text-destructive">Select at least one permission.</p>
                                )}
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={!form.name.trim() || form.permissions.length === 0}
                            >
                                {editingRole ? "Save Changes" : "Create Role"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <Shield className="w-5 h-5" />
                        All Roles
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                        Roles control which admin pages a user can access. The built-in Full Admin role cannot be deleted.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                    ) : roles.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground text-sm">
                            No roles created yet. Click &quot;Create Role&quot; to get started.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Role</TableHead>
                                        <TableHead className="hidden sm:table-cell">Permissions</TableHead>
                                        <TableHead className="hidden md:table-cell">Users</TableHead>
                                        <TableHead className="w-[100px] text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {roles.map((role) => (
                                        <TableRow key={role.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {role.is_system ? (
                                                        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                                                    ) : (
                                                        <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                                                    )}
                                                    <div>
                                                        <div className="font-medium text-sm flex items-center gap-2">
                                                            {role.name}
                                                            {role.is_system && (
                                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">System</Badge>
                                                            )}
                                                        </div>
                                                        {role.description && (
                                                            <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell">
                                                <div className="flex flex-wrap gap-1">
                                                    {role.permissions.length === ALL_PERMISSIONS.length ? (
                                                        <Badge variant="outline" className="text-[10px]">All Pages</Badge>
                                                    ) : (
                                                        role.permissions.slice(0, 4).map((p) => (
                                                            <Badge key={p} variant="outline" className="text-[10px]">
                                                                {PERMISSION_LABELS[p as PermissionKey] || p}
                                                            </Badge>
                                                        ))
                                                    )}
                                                    {role.permissions.length > 4 && role.permissions.length < ALL_PERMISSIONS.length && (
                                                        <Badge variant="outline" className="text-[10px]">
                                                            +{role.permissions.length - 4} more
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">
                                                <span className="text-sm text-muted-foreground">
                                                    {userCounts[role.id] || 0} user{(userCounts[role.id] || 0) !== 1 ? "s" : ""}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => openEdit(role)}
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                        <span className="sr-only">Edit {role.name}</span>
                                                    </Button>
                                                    {!role.is_system && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                                            onClick={() => setDeleteRole(role)}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            <span className="sr-only">Delete {role.name}</span>
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete confirmation */}
            <AlertDialog open={!!deleteRole} onOpenChange={(open) => !open && setDeleteRole(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete role &quot;{deleteRole?.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove the role and unassign it from {userCounts[deleteRole?.id || ""] || 0} user(s).
                            Those users will lose their custom permissions and won&apos;t have admin access unless they have
                            the built-in Admin role.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete Role
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
