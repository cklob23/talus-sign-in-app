"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LogOut, RefreshCw, Users, Briefcase } from "lucide-react"
import type { SignIn, EmployeeSignIn, Profile, Location } from "@/types/database"

interface EmployeeSignInWithJoins extends Omit<EmployeeSignIn, 'profile' | 'location'> {
  profile: Profile | null
  location: Location | null
}

export default function CurrentVisitorsPage() {
  const [visitors, setVisitors] = useState<SignIn[]>([])
  const [employees, setEmployees] = useState<EmployeeSignInWithJoins[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("visitors")

  async function loadData() {
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

    // Load current employees
    const { data: employeeData } = await supabase
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
    await supabase.from("sign_ins").update({ sign_out_time: new Date().toISOString() }).eq("id", signInId)
    loadData()
  }

  async function handleEmployeeSignOut(signInId: string) {
    const supabase = createClient()
    await supabase.from("employee_sign_ins").update({ sign_out_time: new Date().toISOString() }).eq("id", signInId)
    loadData()
  }

  function formatDuration(signInTime: string) {
    const mins = Math.floor((Date.now() - new Date(signInTime).getTime()) / (1000 * 60))
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
  }

  function handleSignOut(signInId: string) {
    // Determine if the sign-in is for a visitor or an employee
    const visitor = visitors.find(v => v.id === signInId)
    if (visitor) {
      handleVisitorSignOut(signInId)
    } else {
      handleEmployeeSignOut(signInId)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Currently On-Site</h1>
          <p className="text-muted-foreground">
            {visitors.length} visitor(s) and {employees.length} employee(s) currently on-site
          </p>
        </div>
        <Button onClick={loadData} variant="outline" disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="visitors" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Visitors ({visitors.length})
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Employees ({employees.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visitors" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>On-Site Visitors</CardTitle>
              <CardDescription>{visitors.length} visitor(s) currently signed in</CardDescription>
            </CardHeader>
            <CardContent>
              {visitors.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No visitors currently on-site</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Visitor</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead>Badge</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visitors.map((signIn) => (
                      <TableRow key={signIn.id}>
                        <TableCell className="font-medium">
                          {signIn.visitor?.first_name} {signIn.visitor?.last_name}
                          {signIn.visitor?.email && (
                            <span className="block text-xs text-muted-foreground">{signIn.visitor.email}</span>
                          )}
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
                        <TableCell className="font-mono">{signIn.badge_number}</TableCell>
                        <TableCell>{formatDuration(signIn.sign_in_time)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleVisitorSignOut(signIn.id)}>
                            <LogOut className="w-4 h-4 mr-1" />
                            Sign Out
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>On-Site Employees</CardTitle>
              <CardDescription>{employees.length} employee(s) currently signed in</CardDescription>
            </CardHeader>
            <CardContent>
              {employees.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No employees currently on-site</p>
              ) : (
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
                        <TableCell className="font-medium">
                          {signIn.profile?.full_name || "Unknown"}
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
                          <Button variant="outline" size="sm" onClick={() => handleEmployeeSignOut(signIn.id)}>
                            <LogOut className="w-4 h-4 mr-1" />
                            Sign Out
                          </Button>
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
