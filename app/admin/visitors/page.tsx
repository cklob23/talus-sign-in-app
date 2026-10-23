"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LogOut, RefreshCw, Users, Briefcase, User, Printer, MoreHorizontal } from "lucide-react"
import { AdminLoadError } from "@/components/admin/load-error"
import { notifyError, notifySuccess } from "@/hooks/admin-notify"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { SignIn, EmployeeSignIn, Profile, Location } from "@/types/database"
import { printVisitorBadge } from "@/lib/print-badge"
import { SignInDetailBlade, type SignInRecord } from "@/components/admin/sign-in-detail-blade"
import { useTimezone } from "@/contexts/timezone-context"

interface EmployeeSignInWithJoins extends Omit<EmployeeSignIn, 'profile' | 'location'> {
  profile: Profile | null
  location: Location | null
}

export default function CurrentVisitorsPage() {
  const [visitors, setVisitors] = useState<SignIn[]>([])
  const [employees, setEmployees] = useState<EmployeeSignInWithJoins[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("visitors")
  const [bladeRecord, setBladeRecord] = useState<SignInRecord | null>(null)
  const [isBladeOpen, setIsBladeOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState<{ kind: "visitor" | "employee"; id: string; name: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { timezone: userTimezone } = useTimezone()

  function openBlade(record: SignInRecord) {
    setBladeRecord(record)
    setIsBladeOpen(true)
  }

  function handleBladeSignOut(record: SignInRecord) {
    const name = record.kind === "visitor"
      ? `${record.data.visitor?.first_name || ""} ${record.data.visitor?.last_name || ""}`.trim() || "this visitor"
      : record.data.profile?.full_name || "this employee"
    setConfirmSignOut({ kind: record.kind, id: record.data.id, name })
  }

  async function loadData() {
    setIsLoading(true)
    setLoadError(null)
    const supabase = createClient()

    const { data: visitorData, error: visitorError } = await supabase
      .from("sign_ins")
      .select(
        `
        *,
        visitor:visitors(*),
        host:hosts(*),
        visitor_type:visitor_types(*),
        location:locations(*)
      `,
      )
      .is("sign_out_time", null)
      .order("sign_in_time", { ascending: false })

    const { data: employeeData, error: employeeError } = await supabase
      .from("employee_sign_ins")
      .select(
        `
        *,
        profile:profiles(*),
        location:locations(*)
      `,
      )
      .is("sign_out_time", null)
      .order("sign_in_time", { ascending: false })

    if (visitorError || employeeError) {
      setLoadError(visitorError?.message || employeeError?.message || "Could not load people on site.")
      setIsLoading(false)
      return
    }

    if (visitorData) setVisitors(visitorData as SignIn[])
    if (employeeData) setEmployees(employeeData as EmployeeSignInWithJoins[])
    setIsLoading(false)
  }

  async function loadVisitors() {
    setIsLoading(true)
    const supabase = createClient()

    // Load current visitors
    const { data: visitorData } = await supabase
      .from("sign_ins")
      .select(
        `
        *,
        visitor:visitors(*),
        host:hosts(*),
        visitor_type:visitor_types(*),
        location:locations(*)
      `,
      )
      .is("sign_out_time", null)
      .order("sign_in_time", { ascending: false })

    if (visitorData) setVisitors(visitorData as SignIn[])
    setIsLoading(false)
  }

  async function handleVisitorSignOut(signInId: string) {
    const supabase = createClient()
    const { error } = await supabase.from("sign_ins").update({ sign_out_time: new Date().toISOString() }).eq("id", signInId)
    if (error) {
      notifyError("Could not sign out visitor", error.message)
      return
    }
    notifySuccess("Visitor signed out")
    loadData()
  }

  async function handleEmployeeSignOut(signInId: string) {
    const supabase = createClient()
    const { error } = await supabase.from("employee_sign_ins").update({ sign_out_time: new Date().toISOString() }).eq("id", signInId)
    if (error) {
      notifyError("Could not sign out employee", error.message)
      return
    }
    notifySuccess("Employee signed out")
    loadData()
  }

  function formatDuration(signInTime: string) {
    const mins = Math.floor((Date.now() - new Date(signInTime).getTime()) / (1000 * 60))
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
  }

  function requestVisitorSignOut(signInId: string, name: string) {
    setConfirmSignOut({ kind: "visitor", id: signInId, name })
  }

  function requestEmployeeSignOut(signInId: string, name: string) {
    setConfirmSignOut({ kind: "employee", id: signInId, name })
  }

  function confirmPendingSignOut() {
    if (!confirmSignOut) return
    if (confirmSignOut.kind === "visitor") handleVisitorSignOut(confirmSignOut.id)
    else handleEmployeeSignOut(confirmSignOut.id)
    setConfirmSignOut(null)
    setIsBladeOpen(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Currently On-Site</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {visitors.length} visitor(s) and {employees.length} employee(s) currently on-site
          </p>
        </div>
        <Button onClick={loadData} variant="outline" disabled={isLoading} size="sm" className="w-fit bg-transparent">
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-fit">
          <TabsTrigger value="visitors" className="flex items-center gap-2 text-xs sm:text-sm">
            <Users className="w-4 h-4" />
            Visitors ({visitors.length})
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-2 text-xs sm:text-sm">
            <Briefcase className="w-4 h-4" />
            Employees ({employees.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visitors" className="mt-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">On-Site Visitors</CardTitle>
              <CardDescription className="text-xs sm:text-sm">{visitors.length} visitor(s) currently signed in</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {loadError ? (
                <AdminLoadError title="Could not load current visitors" detail={loadError} onRetry={loadData} />
              ) : visitors.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-muted-foreground">No visitors currently on-site</p>
                  <p className="mt-1 text-sm text-muted-foreground">New sign-ins will show up here.</p>
                </div>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="space-y-3 md:hidden">
                    {visitors.map((signIn) => (
                      <div key={signIn.id} className="border rounded-lg p-3 space-y-2">
                        <button
                          type="button"
                          onClick={() => openBlade({ kind: "visitor", data: signIn })}
                          className="flex w-full items-start gap-3 text-left"
                        >
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarImage src={signIn.visitor?.photo_url || undefined} alt={`${signIn.visitor?.first_name} ${signIn.visitor?.last_name}`} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {signIn.visitor?.first_name?.[0]}{signIn.visitor?.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {signIn.visitor?.first_name} {signIn.visitor?.last_name}
                                </p>
                                {signIn.visitor?.company && (
                                  <p className="text-xs text-muted-foreground truncate">{signIn.visitor.company}</p>
                                )}
                              </div>
                              {signIn.visitor_type && (
                                <Badge
                                  variant="outline"
                                  className="text-xs shrink-0"
                                  style={{
                                    borderColor: signIn.visitor_type.badge_color,
                                    color: signIn.visitor_type.badge_color,
                                  }}
                                >
                                  {signIn.visitor_type.name}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </button>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Location: {signIn.location?.name || "-"}</span>
                          <span>Host: {signIn.host?.name || "-"}</span>
                          <span>Badge: {signIn.badge_number}</span>
                          <span>Duration: {formatDuration(signIn.sign_in_time)}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 bg-transparent"
                            onClick={() =>
                              printVisitorBadge({
                                visitorName: `${signIn.visitor?.first_name || ""} ${signIn.visitor?.last_name || ""}`.trim(),
                                visitorEmail: signIn.visitor?.email || undefined,
                                visitorCompany: signIn.visitor?.company || undefined,
                                visitorType: signIn.visitor_type?.name || undefined,
                                badgeNumber: signIn.badge_number || "N/A",
                                locationName: signIn.location?.name || undefined,
                                photoUrl: signIn.visitor?.photo_url || undefined,
                              })
                            }
                          >
                            <Printer className="w-4 h-4 mr-1" />
                            Print Badge
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1 bg-transparent" onClick={() => requestVisitorSignOut(signIn.id, `${signIn.visitor?.first_name || ""} ${signIn.visitor?.last_name || ""}`.trim() || "this visitor")}>
                            <LogOut className="w-4 h-4 mr-1" />
                            Sign Out
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <VisitorDesktopTable
                    visitors={visitors}
                    formatDuration={formatDuration}
                    openBlade={openBlade}
                    requestVisitorSignOut={requestVisitorSignOut}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees" className="mt-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">On-Site Employees</CardTitle>
              <CardDescription className="text-xs sm:text-sm">{employees.length} employee(s) currently signed in</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {loadError ? (
                <AdminLoadError title="Could not load current employees" detail={loadError} onRetry={loadData} />
              ) : employees.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-muted-foreground">No employees currently on-site</p>
                </div>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="space-y-3 md:hidden">
                    {employees.map((signIn) => (
                      <div key={signIn.id} className="border rounded-lg p-3 space-y-2">
                        <button
                          type="button"
                          onClick={() => openBlade({ kind: "employee", data: signIn })}
                          className="flex w-full items-start gap-3 text-left"
                        >
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarImage src={signIn.profile?.avatar_url || undefined} alt={signIn.profile?.full_name || "Employee"} />
                            <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                              {signIn.profile?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{signIn.profile?.full_name || "Unknown"}</p>
                                <p className="text-xs text-muted-foreground truncate">{signIn.profile?.email || "-"}</p>
                              </div>
                              <Badge variant="outline" className="capitalize border-blue-500 text-blue-500 text-xs shrink-0">
                                {signIn.profile?.role || "-"}
                              </Badge>
                            </div>
                          </div>
                        </button>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Location: {signIn.location?.name || "-"}</span>
                          <span>Duration: {formatDuration(signIn.sign_in_time)}</span>
                          <span>{signIn.auto_signed_in ? "Auto" : "Manual"}</span>
                        </div>
                        <Button variant="outline" size="sm" className="w-full bg-transparent" onClick={() => requestEmployeeSignOut(signIn.id, signIn.profile?.full_name || "this employee")}>
                          <LogOut className="w-4 h-4 mr-1" />
                          Sign Out
                        </Button>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table view */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Auto Sign-In</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employees.map((signIn) => (
                          <TableRow key={signIn.id}>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => openBlade({ kind: "employee", data: signIn })}
                                className="flex items-center gap-3 rounded-md text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <Avatar className="h-9 w-9">
                                  <AvatarImage src={signIn.profile?.avatar_url || undefined} alt={signIn.profile?.full_name || "Employee"} />
                                  <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                                    {signIn.profile?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <p className="font-medium">{signIn.profile?.full_name || "Unknown"}</p>
                              </button>
                            </TableCell>
                            <TableCell>{signIn.profile?.email || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize border-blue-500 text-blue-500">
                                {signIn.profile?.role || "-"}
                              </Badge>
                            </TableCell>
                            <TableCell>{signIn.location?.name || "-"}</TableCell>
                            <TableCell>{formatDuration(signIn.sign_in_time)}</TableCell>
                            <TableCell>
                              {signIn.auto_signed_in ? (
                                <Badge variant="secondary">Auto</Badge>
                              ) : (
                                <span className="text-muted-foreground">Manual</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => requestEmployeeSignOut(signIn.id, signIn.profile?.full_name || "this employee")}>
                                <LogOut className="w-4 h-4 mr-1" />
                                Sign Out
                              </Button>
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
        </TabsContent>
      </Tabs>

      <SignInDetailBlade
        record={bladeRecord}
        open={isBladeOpen}
        onOpenChange={setIsBladeOpen}
        timezone={userTimezone}
        canSignOut
        canReprint
        onSignOut={handleBladeSignOut}
      />

      <AlertDialog open={!!confirmSignOut} onOpenChange={(open) => { if (!open) setConfirmSignOut(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out {confirmSignOut?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This ends their current visit. They will no longer appear on the on-site list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingSignOut}>Sign Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function VisitorDesktopTable({
  visitors,
  formatDuration,
  openBlade,
  requestVisitorSignOut,
}: {
  visitors: SignIn[]
  formatDuration: (signInTime: string) => string
  openBlade: (record: SignInRecord) => void
  requestVisitorSignOut: (id: string, name: string) => void
}) {
  const locationIds = new Set(visitors.map((signIn) => signIn.location?.id || signIn.location_id).filter(Boolean))
  const showLocation = locationIds.size > 1

  return (
    <div className="hidden md:block">
      <Table className="w-full table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">Visitor</TableHead>
            <TableHead className="w-[16%]">Company</TableHead>
            <TableHead className="w-[12%]">Type</TableHead>
            {showLocation ? <TableHead className="w-[12%]">Location</TableHead> : null}
            <TableHead className="w-[14%]">Host</TableHead>
            <TableHead className="w-[10%]">Badge</TableHead>
            <TableHead className="w-[8%]">In</TableHead>
            <TableHead className="w-[160px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visitors.map((signIn) => {
            const name = `${signIn.visitor?.first_name || ""} ${signIn.visitor?.last_name || ""}`.trim() || "this visitor"
            return (
              <TableRow key={signIn.id}>
                <TableCell className="align-top">
                  <button
                    type="button"
                    onClick={() => openBlade({ kind: "visitor", data: signIn })}
                    className="flex min-w-0 items-center gap-3 rounded-md text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={signIn.visitor?.photo_url || undefined} alt={name} />
                      <AvatarFallback className="bg-primary/10 text-xs text-[#00703f]">
                        {signIn.visitor?.first_name?.[0]}{signIn.visitor?.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{name}</p>
                      {signIn.visitor?.email ? (
                        <p className="truncate text-xs text-muted-foreground">{signIn.visitor.email}</p>
                      ) : null}
                    </div>
                  </button>
                </TableCell>
                <TableCell className="truncate align-top">{signIn.visitor?.company || "-"}</TableCell>
                <TableCell className="align-top">
                  {signIn.visitor_type ? (
                    <Badge
                      variant="outline"
                      className="max-w-full truncate text-[#00703f]"
                      style={{ borderColor: signIn.visitor_type.badge_color }}
                    >
                      {signIn.visitor_type.name}
                    </Badge>
                  ) : null}
                </TableCell>
                {showLocation ? <TableCell className="truncate align-top">{signIn.location?.name || "-"}</TableCell> : null}
                <TableCell className="truncate align-top">{signIn.host?.name || "-"}</TableCell>
                <TableCell className="align-top font-mono text-sm">{signIn.badge_number}</TableCell>
                <TableCell className="align-top">{formatDuration(signIn.sign_in_time)}</TableCell>
                <TableCell className="align-top text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => requestVisitorSignOut(signIn.id, name)}
                    >
                      <LogOut className="mr-1 h-4 w-4" />
                      Sign out
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="min-h-11 min-w-11" aria-label="More actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            printVisitorBadge({
                              visitorName: name,
                              visitorEmail: signIn.visitor?.email || undefined,
                              visitorCompany: signIn.visitor?.company || undefined,
                              visitorType: signIn.visitor_type?.name || undefined,
                              badgeNumber: signIn.badge_number || "N/A",
                              locationName: signIn.location?.name || undefined,
                              photoUrl: signIn.visitor?.photo_url || undefined,
                            })
                          }
                        >
                          <Printer className="mr-2 h-4 w-4" />
                          Print badge
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
