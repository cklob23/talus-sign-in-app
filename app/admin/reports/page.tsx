"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Pie, PieChart, Cell, Legend } from "recharts"
import { Download } from "lucide-react"

interface ReportData {
  totalVisitors: number
  uniqueVisitors: number
  avgDuration: number
  byType: { name: string; count: number; color: string }[]
  byHost: { name: string; count: number }[]
  byDay: { day: string; count: number }[]
  rawSignIns: Array<{
    sign_in_time: string
    sign_out_time: string | null
    visitor: { first_name: string; last_name: string; email: string; company: string } | null
    host: { name: string } | null
    visitor_type: { name: string } | null
  }>
}

export default function ReportsPage() {
  const [period, setPeriod] = useState("7")
  const [data, setData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  function exportReportCSV() {
    if (!data) return

    const periodLabel = period === "7" ? "Last 7 days" : period === "14" ? "Last 14 days" : period === "30" ? "Last 30 days" : "Last 90 days"
    
    // Create CSV content with summary and detailed data
    const csvContent = [
      // Summary section
      [`Visitor Report - ${periodLabel}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ["Summary"],
      ["Total Sign-Ins", data.totalVisitors],
      ["Unique Visitors", data.uniqueVisitors],
      ["Average Duration (min)", data.avgDuration],
      [],
      ["Visitors by Type"],
      ["Type", "Count"],
      ...data.byType.map(t => [t.name, t.count]),
      [],
      ["Top Hosts"],
      ["Host", "Count"],
      ...data.byHost.map(h => [h.name, h.count]),
      [],
      ["Daily Breakdown"],
      ["Day", "Count"],
      ...data.byDay.map(d => [d.day, d.count]),
      [],
      ["Detailed Sign-Ins"],
      ["Visitor Name", "Email", "Company", "Type", "Host", "Sign In", "Sign Out", "Duration (min)"],
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
          new Date(s.sign_in_time).toLocaleString(),
          s.sign_out_time ? new Date(s.sign_out_time).toLocaleString() : "",
          duration,
        ]
      }),
    ]
    
    const csv = csvContent.map(row => 
      Array.isArray(row) ? row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",") : `"${row}"`
    ).join("\n")
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `visitor-report-${period}-days-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    async function loadReportData() {
      setIsLoading(true)
      const supabase = createClient()

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - Number.parseInt(period))
      startDate.setHours(0, 0, 0, 0)

      // Get all sign-ins in period
      const { data: signIns } = await supabase
        .from("sign_ins")
        .select(
          `
          *,
          visitor:visitors(*),
          host:hosts(*),
          visitor_type:visitor_types(*)
        `,
        )
        .gte("sign_in_time", startDate.toISOString())

      if (!signIns) {
        setIsLoading(false)
        return
      }

      // Calculate metrics
      const uniqueVisitorIds = new Set(signIns.map((s) => s.visitor_id))

      // Average duration
      const completedVisits = signIns.filter((s) => s.sign_out_time)
      let avgDuration = 0
      if (completedVisits.length > 0) {
        const durations = completedVisits.map((s) => {
          return (new Date(s.sign_out_time!).getTime() - new Date(s.sign_in_time).getTime()) / (1000 * 60)
        })
        avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      }

      // By type
      const typeMap = new Map<string, { count: number; color: string }>()
      signIns.forEach((s) => {
        if (s.visitor_type) {
          const existing = typeMap.get(s.visitor_type.name) || { count: 0, color: s.visitor_type.badge_color }
          existing.count++
          typeMap.set(s.visitor_type.name, existing)
        }
      })
      const byType = Array.from(typeMap.entries()).map(([name, { count, color }]) => ({ name, count, color }))

      // By host
      const hostMap = new Map<string, number>()
      signIns.forEach((s) => {
        if (s.host) {
          hostMap.set(s.host.name, (hostMap.get(s.host.name) || 0) + 1)
        }
      })
      const byHost = Array.from(hostMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      // By day
      const dayMap = new Map<string, number>()
      for (let i = Number.parseInt(period) - 1; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const dayKey = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        dayMap.set(dayKey, 0)
      }
      signIns.forEach((s) => {
        const dayKey = new Date(s.sign_in_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        if (dayMap.has(dayKey)) {
          dayMap.set(dayKey, dayMap.get(dayKey)! + 1)
        }
      })
      const byDay = Array.from(dayMap.entries()).map(([day, count]) => ({ day, count }))

      setData({
        totalVisitors: signIns.length,
        uniqueVisitors: uniqueVisitorIds.size,
        avgDuration,
        byType,
        byHost,
        byDay,
        rawSignIns: signIns,
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
          <p className="text-sm sm:text-base text-muted-foreground">Visitor analytics and insights</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32 sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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

      {isLoading ? (
        <p className="text-center py-8 text-muted-foreground">Loading report data...</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium">Total Sign-Ins</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-xl sm:text-3xl font-bold">{data.totalVisitors}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium">Unique Visitors</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-xl sm:text-3xl font-bold">{data.uniqueVisitors}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium">Avg. Duration</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-xl sm:text-3xl font-bold">{data.avgDuration} <span className="text-xs sm:text-base">min</span></div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Visitors by Day</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Daily sign-in trends</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <ResponsiveContainer width="100%" height={250} className="sm:!h-[300px]">
                  <BarChart data={data.byDay}>
                    <XAxis dataKey="day" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} width={30} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Visitors by Type</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Breakdown by visitor category</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {data.byType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250} className="sm:!h-[300px]">
                    <PieChart>
                      <Pie data={data.byType} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {data.byType.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No data available</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Top Hosts</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Most visited employees</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {data.byHost.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.byHost} layout="vertical">
                      <XAxis type="number" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        stroke="#888888"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        width={80}
                      />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No data available</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <p className="text-center py-8 text-muted-foreground">No data available</p>
      )}
    </div>
  )
}
