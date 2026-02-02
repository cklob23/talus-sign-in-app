"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Download, Search, Users, Briefcase, User } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { SignIn, EmployeeSignIn, Profile, Location } from "@/types/database"
import { formatDateTime as formatDateTimeTz, formatDuration as formatDurationUtil } from "@/lib/timezone"

// Use Omit to override the profile and location types from the base EmployeeSignIn
interface EmployeeSignInWithJoins extends Omit<EmployeeSignIn, 'profile' | 'location'> {
  profile: Profile | null
  location: Location | null
}

interface EmployeeSignInWithProfile extends EmployeeSignInWithJoins {
  profile: Profile | null
}

export function HistoryContent() {
  const [signIns, setSignIns] = useState<SignIn[]>([])
  const [employeeSignIns, setEmployeeSignIns] = useState<EmployeeSignInWithJoins[]>([])
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("all")

  async function loadHistory() {
    setIsLoading(true)
    const supabase = createClient()
    
    // Load visitor sign-ins
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
      .order("sign_in_time", { ascending: false })
      .limit(100)

    // Load employee sign-ins
    const { data: employeeData } = await supabase
      .from("employee_sign_ins")
      .select(
        `
        *,
        profile:profiles(*),
        location:locations(*)
      `,
      )
      .order("sign_in_time", { ascending: false })
      .limit(100)

    if (visitorData) setSignIns(visitorData as SignIn[])
    if (employeeData) setEmployeeSignIns(employeeData as EmployeeSignInWithJoins[])
    setIsLoading(false)
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const filteredSignIns = signIns.filter((signIn) => {
    const searchLower = search.toLowerCase()
    return (
      signIn.visitor?.first_name?.toLowerCase().includes(searchLower) ||
      signIn.visitor?.last_name?.toLowerCase().includes(searchLower) ||
      signIn.visitor?.company?.toLowerCase().includes(searchLower) ||
      signIn.host?.name?.toLowerCase().includes(searchLower)
    )
  })

  const filteredEmployeeSignIns = employeeSignIns.filter((signIn) => {
    const searchLower = search.toLowerCase()
    return (
      signIn.profile?.full_name?.toLowerCase().includes(searchLower) ||
      signIn.profile?.email?.toLowerCase().includes(searchLower) ||
      signIn.location?.name?.toLowerCase().includes(searchLower)
    )
  })

  // Format datetime using location timezone (defaults to UTC if no location)
  function formatDateTimeLocal(dateStr: string, location: Location | null | undefined) {
    const timezone = location?.timezone || "UTC"
    return formatDateTimeTz(dateStr, timezone)
  }

  function getDuration(signIn: SignIn | EmployeeSignInWithJoins) {
    return formatDurationUtil(signIn.sign_in_time, signIn.sign_out_time)
  }

  function handleExport() {
    if (activeTab === "employees") {
      const csv = [
        ["Name", "Email", "Role", "Location", "Sign In", "Sign Out", "Duration", "Auto Sign-In"],
        ...filteredEmployeeSignIns.map((s) => [
          s.profile?.full_name || "",
          s.profile?.email || "",
          s.profile?.role || "",
          s.location?.name || "",
          s.sign_in_time,
          s.sign_out_time || "",
          getDuration(s),
          s.auto_signed_in ? "Yes" : "No",
        ]),
      ]
        .map((row) => row.join(","))
        .join("\n")

      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `employee-history-${new Date().toISOString().split("T")[0]}.csv`
      a.click()
    } else {
      const csv = [
        ["Name", "Email", "Company", "Type", "Location", "Host", "Sign In", "Sign Out", "Duration"],
        ...filteredSignIns.map((s) => [
          `${s.visitor?.first_name} ${s.visitor?.last_name}`,
          s.visitor?.email || "",
          s.visitor?.company || "",
          s.visitor_type?.name || "",
          s.location?.name || "",
          s.host?.name || "",
          s.sign_in_time,
          s.sign_out_time || "",
          getDuration(s),
        ]),
      ]
        .map((row) => row.join(","))
        .join("\n")

      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `visitor-history-${new Date().toISOString().split("T")[0]}.csv`
      a.click()
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Visitor History</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Complete log of all visitor sign-ins</p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm" className="w-fit bg-transparent">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 w-fit">
          <TabsTrigger value="all" className="flex items-center gap-2 text-xs sm:text-sm">
            <Users className="w-4 h-4" />
            Visitors ({filteredSignIns.length})
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-2 text-xs sm:text-sm">
            <Briefcase className="w-4 h-4" />
            Employees ({filteredEmployeeSignIns.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg">Visitor Sign-In Records</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Showing last 100 visitor records</CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search visitors..."
                    value={search}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : filteredSignIns.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No visitor records found</p>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="space-y-3 md:hidden">
                    {filteredSignIns.map((signIn) => (
                      <div key={signIn.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-3">
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
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Location: {signIn.location?.name || "-"}</span>
                          <span>Host: {signIn.host?.name || "-"}</span>
                          <span>In: {formatDateTimeLocal(signIn.sign_in_time, signIn.location)}</span>
                          <span>Out: {signIn.sign_out_time ? formatDateTimeLocal(signIn.sign_out_time, signIn.location) : "-"}</span>
                        </div>
                        <Badge variant={signIn.sign_out_time ? "secondary" : "default"} className="text-xs">
                          {getDuration(signIn)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table view */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Visitor</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Host</TableHead>
                          <TableHead>Sign In</TableHead>
                          <TableHead>Sign Out</TableHead>
                          <TableHead>Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSignIns.map((signIn) => (
                          <TableRow key={signIn.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarImage src={signIn.visitor?.photo_url || undefined} alt={`${signIn.visitor?.first_name} ${signIn.visitor?.last_name}`} />
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                    {signIn.visitor?.first_name?.[0]}{signIn.visitor?.last_name?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <p className="font-medium">
                                  {signIn.visitor?.first_name} {signIn.visitor?.last_name}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>{signIn.visitor?.company || "-"}</TableCell>
                            <TableCell>
                              {signIn.visitor_type && (
                                <Badge
                                  variant="outline"
                                  style={{
                                    borderColor: signIn.visitor_type.badge_color,
                                    color: signIn.visitor_type.badge_color,
                                  }}
                                >
                                  {signIn.visitor_type.name}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{signIn.location?.name || "-"}</TableCell>
                            <TableCell>{signIn.host?.name || "-"}</TableCell>
                            <TableCell>{formatDateTimeLocal(signIn.sign_in_time, signIn.location)}</TableCell>
                            <TableCell>{signIn.sign_out_time ? formatDateTimeLocal(signIn.sign_out_time, signIn.location) : "-"}</TableCell>
                            <TableCell>
                              <Badge variant={signIn.sign_out_time ? "secondary" : "default"}>{getDuration(signIn)}</Badge>
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

        <TabsContent value="employees">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg">Employee Sign-In Records</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Showing last 100 employee records</CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employees..."
                    value={search}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : filteredEmployeeSignIns.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No employee records found</p>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="space-y-3 md:hidden">
                    {filteredEmployeeSignIns.map((signIn) => (
                      <div key={signIn.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-3">
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
                              <Badge variant="outline" className="capitalize text-xs shrink-0">
                                {signIn.profile?.role || "-"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Location: {signIn.location?.name || "-"}</span>
                          <span>In: {formatDateTimeLocal(signIn.sign_in_time, signIn.location)}</span>
                          <span>Out: {signIn.sign_out_time ? formatDateTimeLocal(signIn.sign_out_time, signIn.location) : "-"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={signIn.sign_out_time ? "secondary" : "default"} className="text-xs">
                            {getDuration(signIn)}
                          </Badge>
                          {signIn.auto_signed_in && (
                            <Badge variant="secondary" className="text-xs">Auto</Badge>
                          )}
                        </div>
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
                          <TableHead>Sign In</TableHead>
                          <TableHead>Sign Out</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Auto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEmployeeSignIns.map((signIn) => (
                          <TableRow key={signIn.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarImage src={signIn.profile?.avatar_url || undefined} alt={signIn.profile?.full_name || "Employee"} />
                                  <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                                    {signIn.profile?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <p className="font-medium">{signIn.profile?.full_name || "Unknown"}</p>
                              </div>
                            </TableCell>
                            <TableCell>{signIn.profile?.email || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {signIn.profile?.role || "-"}
                              </Badge>
                            </TableCell>
                            <TableCell>{signIn.location?.name || "-"}</TableCell>
                            <TableCell>{formatDateTimeLocal(signIn.sign_in_time, signIn.location)}</TableCell>
                            <TableCell>{signIn.sign_out_time ? formatDateTimeLocal(signIn.sign_out_time, signIn.location) : "-"}</TableCell>
                            <TableCell>
                              <Badge variant={signIn.sign_out_time ? "secondary" : "default"}>{getDuration(signIn)}</Badge>
                            </TableCell>
                            <TableCell>
                              {signIn.auto_signed_in ? (
                                <Badge variant="secondary">Auto</Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
