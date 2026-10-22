"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts"
import { startOfDayInTimezone, toIANATimezone, zonedTimeToUtc } from "@/lib/timezone"
import { useTimezone } from "@/contexts/timezone-context"

interface DayData {
  day: string
  visitors: number
  employees: number
}

// Theme-aware chart colors
const chartColors = {
  light: {
    visitors: "#3b82f6", // blue-500
    employees: "#16a34a", // green-600
    axis: "#6b7280", // gray-500
    tooltip: { bg: "#ffffff", border: "#e5e7eb" },
  },
  dark: {
    visitors: "#60a5fa", // blue-400
    employees: "#22c55e", // green-500
    axis: "#9ca3af", // gray-400
    tooltip: { bg: "#1f2937", border: "#374151" },
  },
}

export function DashboardCharts() {
  const { resolvedTheme } = useTheme()
  const { timezone: userTimezone } = useTimezone()
  const [chartData, setChartData] = useState<DayData[]>([])
  const [mounted, setMounted] = useState(false)

  const colors = chartColors[resolvedTheme === "dark" ? "dark" : "light"]

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function loadChartData() {
      const supabase = createClient()
      const data: DayData[] = []

      const tz = toIANATimezone(userTimezone || "UTC")
      for (let i = 6; i >= 0; i--) {
        const startOfToday = startOfDayInTimezone(tz)
        const startOfDay = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000)
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(startOfDay)
        const year = Number(parts.find((p) => p.type === "year")?.value)
        const month = Number(parts.find((p) => p.type === "month")?.value)
        const day = Number(parts.find((p) => p.type === "day")?.value)
        const endOfDay = new Date(zonedTimeToUtc(year, month, day, 23, 59, 59, tz).getTime() + 999)

        // Fetch visitor sign-ins
        const { count: visitorCount } = await supabase
          .from("sign_ins")
          .select("*", { count: "exact", head: true })
          .gte("sign_in_time", startOfDay.toISOString())
          .lte("sign_in_time", endOfDay.toISOString())

        // Fetch employee sign-ins
        const { count: employeeCount } = await supabase
          .from("employee_sign_ins")
          .select("*", { count: "exact", head: true })
          .gte("sign_in_time", startOfDay.toISOString())
          .lte("sign_in_time", endOfDay.toISOString())

        data.push({
          day: startOfDay.toLocaleDateString("en-US", { weekday: "short", timeZone: tz }),
          visitors: visitorCount || 0,
          employees: employeeCount || 0,
        })
      }

      setChartData(data)
    }

    loadChartData()
  }, [userTimezone])

  if (!mounted) {
    return (
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Visitor & Employee Trends</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Sign-ins over the last 7 days</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="h-[250px] sm:h-[300px] flex items-center justify-center text-muted-foreground">
            Loading chart...
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Visitor & Employee Trends</CardTitle>
        <CardDescription className="text-xs sm:text-sm">Sign-ins over the last 7 days</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <ResponsiveContainer width="100%" height={250} className="sm:!h-[300px]">
          <BarChart data={chartData}>
            <XAxis dataKey="day" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.tooltip.bg,
                borderColor: colors.tooltip.border,
                borderRadius: "8px",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
              formatter={(value) => <span className="text-xs capitalize">{value}</span>}
            />
            <Bar dataKey="visitors" name="Visitors" fill={colors.visitors} radius={[4, 4, 0, 0]} />
            <Bar dataKey="employees" name="Employees" fill={colors.employees} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
