"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"

interface DayData {
  day: string
  visitors: number
}

// Theme-aware chart colors
const chartColors = {
  light: {
    primary: "#16a34a", // green-600
    secondary: "#3b82f6", // blue-500
    tertiary: "#f59e0b", // amber-500
    axis: "#6b7280", // gray-500
    tooltip: { bg: "#ffffff", border: "#e5e7eb" },
  },
  dark: {
    primary: "#22c55e", // green-500
    secondary: "#60a5fa", // blue-400
    tertiary: "#fbbf24", // amber-400
    axis: "#9ca3af", // gray-400
    tooltip: { bg: "#1f2937", border: "#374151" },
  },
}

export function DashboardCharts() {
  const { resolvedTheme } = useTheme()
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

      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const startOfDay = new Date(date)
        startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(date)
        endOfDay.setHours(23, 59, 59, 999)

        const { count } = await supabase
          .from("sign_ins")
          .select("*", { count: "exact", head: true })
          .gte("sign_in_time", startOfDay.toISOString())
          .lte("sign_in_time", endOfDay.toISOString())

        data.push({
          day: date.toLocaleDateString("en-US", { weekday: "short" }),
          visitors: count || 0,
        })
      }

      setChartData(data)
    }

    loadChartData()
  }, [])

  if (!mounted) {
    return (
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Visitor Trends</CardTitle>
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
        <CardTitle className="text-base sm:text-lg">Visitor Trends</CardTitle>
        <CardDescription className="text-xs sm:text-sm">Sign-ins over the last 7 days</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <ResponsiveContainer width="100%" height={250} className="sm:!h-[300px]">
          <BarChart data={chartData}>
            <XAxis dataKey="day" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} width={30} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: colors.tooltip.bg, 
                borderColor: colors.tooltip.border,
                borderRadius: "8px",
              }} 
            />
            <Bar dataKey="visitors" fill={colors.primary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
