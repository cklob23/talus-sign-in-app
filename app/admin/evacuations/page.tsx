"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, CheckCircle, Siren, Download } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Evacuation, SignIn, EmployeeSignIn, Profile, Location } from "@/types/database"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatDateTime, formatFullDateTime } from "@/lib/timezone"

interface EmployeeSignInWithJoins extends Omit<EmployeeSignIn, 'profile' | 'location'> {
  profile: Profile | null
  location: Location | null
}

type SignInWithLocation = Omit<SignIn, 'location'> & {
  location?: Location | null
}

export default function EvacuationsPage() {
  const [evacuations, setEvacuations] = useState<Evacuation[]>([])
  const [currentVisitors, setCurrentVisitors] = useState<SignInWithLocation[]>([])
  const [currentEmployees, setCurrentEmployees] = useState<EmployeeSignInWithJoins[]>([])
  const [activeEvacuation, setActiveEvacuation] = useState<Evacuation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()

    const [{ data: evacData }, { data: visitorsData }, { data: employeesData }, { data: locationsData }, { data: currentUser }] = await Promise.all([
      supabase.from("evacuations").select("*, location:locations(*)").order("started_at", { ascending: false }),
      supabase.from("sign_ins").select("*, visitor:visitors(*), host:hosts(*), location:locations(*)").is("sign_out_time", null),
      supabase.from("employee_sign_ins").select("*, profile:profiles(*), location:locations(*)").is("sign_out_time", null),
      supabase.from("locations").select("*").order("name"),
      supabase.auth.getUser(),
    ])

    if (evacData) {
      // Fetch profiles for initiated_by and completed_by users
      const userIds = [...new Set(evacData.flatMap(e => [e.initiated_by, e.completed_by].filter(Boolean)))]
      let profilesMap: Record<string, Profile> = {}
      
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("*")
          .in("id", userIds)
        
        if (profilesData) {
          profilesMap = Object.fromEntries(profilesData.map(p => [p.id, p]))
        }
      }
      
      // Merge profile data into evacuations
      const evacuationsWithProfiles = evacData.map(evac => ({
        ...evac,
        initiated_by_profile: evac.initiated_by ? profilesMap[evac.initiated_by] || null : null,
        completed_by_profile: evac.completed_by ? profilesMap[evac.completed_by] || null : null,
      }))
      
      setEvacuations(evacuationsWithProfiles as Evacuation[])
      const active = evacuationsWithProfiles.find((e) => !e.all_clear)
      setActiveEvacuation(active || null)
    }
    if (visitorsData) setCurrentVisitors(visitorsData as SignInWithLocation[])
    if (employeesData) setCurrentEmployees(employeesData as EmployeeSignInWithJoins[])
    if (locationsData) {
      setLocations(locationsData as Location[])
      if (locationsData.length > 0 && !selectedLocationId) {
        setSelectedLocationId(locationsData[0].id)
      }
    }
    if (currentUser?.user?.id) {
      setCurrentUserId(currentUser.user.id)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Get visitors and employees for the selected location
  const locationVisitors = currentVisitors.filter(v => v.location_id === selectedLocationId)
  const locationEmployees = currentEmployees.filter(e => e.location_id === selectedLocationId)
  const selectedLocation = locations.find(l => l.id === selectedLocationId)

  function exportEvacuationCSV() {
    if (!selectedLocation) return
    
    const timezone = selectedLocation.timezone || "UTC"
    const timestamp = formatFullDateTime(new Date().toISOString(), timezone)
    const csvContent = [
      [`EVACUATION LIST - ${selectedLocation.name}`],
      [`Generated: ${timestamp} (${timezone})`],
      [`Reason: ${reason || "Not specified"}`],
      [],
      ["VISITORS ON-SITE"],
      ["Name", "Company", "Email", "Badge Number", "Host", "Sign In Time"],
      ...locationVisitors.map(v => [
        v.visitor ? `${v.visitor.first_name} ${v.visitor.last_name}` : "",
        v.visitor?.company || "",
        v.visitor?.email || "",
        v.badge_number || "",
        v.host?.name || "",
        formatFullDateTime(v.sign_in_time, timezone),
      ]),
      [],
      ["EMPLOYEES ON-SITE"],
      ["Name", "Email", "Role", "Sign In Time"],
      ...locationEmployees.map(e => [
        e.profile?.full_name || "",
        e.profile?.email || "",
        e.profile?.role || "",
        formatFullDateTime(e.sign_in_time, timezone),
      ]),
      [],
      [`Total Visitors: ${locationVisitors.length}`],
      [`Total Employees: ${locationEmployees.length}`],
      [`TOTAL PEOPLE ON-SITE: ${locationVisitors.length + locationEmployees.length}`],
    ]
    
    const csv = csvContent.map(row => 
      Array.isArray(row) ? row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",") : `"${row}"`
    ).join("\n")
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `evacuation-${selectedLocation.name.replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleStartEvacuation(e: React.FormEvent) {
    e.preventDefault()
    
    if (!selectedLocationId) return
    
    const supabase = createClient()

    await supabase.from("evacuations").insert({
      location_id: selectedLocationId,
      reason: reason || null,
      initiated_by: currentUserId,
    })

    // Export CSV automatically when evacuation starts
    exportEvacuationCSV()

    setReason("")
    setIsDialogOpen(false)
    loadData()
  }

  async function handleEndEvacuation() {
    if (!activeEvacuation) return
    const supabase = createClient()
    await supabase
      .from("evacuations")
      .update({
        all_clear: true,
        ended_at: new Date().toISOString(),
        completed_by: currentUserId,
      })
      .eq("id", activeEvacuation.id)
    loadData()
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Evacuations</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Emergency evacuation management</p>
        </div>
        {activeEvacuation ? (
          <Button variant="destructive" onClick={handleEndEvacuation} className="bg-destructive w-full sm:w-auto" size="sm">
            <CheckCircle className="w-4 h-4 mr-2" />
            End Evacuation - All Clear
          </Button>
        ) : (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="bg-destructive w-full sm:w-auto" size="sm">
                <Siren className="w-4 h-4 mr-2" />
                Start Evacuation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  Start Emergency Evacuation
                </DialogTitle>
                <DialogDescription>
                  This will alert all staff and generate an evacuation list of all visitors currently on-site.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleStartEvacuation} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location *</Label>
                  <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
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
                  {selectedLocation && (
                    <p className="text-xs text-muted-foreground">
                      {locationVisitors.length} visitors and {locationEmployees.length} employees currently on-site
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason (optional)</Label>
                  <Input
                    id="reason"
                    placeholder="e.g., Fire drill, gas leak, etc."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="destructive" className="bg-destructive" disabled={!selectedLocationId}>
                    <Download className="w-4 h-4 mr-2" />
                    Start & Export List
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {activeEvacuation && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-destructive text-base sm:text-lg">
                  <Siren className="w-5 h-5 animate-pulse" />
                  EVACUATION IN PROGRESS
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Started {formatFullDateTime(activeEvacuation.started_at, (activeEvacuation as Evacuation & { location?: Location }).location?.timezone || "UTC")}
                  {activeEvacuation.reason && ` - ${activeEvacuation.reason}`}
                  {(activeEvacuation as Evacuation & { location?: Location }).location && 
                    ` at ${(activeEvacuation as Evacuation & { location?: Location }).location?.name}`}
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  // Set the location to the active evacuation's location and export
                  if (activeEvacuation.location_id) {
                    setSelectedLocationId(activeEvacuation.location_id)
                    setTimeout(exportEvacuationCSV, 100)
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Export List
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4 sm:space-y-6">
            {(() => {
              const evacVisitors = currentVisitors.filter(v => v.location_id === activeEvacuation.location_id)
              const evacEmployees = currentEmployees.filter(e => e.location_id === activeEvacuation.location_id)
              return (
                <>
                  <div>
                    <h3 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                      <span className="w-3 h-3 rounded-full bg-green-500" />
                      Visitors to Account For ({evacVisitors.length})
                    </h3>
                    {evacVisitors.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No visitors currently on-site at this location</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {evacVisitors.map((visitor) => (
                          <div key={visitor.id} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-background rounded-lg border">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-100 flex items-center justify-center font-semibold text-green-600 text-xs sm:text-sm">
                              {visitor.visitor?.first_name?.[0]}
                              {visitor.visitor?.last_name?.[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">
                                {visitor.visitor?.first_name} {visitor.visitor?.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Badge: {visitor.badge_number}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                      <span className="w-3 h-3 rounded-full bg-blue-500" />
                      Employees to Account For ({evacEmployees.length})
                    </h3>
                    {evacEmployees.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No employees currently on-site at this location</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {evacEmployees.map((employee) => (
                          <div key={employee.id} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-background rounded-lg border">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold text-blue-600 text-xs sm:text-sm">
                              {employee.profile?.full_name?.[0] || employee.profile?.email?.[0]?.toUpperCase() || "E"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">
                                {employee.profile?.full_name || employee.profile?.email || "Unknown"}
                              </p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {employee.profile?.role || "Employee"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 sm:pt-4 border-t">
                    <p className="text-sm font-medium">
                      Total people on-site at this location: <span className="text-destructive">{evacVisitors.length + evacEmployees.length}</span>
                    </p>
                  </div>
                </>
              )
            })()}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Evacuation History</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Past evacuation events</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : evacuations.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No evacuation records</p>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="space-y-3 md:hidden">
                {evacuations.map((evac) => {
                  const evacWithProfiles = evac as Evacuation & { 
                    location?: Location
                    initiated_by_profile?: Profile | null
                    completed_by_profile?: Profile | null 
                  }
                  return (
                    <div key={evac.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <p className="font-medium text-sm">
                          {formatDateTime(evac.started_at, evacWithProfiles.location?.timezone || "UTC")}
                        </p>
                        {evac.all_clear ? (
                          <Badge variant="secondary" className="text-xs">All Clear</Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-destructive text-destructive-foreground text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Duration: {evac.ended_at
                            ? (() => {
                                const ms = new Date(evac.ended_at).getTime() - new Date(evac.started_at).getTime()
                                const seconds = Math.floor(ms / 1000)
                                if (seconds < 60) return "a few seconds"
                                return `${Math.floor(seconds / 60)} min`
                              })()
                            : "Ongoing"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                        {evacWithProfiles.initiated_by_profile && (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Started by:</span>
                            <Avatar className="h-4 w-4">
                              <AvatarImage src={evacWithProfiles.initiated_by_profile.avatar_url || undefined} />
                              <AvatarFallback className="text-[8px]">
                                {evacWithProfiles.initiated_by_profile.full_name?.[0] || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span>{evacWithProfiles.initiated_by_profile.full_name || evacWithProfiles.initiated_by_profile.email}</span>
                          </div>
                        )}
                        {evacWithProfiles.completed_by_profile && (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Completed by:</span>
                            <Avatar className="h-4 w-4">
                              <AvatarImage src={evacWithProfiles.completed_by_profile.avatar_url || undefined} />
                              <AvatarFallback className="text-[8px]">
                                {evacWithProfiles.completed_by_profile.full_name?.[0] || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span>{evacWithProfiles.completed_by_profile.full_name || evacWithProfiles.completed_by_profile.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Started by</TableHead>
                      <TableHead>Completed by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evacuations.map((evac) => {
                      const evacWithProfiles = evac as Evacuation & { 
                        location?: Location
                        initiated_by_profile?: Profile | null
                        completed_by_profile?: Profile | null 
                      }
                      const visitorCount = currentVisitors.filter(v => v.location_id === evac.location_id).length
                      const employeeCount = currentEmployees.filter(e => e.location_id === evac.location_id).length
                      const totalPresent = visitorCount + employeeCount
                      
                      return (
                        <TableRow key={evac.id}>
                          <TableCell>{formatDateTime(evac.started_at, evacWithProfiles.location?.timezone || "UTC")}</TableCell>
                          <TableCell>
                            {evac.ended_at
                              ? (() => {
                                  const ms = new Date(evac.ended_at).getTime() - new Date(evac.started_at).getTime()
                                  const seconds = Math.floor(ms / 1000)
                                  if (seconds < 60) return "a few seconds"
                                  const minutes = Math.floor(seconds / 60)
                                  if (minutes < 60) return `${minutes} min`
                                  const hours = Math.floor(minutes / 60)
                                  return `${hours}h ${minutes % 60}m`
                                })()
                              : "Ongoing"}
                          </TableCell>
                          <TableCell>
                            {evac.all_clear ? (
                              <span className="text-muted-foreground">{totalPresent} of {totalPresent} present</span>
                            ) : (
                              <Badge variant="destructive" className="bg-destructive text-destructive-foreground">
                                Active
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {evacWithProfiles.initiated_by_profile ? (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={evacWithProfiles.initiated_by_profile.avatar_url || undefined} />
                                  <AvatarFallback className="text-xs">
                                    {evacWithProfiles.initiated_by_profile.full_name?.[0] || evacWithProfiles.initiated_by_profile.email?.[0]?.toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{evacWithProfiles.initiated_by_profile.full_name || evacWithProfiles.initiated_by_profile.email}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {evacWithProfiles.completed_by_profile ? (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={evacWithProfiles.completed_by_profile.avatar_url || undefined} />
                                  <AvatarFallback className="text-xs">
                                    {evacWithProfiles.completed_by_profile.full_name?.[0] || evacWithProfiles.completed_by_profile.email?.[0]?.toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{evacWithProfiles.completed_by_profile.full_name || evacWithProfiles.completed_by_profile.email}</span>
                              </div>
                            ) : evac.all_clear ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
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
