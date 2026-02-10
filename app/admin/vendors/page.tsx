"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  RefreshCw,
  Search,
  Building2,
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  Globe,
  Tag,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import type { Vendor } from "@/types/database"

interface RampPreviewVendor {
  id: string
  name: string
  name_legal: string | null
  is_active: boolean
  country: string | null
  state: string | null
  description: string | null
  category_name: string | null
  exists: boolean
  selected: boolean
}

const PAGE_SIZE_OPTIONS = [50, 100, 150, 250]

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [activeCountState, setActiveCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null)
  const [search, setSearch] = useState("")
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(150)
  const [filteredCount, setFilteredCount] = useState(0)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newVendorName, setNewVendorName] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [rampVendors, setRampVendors] = useState<RampPreviewVendor[]>([])
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [lastSyncState, setLastSync] = useState<string | null>(null)
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Load vendor stats (total + active counts) -- separate from paginated list
  const loadStats = useCallback(async () => {
    const supabase = createClient()
    const [totalRes, activeRes, syncRes] = await Promise.all([
      supabase.from("vendors").select("*", { count: "exact", head: true }),
      supabase.from("vendors").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("vendors").select("synced_at").not("synced_at", "is", null).order("synced_at", { ascending: false }).limit(1),
    ])
    setTotalCount(totalRes.count || 0)
    setActiveCount(activeRes.count || 0)
    setLastSync(syncRes.data?.[0]?.synced_at || null)
  }, [])

  // Load paginated + filtered vendors
  const loadVendors = useCallback(async (currentPage: number, currentPageSize: number, currentSearch: string, currentFilter: string) => {
    setIsLoading(true)
    const supabase = createClient()
    const from = (currentPage - 1) * currentPageSize
    const to = from + currentPageSize - 1

    let query = supabase
      .from("vendors")
      .select("*", { count: "exact" })
      .order("name")
      .range(from, to)

    if (currentSearch.trim()) {
      query = query.ilike("name", `%${currentSearch.trim()}%`)
    }
    if (currentFilter === "active") {
      query = query.eq("is_active", true)
    } else if (currentFilter === "inactive") {
      query = query.eq("is_active", false)
    }

    const { data, count } = await query
    setVendors(data || [])
    setFilteredCount(count || 0)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    loadVendors(page, pageSize, search, filterActive)
  }, [page, pageSize, filterActive, loadVendors, search])

  // Debounced search: reset to page 1 on search change
  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      loadVendors(1, pageSize, value, filterActive)
    }, 300)
  }

  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize))

  async function handleFetchRampVendors() {
    setIsSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch("/api/admin/vendors/sync", { method: "GET" })
      const text = await res.text()
      let data
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        throw new Error(`Invalid response from server: ${text.slice(0, 200)}`)
      }
      if (!res.ok) {
        throw new Error(data.error || `Failed to fetch vendors from Ramp (${res.status})`)
      }
      // Mark new vendors as selected by default, existing ones unchecked
      const vendorsWithSelection = data.vendors.map((v: Omit<RampPreviewVendor, "selected">) => ({
        ...v,
        selected: !v.exists,
      }))
      setRampVendors(vendorsWithSelection)
      setIsPreviewOpen(true)
    } catch (err) {
      setSyncResult({ success: false, message: err instanceof Error ? err.message : "Failed to fetch vendors from Ramp" })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleImportSelectedVendors() {
    const selectedVendors = rampVendors.filter((v) => v.selected)
    if (selectedVendors.length === 0) {
      setSyncResult({ success: false, message: "No vendors selected to import" })
      return
    }

    setIsImporting(true)
    setSyncResult(null)

    // Chunk imports into batches of 200 to avoid request body size limits
    const CHUNK_SIZE = 200
    let totalSynced = 0
    const warnings: string[] = []

    try {
      for (let i = 0; i < selectedVendors.length; i += CHUNK_SIZE) {
        const chunk = selectedVendors.slice(i, i + CHUNK_SIZE)

        const res = await fetch("/api/admin/vendors/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendors: chunk.map((v) => ({
              id: v.id,
              name: v.name,
              name_legal: v.name_legal,
              is_active: v.is_active,
              country: v.country,
              state: v.state,
              description: v.description,
              category_name: v.category_name,
            })),
          }),
        })

        const text = await res.text()
        let data
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          throw new Error(`Invalid response from server (batch ${Math.floor(i / CHUNK_SIZE) + 1})`)
        }

        if (!res.ok) {
          warnings.push(data.error || `Batch ${Math.floor(i / CHUNK_SIZE) + 1} failed`)
        } else {
          totalSynced += data.synced || 0
        }
      }

      if (totalSynced > 0) {
        setSyncResult({
          success: true,
          message: `Imported ${totalSynced} vendors from Ramp.${warnings.length > 0 ? ` (${warnings.length} batch warnings)` : ""}`,
        })
        setIsPreviewOpen(false)
        setRampVendors([])
        await loadVendors(page, pageSize, search, filterActive)
        await loadStats()
      } else {
        setSyncResult({
          success: false,
          message: warnings[0] || "Import failed",
        })
      }
    } catch (err) {
      setSyncResult({ success: false, message: err instanceof Error ? err.message : "Failed to import vendors" })
    } finally {
      setIsImporting(false)
    }
  }

  function toggleRampVendorSelection(id: string) {
    setRampVendors((prev) =>
      prev.map((v) => (v.id === id ? { ...v, selected: !v.selected } : v))
    )
  }

  function selectAllRampVendors(selected: boolean) {
    setRampVendors((prev) => prev.map((v) => ({ ...v, selected })))
  }

  async function handleToggleActive(vendor: Vendor) {
    const supabase = createClient()
    const { error } = await supabase
      .from("vendors")
      .update({ is_active: !vendor.is_active })
      .eq("id", vendor.id)
    if (!error) {
      setVendors((prev) =>
        prev.map((v) => (v.id === vendor.id ? { ...v, is_active: !v.is_active } : v))
      )
      // Update stats
      setActiveCount((prev) => vendor.is_active ? prev - 1 : prev + 1)
    }
  }

  async function handleAddVendor() {
    if (!newVendorName.trim()) return
    setIsAdding(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from("vendors").insert({
      name: newVendorName.trim(),
      is_active: true,
    })

    if (!error) {
      setNewVendorName("")
      setIsAddOpen(false)
      await loadVendors(page, pageSize, search, filterActive)
      await loadStats()
    }
    setIsAdding(false)
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Vendor Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your vendor list synced from Ramp. Active vendors appear in the kiosk company dropdown.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="bg-transparent">
                <Plus className="w-4 h-4 mr-2" />
                Add Manual
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Vendor Manually</DialogTitle>
                <DialogDescription>
                  Add a vendor that is not in Ramp. This vendor will not be affected by Ramp syncs.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="vendorName">Company Name</Label>
                  <Input
                    id="vendorName"
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    placeholder="Enter company name"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)} className="bg-transparent">
                  Cancel
                </Button>
                <Button onClick={handleAddVendor} disabled={isAdding || !newVendorName.trim()}>
                  {isAdding ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Vendor"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={handleFetchRampVendors} disabled={isSyncing}>
            {isSyncing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync from Ramp
              </>
            )}
          </Button>
        </div>
      </div>

      {syncResult && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            syncResult.success
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {syncResult.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {syncResult.message}
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="p-4">
            <CardDescription className="text-xs">Total Vendors</CardDescription>
            <CardTitle className="text-2xl">{totalCount.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <CardDescription className="text-xs">Active (In Kiosk Dropdown)</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">{activeCountState.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <CardDescription className="text-xs">Last Ramp Sync</CardDescription>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              {lastSyncState
                ? new Date(lastSyncState).toLocaleString()
                : "Never"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Building2 className="w-5 h-5" />
                Vendors
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Toggle vendors on/off to control which companies appear in the kiosk sign-in dropdown
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendors..."
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
              <select
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={filterActive}
                onChange={(e) => {
                  setFilterActive(e.target.value as "all" | "active" | "inactive")
                  setPage(1)
                }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : vendors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Building2 className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">
                {totalCount === 0
                  ? "No vendors yet"
                  : "No vendors match your search"}
              </p>
              <p className="text-xs mt-1">
                {totalCount === 0
                  ? "Click \"Sync from Ramp\" to import your vendor list"
                  : "Try adjusting your search or filter"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company Name</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Last Synced</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24 text-right">In Kiosk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell>
                          {vendor.ramp_vendor_id ? (
                            <Badge variant="secondary" className="text-xs">Ramp</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Manual</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {vendor.synced_at
                            ? new Date(vendor.synced_at).toLocaleDateString()
                            : "--"}
                        </TableCell>
                        <TableCell>
                          {vendor.is_active ? (
                            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Active
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <XCircle className="w-3.5 h-3.5" />
                              Inactive
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={vendor.is_active}
                            onCheckedChange={() => handleToggleActive(vendor)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filteredCount)} of{" "}
                    {filteredCount.toLocaleString()} vendors
                  </span>
                  <span className="text-muted-foreground/50">|</span>
                  <span className="flex items-center gap-1.5">
                    Per page:
                    <select
                      className="h-8 rounded-md border bg-transparent px-2 text-sm"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value))
                        setPage(1)
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-transparent"
                    disabled={page <= 1}
                    onClick={() => setPage(1)}
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-transparent"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="px-3 text-sm font-medium">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-transparent"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-transparent"
                    disabled={page >= totalPages}
                    onClick={() => setPage(totalPages)}
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Ramp Vendor Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Vendors from Ramp</DialogTitle>
            <DialogDescription>
              Select which vendors to import. Vendors already in the system are unchecked by default.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {rampVendors.filter((v) => v.selected).length} of {rampVendors.length} selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => selectAllRampVendors(true)} className="bg-transparent">
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={() => selectAllRampVendors(false)} className="bg-transparent">
                  Deselect All
                </Button>
              </div>
            </div>

            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              {rampVendors.length === 0 ? (
                <p className="p-4 text-center text-muted-foreground">No vendors found in Ramp</p>
              ) : (
                <div className="divide-y">
                  {rampVendors.map((vendor) => (
                    <div
                      key={vendor.id}
                      className={`flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer ${vendor.exists ? "opacity-60" : ""}`}
                      onClick={() => toggleRampVendorSelection(vendor.id)}
                    >
                      <Checkbox
                        checked={vendor.selected}
                        onCheckedChange={() => toggleRampVendorSelection(vendor.id)}
                      />
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {vendor.name
                            .split(/[\s&]+/)
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{vendor.name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {vendor.category_name && (
                            <span className="flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {vendor.category_name}
                            </span>
                          )}
                          {vendor.country && (
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {vendor.state ? `${vendor.state}, ${vendor.country}` : vendor.country}
                            </span>
                          )}
                          {!vendor.is_active && (
                            <span className="text-amber-600">Inactive in Ramp</span>
                          )}
                        </div>
                      </div>
                      {vendor.exists && (
                        <Badge variant="secondary" className="text-xs shrink-0">Already imported</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)} className="bg-transparent">
              Cancel
            </Button>
            <Button
              onClick={handleImportSelectedVendors}
              disabled={isImporting || rampVendors.filter((v) => v.selected).length === 0}
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${rampVendors.filter((v) => v.selected).length} Vendors`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
