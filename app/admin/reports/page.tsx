"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Pie, PieChart, Cell, Legend } from "recharts"
import { Download, Users, Briefcase, MapPin, Calendar, Clock, Building2, TrendingUp, LogOut, ClipboardList, ChevronRight } from "lucide-react"
import Link from "next/link"
import { formatFullDateTime } from "@/lib/timezone"

interface ReportData {
  // Visitor metrics
  totalVisitors: number
  uniqueVisitors: number
  avgVisitorDuration: number
  visitorSignOutRate: number
  byType: { name: string; count: number; color: string }[]
  byHost: { name: string; count: number }[]
  byCompany: { name: string; count: number }[]
  visitorsByDay: { day: string; count: number }[]
  rawSignIns: Array<{
    sign_in_time: string
    sign_out_time: string | null
    visitor: { first_name: string; last_name: string; email: string; company: string } | null
    host: { name: string } | null
    visitor_type: { name: string } | null
    location?: { name: string } | null
  }>
  // Employee metrics
  totalEmployeeSignIns: number
  uniqueEmployees: number
  avgEmployeeDuration: number
  employeeSignOutRate: number
  employeesByDay: { day: string; count: number }[]
  autoSignInCount: number
  manualSignInCount: number
  rawEmployeeSignIns: Array<{
    sign_in_time: string
    sign_out_time: string | null
    auto_signed_in: boolean
    profile: { full_name: string; email: string; role: string } | null
    location?: { name: string } | null
  }>
  // Location metrics
  byLocation: { name: string; visitors: number; employees: number; total: number }[]
  // Booking metrics
  totalBookings: number
  checkedInBookings: number
  pendingBookings: number
  cancelledBookings: number
  noShowBookings: number
  bookingCheckInRate: number
  rawBookings: Array<{
    expected_arrival: string
    visitor_first_name: string
    visitor_last_name: string
    visitor_company: string | null
    status: string
    host?: { name: string } | null
    location?: { name: string } | null
  }>
  // Peak hours
  peakHours: { hour: string; count: number }[]
  busiestHour: string
  // Combined totals
  totalSignIns: number
  combinedByDay: { day: string; visitors: number; employees: number }[]
}

// Theme-aware chart colors
const chartColors = {
  light: {
    primary: "#16a34a", // green-600
    secondary: "#3b82f6", // blue-500
    tertiary: "#f59e0b", // amber-500
    quaternary: "#8b5cf6", // violet-500
    success: "#22c55e", // green-500
    danger: "#ef4444", // red-500
    warning: "#f59e0b", // amber-500
    muted: "#9ca3af", // gray-400
    axis: "#6b7280", // gray-500
    tooltip: { bg: "#ffffff", border: "#e5e7eb" },
  },
  dark: {
    primary: "#22c55e", // green-500
    secondary: "#60a5fa", // blue-400
    tertiary: "#fbbf24", // amber-400
    quaternary: "#a78bfa", // violet-400
    success: "#4ade80", // green-400
    danger: "#f87171", // red-400
    warning: "#fbbf24", // amber-400
    muted: "#6b7280", // gray-500
    axis: "#9ca3af", // gray-400
    tooltip: { bg: "#1f2937", border: "#374151" },
  },
}

