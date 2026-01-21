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
import { Download, Search, Users, Briefcase } from "lucide-react"
import type { SignIn, EmployeeSignIn, Profile, Location } from "@/types/database"

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

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function formatDuration(signIn: SignIn | EmployeeSignInWithJoins) {
    if (!signIn.sign_out_time) return "Active"
    const mins = Math.floor(
      (new Date(signIn.sign_out_time).getTime() - new Date(signIn.sign_in_time).getTime()) / (1000 * 60),
    )
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
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
          formatDuration(s),
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
        ["Name", "Email", "Company", "Type", "Host", "Sign In", "Sign Out", "Duration"],
        ...filteredSignIns.map((s) => [
          `${s.visitor?.first_name} ${s.visitor?.last_name}`,
          s.visitor?.email || "",
          s.visitor?.company || "",
          s.visitor_type?.name || "",
          s.host?.name || "",
          s.sign_in_time,
          s.sign_out_time || "",
          formatDuration(s),
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Visitor History</h1>
          <p className="text-muted-foreground">Complete log of all visitor sign-ins</p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Visitors ({filteredSignIns.length})
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Employees ({filteredEmployeeSignIns.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Visitor Sign-In Records</CardTitle>
                  <CardDescription>Showing last 100 visitor records</CardDescription>
                </div>
                <div className="relative w-64">
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
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : filteredSignIns.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No visitor records found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Visitor</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead>Sign In</TableHead>
                      <TableHead>Sign Out</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSignIns.map((signIn) => (
                      <TableRow key={signIn.id}>
                        <TableCell className="font-medium">
                          {signIn.visitor?.first_name} {signIn.visitor?.last_name}
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
                        <TableCell>{signIn.host?.name || "-"}</TableCell>
                        <TableCell>{formatDateTime(signIn.sign_in_time)}</TableCell>
                        <TableCell>{signIn.sign_out_time ? formatDateTime(signIn.sign_out_time) : "-"}</TableCell>
                        <TableCell>
                          <Badge variant={signIn.sign_out_time ? "secondary" : "default"}>{formatDuration(signIn)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Employee Sign-In Records</CardTitle>
                  <CardDescription>Showing last 100 employee records</CardDescription>
                </div>
                <div className="relative w-64">
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
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : filteredEmployeeSignIns.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No employee records found</p>
              ) : (
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
                        <TableCell className="font-medium">
                          {signIn.profile?.full_name || "Unknown"}
                        </TableCell>
                        <TableCell>{signIn.profile?.email || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {signIn.profile?.role || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell>{signIn.location?.name || "-"}</TableCell>
                        <TableCell>{formatDateTime(signIn.sign_in_time)}</TableCell>
                        <TableCell>{signIn.sign_out_time ? formatDateTime(signIn.sign_out_time) : "-"}</TableCell>
                        <TableCell>
                          <Badge variant={signIn.sign_out_time ? "secondary" : "default"}>{formatDuration(signIn)}</Badge>
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
