"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { Plus, Pencil, Trash2, Settings, Tag } from "lucide-react"
import type { VisitorType } from "@/types/database"

export default function SettingsPage() {
  const [visitorTypes, setVisitorTypes] = useState<VisitorType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingType, setEditingType] = useState<VisitorType | null>(null)
  const [form, setForm] = useState({
    name: "",
    badgeColor: "#10B981",
    requiresHost: true,
    requiresCompany: false,
  })

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from("visitor_types").select("*").order("name")
    if (data) setVisitorTypes(data)
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  function openCreateDialog() {
    setEditingType(null)
    setForm({
      name: "",
      badgeColor: "#10B981",
      requiresHost: true,
      requiresCompany: false,
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(type: VisitorType) {
    setEditingType(type)
    setForm({
      name: type.name,
      badgeColor: type.badge_color,
      requiresHost: type.requires_host,
      requiresCompany: type.requires_company,
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    // Get location
    const { data: locations } = await supabase.from("locations").select("id").limit(1)
    if (!locations || locations.length === 0) return

    const data = {
      name: form.name,
      badge_color: form.badgeColor,
      requires_host: form.requiresHost,
      requires_company: form.requiresCompany,
      location_id: locations[0].id,
    }

    if (editingType) {
      await supabase.from("visitor_types").update(data).eq("id", editingType.id)
    } else {
      await supabase.from("visitor_types").insert(data)
    }

    setIsDialogOpen(false)
    loadData()
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this visitor type?")) return
    const supabase = createClient()
    await supabase.from("visitor_types").delete().eq("id", id)
    loadData()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure visitor management settings</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Visitor Types
            </CardTitle>
            <CardDescription>Configure categories for different visitor types</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Type
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingType ? "Edit Visitor Type" : "Add Visitor Type"}</DialogTitle>
                <DialogDescription>
                  {editingType ? "Update visitor type settings" : "Create a new visitor category"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Contractor, Interview"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Badge Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="color"
                      type="color"
                      value={form.badgeColor}
                      onChange={(e) => setForm({ ...form, badgeColor: e.target.value })}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={form.badgeColor}
                      onChange={(e) => setForm({ ...form, badgeColor: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="requiresHost">Requires Host</Label>
                  <Switch
                    id="requiresHost"
                    checked={form.requiresHost}
                    onCheckedChange={(checked: boolean) => setForm({ ...form, requiresHost: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="requiresCompany">Requires Company</Label>
                  <Switch
                    id="requiresCompany"
                    checked={form.requiresCompany}
                    onCheckedChange={(checked: boolean) => setForm({ ...form, requiresCompany: checked })}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit">{editingType ? "Save Changes" : "Add Type"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : visitorTypes.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No visitor types configured</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Badge Color</TableHead>
                  <TableHead>Requires Host</TableHead>
                  <TableHead>Requires Company</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitorTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: type.badge_color }} />
                        <span className="text-sm text-muted-foreground">{type.badge_color}</span>
                      </div>
                    </TableCell>
                    <TableCell>{type.requires_host ? "Yes" : "No"}</TableCell>
                    <TableCell>{type.requires_company ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(type)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(type.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            General Settings
          </CardTitle>
          <CardDescription>System-wide configuration options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto Sign-Out</Label>
              <p className="text-sm text-muted-foreground">Automatically sign out visitors at end of day</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Host Notifications</Label>
              <p className="text-sm text-muted-foreground">Email hosts when their visitors arrive</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Badge Printing</Label>
              <p className="text-sm text-muted-foreground">Enable automatic visitor badge printing</p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
