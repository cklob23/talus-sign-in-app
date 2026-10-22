import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCheck, Clock, AlertTriangle, Briefcase } from "lucide-react"
import { DashboardCharts } from "@/components/admin/dashboard-charts"
import { RecentVisitors } from "@/components/admin/recent-visitors"
import { DashboardMap } from "@/components/admin/dashboard-map"
import { getBrandingSettings } from "@/lib/branding"
import { startOfDayInTimezone, toIANATimezone } from "@/lib/timezone"

// Force dynamic rendering to always show fresh data
export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const branding = await getBrandingSettings()

  // Get current visitors (signed in but not signed out)
  const { count: currentVisitors } = await supabase
    .from("sign_ins")
    .select("*", { count: "exact", head: true })
    .is("sign_out_time", null)

  // Get current employees (signed in but not signed out)
  const { count: currentEmployees } = await supabase
    .from("employee_sign_ins")
    .select("*", { count: "exact", head: true })
    .is("sign_out_time", null)

  // All-locations view: "today" follows the admin display timezone, not UTC.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let displayTimezone = "UTC"
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", user.id)
      .maybeSingle()
    if (profile?.timezone) displayTimezone = profile.timezone
  }
  const todayStart = startOfDayInTimezone(toIANATimezone(displayTimezone)).toISOString()

  const { count: todayVisitors } = await supabase
    .from("sign_ins")
    .select("*", { count: "exact", head: true })
    .gte("sign_in_time", todayStart)

  const { count: todayEmployees } = await supabase
    .from("employee_sign_ins")
    .select("*", { count: "exact", head: true })
    .gte("sign_in_time", todayStart)

  // Get average visit duration (last 7 days)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const { data: recentSignIns } = await supabase
    .from("sign_ins")
    .select("sign_in_time, sign_out_time")
    .not("sign_out_time", "is", null)
    .gte("sign_in_time", weekAgo.toISOString())

  let avgDuration = 0
  if (recentSignIns && recentSignIns.length > 0) {
    const durations = recentSignIns.map((s) => {
      const inTime = new Date(s.sign_in_time).getTime()
      const outTime = new Date(s.sign_out_time!).getTime()
      return (outTime - inTime) / (1000 * 60) // minutes
    })
    avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
  }

  // Get pending bookings
  const { count: pendingBookings } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
    .gte("expected_arrival", new Date().toISOString())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-24 font-bold sm:text-32">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">Overview of visitor activity at {branding.companyName} facilities</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-13 font-medium text-muted-foreground">On site now</CardTitle>
            <Users className="hidden h-5 w-5 text-muted-foreground sm:block" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
            <div className="text-32 font-bold tracking-tight">{(currentVisitors || 0) + (currentEmployees || 0)}</div>
            <p className="text-13 text-muted-foreground">{currentVisitors || 0} visitors, {currentEmployees || 0} staff</p>
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-13 font-medium text-muted-foreground">Signed in today</CardTitle>
            <UserCheck className="hidden h-5 w-5 text-muted-foreground sm:block" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
            <div className="text-32 font-bold tracking-tight">{(todayVisitors || 0) + (todayEmployees || 0)}</div>
            <p className="text-13 text-muted-foreground">{todayVisitors || 0} visitors, {todayEmployees || 0} staff</p>
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-13 font-medium text-muted-foreground">Staff on site</CardTitle>
            <Briefcase className="hidden h-5 w-5 text-muted-foreground sm:block" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
            <div className="text-32 font-bold tracking-tight">{currentEmployees || 0}</div>
            <p className="text-13 text-muted-foreground">Employees signed in</p>
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-13 font-medium text-muted-foreground">Avg. duration</CardTitle>
            <Clock className="hidden h-5 w-5 text-muted-foreground sm:block" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
            <div className="text-32 font-bold tracking-tight">{avgDuration} min</div>
            <p className="text-13 text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>

        <Card className="col-span-2 p-0 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-13 font-medium text-muted-foreground">Expected today</CardTitle>
            <AlertTriangle className="hidden h-5 w-5 text-muted-foreground sm:block" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
            <div className="text-32 font-bold tracking-tight">{pendingBookings || 0}</div>
            <p className="text-13 text-muted-foreground">Bookings not here yet</p>
          </CardContent>
        </Card>
      </div>

      <RecentVisitors />

      <DashboardMap />

      <DashboardCharts />
    </div>
  )
}
