import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCheck, Clock, AlertTriangle } from "lucide-react"
import { DashboardCharts } from "@/components/admin/dashboard-charts"
import { RecentVisitors } from "@/components/admin/recent-visitors"

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  // Get current visitors (signed in but not signed out)
  const { count: currentVisitors } = await supabase
    .from("sign_ins")
    .select("*", { count: "exact", head: true })
    .is("sign_out_time", null)

  // Get today's total sign-ins
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { count: todayVisitors } = await supabase
    .from("sign_ins")
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of visitor activity at TalusAg facilities</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Visitors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentVisitors || 0}</div>
            <p className="text-xs text-muted-foreground">On-site right now</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today{"'"}s Sign-Ins</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayVisitors || 0}</div>
            <p className="text-xs text-muted-foreground">Total visits today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Visit Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgDuration} min</div>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Bookings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingBookings || 0}</div>
            <p className="text-xs text-muted-foreground">Upcoming visits</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <DashboardCharts />
        <RecentVisitors />
      </div>
    </div>
  )
}
