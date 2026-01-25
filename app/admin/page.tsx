import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCheck, Clock, AlertTriangle, Briefcase } from "lucide-react"
import { DashboardCharts } from "@/components/admin/dashboard-charts"
import { RecentVisitors } from "@/components/admin/recent-visitors"

export default async function AdminDashboardPage() {
  const supabase = await createClient()

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

  // Get today's total sign-ins (visitors)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { count: todayVisitors } = await supabase
    .from("sign_ins")
    .select("*", { count: "exact", head: true })
    .gte("sign_in_time", today.toISOString())

  // Get today's employee sign-ins
  const { count: todayEmployees } = await supabase
    .from("employee_sign_ins")
    .select("*", { count: "exact", head: true })
    .gte("sign_in_time", today.toISOString())

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
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Overview of visitor activity at Talus facilities</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Current Visitors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{currentVisitors || 0}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">On-site right now</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Current Employees</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{currentEmployees || 0}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">Employees on-site</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Today{"'"}s Sign-Ins</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{(todayVisitors || 0) + (todayEmployees || 0)}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">{todayVisitors || 0} visitors, {todayEmployees || 0} employees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Avg. Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{avgDuration} min</div>
            <p className="text-xs text-muted-foreground hidden sm:block">Last 7 days</p>
          </CardContent>
        </Card>

        <Card className="col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Pending Bookings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{pendingBookings || 0}</div>
            <p className="text-xs text-muted-foreground hidden sm:block">Upcoming visits</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <DashboardCharts />
        <RecentVisitors />
      </div>
    </div>
  )
}
