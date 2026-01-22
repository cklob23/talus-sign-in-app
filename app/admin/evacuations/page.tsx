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
import { AlertTriangle, CheckCircle, Siren } from "lucide-react"
import type { Evacuation, SignIn, EmployeeSignIn, Profile, Location } from "@/types/database"

interface EmployeeSignInWithJoins extends Omit<EmployeeSignIn, 'profile' | 'location'> {
  profile: Profile | null
  location: Location | null
}

export default function EvacuationsPage() {
  const [evacuations, setEvacuations] = useState<Evacuation[]>([])
  const [currentVisitors, setCurrentVisitors] = useState<SignIn[]>([])
  const [currentEmployees, setCurrentEmployees] = useState<EmployeeSignInWithJoins[]>([])
  const [activeEvacuation, setActiveEvacuation] = useState<Evacuation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [reason, setReason] = useState("")

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()

    const [{ data: evacData }, { data: visitorsData }, { data: employeesData }] = await Promise.all([
      supabase.from("evacuations").select("*, location:locations(*)").order("started_at", { ascending: false }),
      supabase.from("sign_ins").select("*, visitor:visitors(*), host:hosts(*)").is("sign_out_time", null),
      supabase.from("employee_sign_ins").select("*, profile:profiles(*), location:locations(*)").is("sign_out_time", null),
    ])

    if (evacData) {
      setEvacuations(evacData as Evacuation[])
      const active = evacData.find((e) => !e.all_clear)
      setActiveEvacuation(active || null)
    }
    if (visitorsData) setCurrentVisitors(visitorsData as SignIn[])
    if (employeesData) setCurrentEmployees(employeesData as EmployeeSignInWithJoins[])
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleStartEvacuation(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    const { data: locations } = await supabase.from("locations").select("id").limit(1)
    if (!locations || locations.length === 0) return

    await supabase.from("evacuations").insert({
      location_id: locations[0].id,
      reason: reason || null,
    })

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
                  <Label htmlFor="reason">Reason (optional)</Label>
                  <Input
                    id="reason"
                    placeholder="e.g., Fire drill, gas leak, etc."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="destructive" className="bg-destructive">
                    Confirm Evacuation
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
            <CardTitle className="flex items-center gap-2 text-destructive text-base sm:text-lg">
              <Siren className="w-5 h-5 animate-pulse" />
              EVACUATION IN PROGRESS
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Started {new Date(activeEvacuation.started_at).toLocaleString()}
              {activeEvacuation.reason && ` - ${activeEvacuation.reason}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4 sm:space-y-6">
            <div>
              <h3 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                <span className="w-3 h-3 rounded-full bg-green-500" />
                Visitors to Account For ({currentVisitors.length})
              </h3>
              {currentVisitors.length === 0 ? (
                <p className="text-muted-foreground text-sm">No visitors currently on-site</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {currentVisitors.map((visitor) => (
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
                Employees to Account For ({currentEmployees.length})
              </h3>
              {currentEmployees.length === 0 ? (
                <p className="text-muted-foreground text-sm">No employees currently on-site</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {currentEmployees.map((employee) => (
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
                Total people on-site: <span className="text-destructive">{currentVisitors.length + currentEmployees.length}</span>
              </p>
            </div>
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
                {evacuations.map((evac) => (
                  <div key={evac.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-sm">
                        {new Date(evac.started_at).toLocaleDateString()}
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
                      <span>Reason: {evac.reason || "-"}</span>
                      <span>
                        Duration: {evac.ended_at
                          ? `${Math.round((new Date(evac.ended_at).getTime() - new Date(evac.started_at).getTime()) / (1000 * 60))} min`
                          : "Ongoing"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evacuations.map((evac) => (
                      <TableRow key={evac.id}>
                        <TableCell>{new Date(evac.started_at).toLocaleString()}</TableCell>
                        <TableCell>{evac.reason || "-"}</TableCell>
                        <TableCell>
                          {evac.ended_at
                            ? `${Math.round((new Date(evac.ended_at).getTime() - new Date(evac.started_at).getTime()) / (1000 * 60))} min`
                            : "Ongoing"}
                        </TableCell>
                        <TableCell>
                          {evac.all_clear ? (
                            <Badge variant="secondary">All Clear</Badge>
                          ) : (
                            <Badge variant="destructive" className="bg-destructive text-destructive-foreground">
                              Active
                            </Badge>
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
