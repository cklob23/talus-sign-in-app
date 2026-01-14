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
}

export default function ReportsPage() {
  const [period, setPeriod] = useState("7")
  const [data, setData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
      })
      setIsLoading(false)
    }

    loadReportData()
  }, [period])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Visitor analytics and insights</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center py-8 text-muted-foreground">Loading report data...</p>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Sign-Ins</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{data.totalVisitors}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{data.uniqueVisitors}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg. Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{data.avgDuration} min</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Visitors by Day</CardTitle>
                <CardDescription>Daily sign-in trends</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.byDay}>
                    <XAxis dataKey="day" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Visitors by Type</CardTitle>
                <CardDescription>Breakdown by visitor category</CardDescription>
              </CardHeader>
              <CardContent>
                {data.byType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={data.byType} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
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

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Top Hosts</CardTitle>
                <CardDescription>Most visited employees</CardDescription>
              </CardHeader>
              <CardContent>
                {data.byHost.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.byHost} layout="vertical">
                      <XAxis type="number" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        stroke="#888888"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        width={100}
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