export default function ReportsPage() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [period, setPeriod] = useState("7")
  const [data, setData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const colors = chartColors[resolvedTheme === "dark" ? "dark" : "light"]

  useEffect(() => {
    setMounted(true)
  }, [])

  const getPeriodLabel = (p: string) => {
    switch (p) {
      case "1": return "Last 24 hours"
      case "7": return "Last 7 days"
      case "14": return "Last 14 days"
      case "30": return "Last 30 days"
      case "90": return "Last 90 days"
      default: return `Last ${p} days`
    }
  }

  function exportReportCSV() {
    if (!data) return

    const periodLabel = getPeriodLabel(period)
    
    // Create CSV content with summary and detailed data (all times in UTC)
    const csvContent = [
      // Summary section
      [`Sign-In Report - ${periodLabel}`],
      [`Generated: ${formatFullDateTime(new Date().toISOString(), "UTC")} (UTC)`],
      [],
      ["=== COMBINED SUMMARY ==="],
      ["Total Sign-Ins (Visitors + Employees)", data.totalSignIns],
      ["Busiest Hour", data.busiestHour],
      [],
      ["=== BY LOCATION ==="],
      ["Location", "Visitors", "Employees", "Total"],
      ...data.byLocation.map(l => [l.name, l.visitors, l.employees, l.total]),
      [],
      ["=== VISITOR SUMMARY ==="],
      ["Total Visitor Sign-Ins", data.totalVisitors],
      ["Unique Visitors", data.uniqueVisitors],
      ["Average Visitor Duration (min)", data.avgVisitorDuration],
      ["Sign-Out Rate", `${data.visitorSignOutRate}%`],
      [],
      ["Visitors by Type"],
      ["Type", "Count"],
      ...data.byType.map(t => [t.name, t.count]),
      [],
      ["Top Hosts"],
      ["Host", "Count"],
      ...data.byHost.map(h => [h.name, h.count]),
      [],
      ["Top Companies"],
      ["Company", "Visits"],
      ...data.byCompany.map(c => [c.name, c.count]),
      [],
      ["=== EMPLOYEE SUMMARY ==="],
      ["Total Employee Sign-Ins", data.totalEmployeeSignIns],
      ["Unique Employees", data.uniqueEmployees],
      ["Average Employee Duration (min)", data.avgEmployeeDuration],
      ["Sign-Out Rate", `${data.employeeSignOutRate}%`],
      ["Auto Sign-Ins", data.autoSignInCount],
      ["Manual Sign-Ins", data.manualSignInCount],
      [],
      ["=== BOOKING SUMMARY ==="],
      ["Total Bookings", data.totalBookings],
      ["Checked In", data.checkedInBookings],
      ["Pending", data.pendingBookings],
      ["Cancelled", data.cancelledBookings],
      ["No-Shows (past expected arrival, still pending)", data.noShowBookings],
      ["Check-In Rate", `${data.bookingCheckInRate}%`],
      [],
      ["=== PEAK HOURS ==="],
      ["Hour", "Sign-Ins"],
      ...data.peakHours.map(h => [h.hour, h.count]),
      [],
      ["=== DAILY BREAKDOWN ==="],
      ["Day", "Visitors", "Employees", "Total"],
      ...data.combinedByDay.map(d => [d.day, d.visitors, d.employees, d.visitors + d.employees]),
      [],
      ["=== DETAILED VISITOR SIGN-INS (Times in UTC) ==="],
      ["Visitor Name", "Email", "Company", "Type", "Host", "Location", "Sign In (UTC)", "Sign Out (UTC)", "Duration (min)"],
      ...data.rawSignIns.map(s => {
        const duration = s.sign_out_time 
          ? Math.round((new Date(s.sign_out_time).getTime() - new Date(s.sign_in_time).getTime()) / (1000 * 60))
          : ""
        return [
          s.visitor ? `${s.visitor.first_name} ${s.visitor.last_name}` : "",
          s.visitor?.email || "",
          s.visitor?.company || "",
          s.visitor_type?.name || "",
          s.host?.name || "",
          s.location?.name || "",
          formatFullDateTime(s.sign_in_time, "UTC"),
          s.sign_out_time ? formatFullDateTime(s.sign_out_time, "UTC") : "",
          duration,
        ]
      }),
      [],
      ["=== DETAILED EMPLOYEE SIGN-INS (Times in UTC) ==="],
      ["Employee Name", "Email", "Role", "Location", "Auto Sign-In", "Sign In (UTC)", "Sign Out (UTC)", "Duration (min)"],
      ...data.rawEmployeeSignIns.map(s => {
        const duration = s.sign_out_time 
          ? Math.round((new Date(s.sign_out_time).getTime() - new Date(s.sign_in_time).getTime()) / (1000 * 60))
          : ""
        return [
          s.profile?.full_name || "",
          s.profile?.email || "",
          s.profile?.role || "",
          s.location?.name || "",
          s.auto_signed_in ? "Yes" : "No",
          formatFullDateTime(s.sign_in_time, "UTC"),
          s.sign_out_time ? formatFullDateTime(s.sign_out_time, "UTC") : "",
          duration,
        ]
      }),
      [],
      ["=== DETAILED BOOKINGS (Times in UTC) ==="],
      ["Visitor Name", "Company", "Host", "Location", "Expected Arrival (UTC)", "Status"],
      ...data.rawBookings.map(b => [
        `${b.visitor_first_name} ${b.visitor_last_name}`,
        b.visitor_company || "",
        b.host?.name || "",
        b.location?.name || "",
        formatFullDateTime(b.expected_arrival, "UTC"),
        b.status,
      ]),
    ]
    
    const csv = csvContent.map(row => 
      Array.isArray(row) ? row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",") : `"${row}"`
    ).join("\n")
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `signin-report-${periodLabel.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    async function loadReportData() {
      setIsLoading(true)
      const supabase = createClient()

      const startDate = new Date()
      if (period === "1") {
        // Last 24 hours
        startDate.setTime(startDate.getTime() - 24 * 60 * 60 * 1000)
      } else {
        startDate.setDate(startDate.getDate() - Number.parseInt(period))
        startDate.setHours(0, 0, 0, 0)
      }

      // Fetch all data in parallel
      const [signInsResult, employeeSignInsResult, bookingsResult, locationsResult] = await Promise.all([
        supabase
          .from("sign_ins")
          .select(`*, visitor:visitors(*), host:hosts(*), visitor_type:visitor_types(*), location:locations(*)`)
          .gte("sign_in_time", startDate.toISOString()),
        supabase
          .from("employee_sign_ins")
          .select(`*, profile:profiles(*), location:locations(*)`)
          .gte("sign_in_time", startDate.toISOString()),
        supabase
          .from("bookings")
          .select(`*, host:hosts(*), location:locations(*)`)
          .gte("expected_arrival", startDate.toISOString()),
        supabase.from("locations").select("*"),
      ])

      const visitorData = signInsResult.data || []
      const employeeData = employeeSignInsResult.data || []
      const bookingsData = bookingsResult.data || []
      const locationsData = locationsResult.data || []

      // === VISITOR METRICS ===
      const uniqueVisitorIds = new Set(visitorData.map((s) => s.visitor_id))
      const completedVisitorVisits = visitorData.filter((s) => s.sign_out_time)
      const visitorSignOutRate = visitorData.length > 0 
        ? Math.round((completedVisitorVisits.length / visitorData.length) * 100) 
        : 0

      let avgVisitorDuration = 0
      if (completedVisitorVisits.length > 0) {
        const durations = completedVisitorVisits.map((s) => {
          return (new Date(s.sign_out_time!).getTime() - new Date(s.sign_in_time).getTime()) / (1000 * 60)
        })
        avgVisitorDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      }

      // By type
      const typeMap = new Map<string, { count: number; color: string }>()
      visitorData.forEach((s) => {
        if (s.visitor_type) {
          const existing = typeMap.get(s.visitor_type.name) || { count: 0, color: s.visitor_type.badge_color }
          existing.count++
          typeMap.set(s.visitor_type.name, existing)
        }
      })
      const byType = Array.from(typeMap.entries()).map(([name, { count, color }]) => ({ name, count, color }))

      // By host
      const hostMap = new Map<string, number>()
      visitorData.forEach((s) => {
        if (s.host) {
          hostMap.set(s.host.name, (hostMap.get(s.host.name) || 0) + 1)
        }
      })
      const byHost = Array.from(hostMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      // By company
      const companyMap = new Map<string, number>()
      visitorData.forEach((s) => {
        const company = s.visitor?.company
        if (company) {
          companyMap.set(company, (companyMap.get(company) || 0) + 1)
        }
      })
      const byCompany = Array.from(companyMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      // === EMPLOYEE METRICS ===
      const uniqueEmployeeIds = new Set(employeeData.map((s) => s.profile_id))
      const completedEmployeeVisits = employeeData.filter((s) => s.sign_out_time)
      const employeeSignOutRate = employeeData.length > 0 
        ? Math.round((completedEmployeeVisits.length / employeeData.length) * 100) 
        : 0

      let avgEmployeeDuration = 0
      if (completedEmployeeVisits.length > 0) {
        const durations = completedEmployeeVisits.map((s) => {
          return (new Date(s.sign_out_time!).getTime() - new Date(s.sign_in_time).getTime()) / (1000 * 60)
        })
        avgEmployeeDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      }

      const autoSignInCount = employeeData.filter(s => s.auto_signed_in).length
      const manualSignInCount = employeeData.filter(s => !s.auto_signed_in).length

      // === LOCATION METRICS ===
      const locationMap = new Map<string, { visitors: number; employees: number }>()
      locationsData.forEach(loc => {
        locationMap.set(loc.name, { visitors: 0, employees: 0 })
      })
      visitorData.forEach(s => {
        const locName = s.location?.name
        if (locName && locationMap.has(locName)) {
          const existing = locationMap.get(locName)!
          existing.visitors++
        }
      })
      employeeData.forEach(s => {
        const locName = s.location?.name
        if (locName && locationMap.has(locName)) {
          const existing = locationMap.get(locName)!
          existing.employees++
        }
      })
      const byLocation = Array.from(locationMap.entries())
        .map(([name, { visitors, employees }]) => ({ name, visitors, employees, total: visitors + employees }))
        .filter(l => l.total > 0)
        .sort((a, b) => b.total - a.total)

      // === BOOKING METRICS ===
      const now = new Date()
      const checkedInBookings = bookingsData.filter(b => b.status === "checked_in" || b.status === "completed").length
      const pendingBookings = bookingsData.filter(b => b.status === "pending").length
      const cancelledBookings = bookingsData.filter(b => b.status === "cancelled").length
      const noShowBookings = bookingsData.filter(b => 
        b.status === "pending" && new Date(b.expected_arrival) < now
      ).length
      const bookingCheckInRate = bookingsData.length > 0 
        ? Math.round((checkedInBookings / bookingsData.length) * 100) 
        : 0

      // === PEAK HOURS ===
      const hourMap = new Map<number, number>()
      for (let i = 0; i < 24; i++) hourMap.set(i, 0)
      
      visitorData.forEach(s => {
        const hour = new Date(s.sign_in_time).getHours()
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1)
      })
      employeeData.forEach(s => {
        const hour = new Date(s.sign_in_time).getHours()
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1)
      })

      const peakHours = Array.from(hourMap.entries())
        .map(([hour, count]) => ({
          hour: `${hour.toString().padStart(2, "0")}:00`,
          count,
        }))
        .sort((a, b) => Number(a.hour.split(":")[0]) - Number(b.hour.split(":")[0]))

      const busiestHourEntry = peakHours.reduce((max, curr) => curr.count > max.count ? curr : max, peakHours[0])
      const busiestHour = busiestHourEntry?.count > 0 ? busiestHourEntry.hour : "N/A"

      // === COMBINED BY DAY ===
      const dayCount = period === "1" ? 1 : Number.parseInt(period)
      const visitorDayMap = new Map<string, number>()
      const employeeDayMap = new Map<string, number>()
      
      for (let i = dayCount - 1; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const dayKey = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        visitorDayMap.set(dayKey, 0)
        employeeDayMap.set(dayKey, 0)
      }

      visitorData.forEach((s) => {
        const dayKey = new Date(s.sign_in_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        if (visitorDayMap.has(dayKey)) {
          visitorDayMap.set(dayKey, visitorDayMap.get(dayKey)! + 1)
        }
      })

      employeeData.forEach((s) => {
        const dayKey = new Date(s.sign_in_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        if (employeeDayMap.has(dayKey)) {
          employeeDayMap.set(dayKey, employeeDayMap.get(dayKey)! + 1)
        }
      })

      const visitorsByDay = Array.from(visitorDayMap.entries()).map(([day, count]) => ({ day, count }))
      const employeesByDay = Array.from(employeeDayMap.entries()).map(([day, count]) => ({ day, count }))
      const combinedByDay = Array.from(visitorDayMap.keys()).map(day => ({
        day,
        visitors: visitorDayMap.get(day) || 0,
        employees: employeeDayMap.get(day) || 0,
      }))

      setData({
        // Visitor metrics
        totalVisitors: visitorData.length,
        uniqueVisitors: uniqueVisitorIds.size,
        avgVisitorDuration,
        visitorSignOutRate,
        byType,
        byHost,
        byCompany,
        visitorsByDay,
        rawSignIns: visitorData,
        // Employee metrics
        totalEmployeeSignIns: employeeData.length,
        uniqueEmployees: uniqueEmployeeIds.size,
        avgEmployeeDuration,
        employeeSignOutRate,
        employeesByDay,
        autoSignInCount,
        manualSignInCount,
        rawEmployeeSignIns: employeeData,
        // Location metrics
        byLocation,
        // Booking metrics
        totalBookings: bookingsData.length,
        checkedInBookings,
        pendingBookings,
        cancelledBookings,
        noShowBookings,
        bookingCheckInRate,
        rawBookings: bookingsData,
        // Peak hours
        peakHours,
        busiestHour,
        // Combined
        totalSignIns: visitorData.length + employeeData.length,
        combinedByDay,
      })
      setIsLoading(false)
    }

    loadReportData()
  }, [period])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Reports</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Sign-in analytics and insights</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32 sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportReportCSV} disabled={!data}>
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Export Report</span>
          </Button>
        </div>
      </div>

      {/* Quick Links to Specialized Reports */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Link href="/admin/reports/timesheets" className="group">
          <Card className="hover:border-primary/50 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <ClipboardList className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Timesheets</p>
                  <p className="text-xs text-muted-foreground">Employee attendance by day</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {isLoading ? (
        <p className="text-center py-8 text-muted-foreground">Loading report data...</p>
      ) : data ? (
        <>
          {/* Summary Cards Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-1 p-3 sm:p-4 sm:pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Total Sign-Ins
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-2xl sm:text-3xl font-bold">{data.totalSignIns}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.totalVisitors} visitors, {data.totalEmployeeSignIns} employees
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 p-3 sm:p-4 sm:pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Bookings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-2xl sm:text-3xl font-bold">{data.totalBookings}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.bookingCheckInRate}% check-in rate
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 p-3 sm:p-4 sm:pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Busiest Hour
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-2xl sm:text-3xl font-bold">{data.busiestHour}</div>
                <p className="text-xs text-muted-foreground mt-1">Peak sign-in time</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 p-3 sm:p-4 sm:pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <LogOut className="w-3 h-3" />
                  Sign-Out Rate
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-2xl sm:text-3xl font-bold">{data.visitorSignOutRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">Visitors signed out</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabbed Content for Mobile */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full flex overflow-x-auto">
              <TabsTrigger value="overview" className="flex-1 text-xs sm:text-sm">Overview</TabsTrigger>
              <TabsTrigger value="visitors" className="flex-1 text-xs sm:text-sm">Visitors</TabsTrigger>
              <TabsTrigger value="employees" className="flex-1 text-xs sm:text-sm">Employees</TabsTrigger>
              <TabsTrigger value="locations" className="flex-1 text-xs sm:text-sm">Locations</TabsTrigger>
              <TabsTrigger value="bookings" className="flex-1 text-xs sm:text-sm">Bookings</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Combined Daily Chart */}
              <Card>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Sign-Ins by Day</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Daily trends for visitors and employees</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.combinedByDay}>
                      <XAxis dataKey="day" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} width={30} />
                      <Tooltip contentStyle={{ backgroundColor: colors.tooltip.bg, borderColor: colors.tooltip.border, borderRadius: "8px" }} />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      <Bar dataKey="visitors" name="Visitors" fill={colors.primary} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="employees" name="Employees" fill={colors.secondary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Peak Hours Chart */}
              <Card>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Sign-Ins by Hour</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Peak activity times throughout the day</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.peakHours.filter((_, i) => i >= 6 && i <= 20)}>
                      <XAxis dataKey="hour" stroke={colors.axis} fontSize={9} tickLine={false} axisLine={false} interval={1} />
                      <YAxis stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} width={25} />
                      <Tooltip contentStyle={{ backgroundColor: colors.tooltip.bg, borderColor: colors.tooltip.border, borderRadius: "8px" }} />
                      <Bar dataKey="count" name="Sign-Ins" fill={colors.tertiary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Visitors Tab */}
            <TabsContent value="visitors" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Sign-Ins</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{data.totalVisitors}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Unique</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{data.uniqueVisitors}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Avg. Duration</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{data.avgVisitorDuration}<span className="text-sm">m</span></div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Sign-Out Rate</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{data.visitorSignOutRate}%</div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="p-3 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">By Type</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    {data.byType.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
<Pie data={data.byType} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(entry) => entry.name}>
  {data.byType.map((entry, index) => (
  <Cell key={`cell-${index}`} fill={entry.color} />
  ))}
  </Pie>
  <Tooltip contentStyle={{ backgroundColor: colors.tooltip.bg, borderColor: colors.tooltip.border, borderRadius: "8px" }} />
  </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center py-8 text-muted-foreground text-sm">No data</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-3 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">Top Hosts</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    {data.byHost.length > 0 ? (
                      <div className="space-y-2">
                        {data.byHost.map((host, i) => (
                          <div key={host.name} className="flex items-center justify-between">
                            <span className="text-sm truncate flex-1">{i + 1}. {host.name}</span>
                            <span className="text-sm font-medium ml-2">{host.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-8 text-muted-foreground text-sm">No data</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader className="p-3 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">Top Companies</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    {data.byCompany.length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={data.byCompany} layout="vertical">
                          <XAxis type="number" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis dataKey="name" type="category" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} width={100} />
                          <Tooltip contentStyle={{ backgroundColor: colors.tooltip.bg, borderColor: colors.tooltip.border, borderRadius: "8px" }} />
                          <Bar dataKey="count" name="Visits" fill={colors.primary} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center py-8 text-muted-foreground text-sm">No data</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Employees Tab */}
            <TabsContent value="employees" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Sign-Ins</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{data.totalEmployeeSignIns}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Unique</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{data.uniqueEmployees}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Auto Sign-Ins</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{data.autoSignInCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Avg. Duration</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{data.avgEmployeeDuration}<span className="text-sm">m</span></div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Sign-In Methods</CardTitle>
                  <CardDescription className="text-xs">Auto vs manual sign-ins</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  {data.totalEmployeeSignIns > 0 ? (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="50%" height={180}>
                        <PieChart>
                          <Pie 
                            data={[
                              { name: "Auto", count: data.autoSignInCount },
                              { name: "Manual", count: data.manualSignInCount },
                            ]} 
                            dataKey="count" 
                            nameKey="name" 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={40}
                            outerRadius={70}
                          >
                            <Cell fill={colors.success} />
                            <Cell fill={colors.secondary} />
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: colors.tooltip.bg, borderColor: colors.tooltip.border, borderRadius: "8px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span className="text-sm">Auto: {data.autoSignInCount} ({Math.round((data.autoSignInCount / data.totalEmployeeSignIns) * 100)}%)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500" />
                          <span className="text-sm">Manual: {data.manualSignInCount} ({Math.round((data.manualSignInCount / data.totalEmployeeSignIns) * 100)}%)</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground text-sm">No data</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Locations Tab */}
            <TabsContent value="locations" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Sign-Ins by Location
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  {data.byLocation.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data.byLocation}>
                          <XAxis dataKey="name" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} width={30} />
                          <Tooltip contentStyle={{ backgroundColor: colors.tooltip.bg, borderColor: colors.tooltip.border, borderRadius: "8px" }} />
                          <Legend wrapperStyle={{ fontSize: "12px" }} />
                          <Bar dataKey="visitors" name="Visitors" fill={colors.primary} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="employees" name="Employees" fill={colors.secondary} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="mt-4 space-y-2">
                        {data.byLocation.map((loc) => (
                          <div key={loc.name} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{loc.name}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-muted-foreground"><Users className="w-3 h-3 inline mr-1" />{loc.visitors}</span>
                              <span className="text-muted-foreground"><Briefcase className="w-3 h-3 inline mr-1" />{loc.employees}</span>
                              <span className="font-medium">{loc.total} total</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground text-sm">No location data</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Bookings Tab */}
            <TabsContent value="bookings" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4">
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{data.totalBookings}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Checked In</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold text-green-600">{data.checkedInBookings}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Pending</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold text-amber-600">{data.pendingBookings}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Cancelled</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold text-muted-foreground">{data.cancelledBookings}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">No-Shows</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold text-red-600">{data.noShowBookings}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Booking Status Distribution</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  {data.totalBookings > 0 ? (
                    <div className="flex items-center gap-4">
<ResponsiveContainer width="50%" height={180}>
  <PieChart>
  <Pie
  data={[
  { name: "Checked In", count: data.checkedInBookings },
  { name: "Pending", count: data.pendingBookings - data.noShowBookings },
  { name: "No-Show", count: data.noShowBookings },
  { name: "Cancelled", count: data.cancelledBookings },
  ].filter(d => d.count > 0)}
  dataKey="count"
  nameKey="name"
  cx="50%"
  cy="50%"
  innerRadius={40}
  outerRadius={70}
  >
  <Cell fill={colors.success} />
  <Cell fill={colors.warning} />
  <Cell fill={colors.danger} />
<Cell fill={colors.muted} />
  </Pie>
  <Tooltip contentStyle={{ backgroundColor: colors.tooltip.bg, borderColor: colors.tooltip.border, borderRadius: "8px" }} />
  </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span>Checked In: {data.checkedInBookings}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-amber-500" />
                          <span>Pending: {data.pendingBookings - data.noShowBookings}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <span>No-Shows: {data.noShowBookings}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-gray-400" />
                          <span>Cancelled: {data.cancelledBookings}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground text-sm">No bookings in this period</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Check-In Rate</CardTitle>
                  <CardDescription className="text-xs">Percentage of bookings that checked in</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl font-bold">{data.bookingCheckInRate}%</div>
                    <div className="flex-1">
                      <div className="h-4 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all" 
                          style={{ width: `${data.bookingCheckInRate}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <p className="text-center py-8 text-muted-foreground">No data available</p>
      )}
    </div>
  )
}
