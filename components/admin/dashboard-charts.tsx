"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"

interface DayData {
  day: string
  visitors: number
}

export function DashboardCharts() {
  const [chartData, setChartData] = useState<DayData[]>([])

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

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Visitor Trends</CardTitle>
        <CardDescription className="text-xs sm:text-sm">Sign-ins over the last 7 days</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <ResponsiveContainer width="100%" height={250} className="sm:!h-[300px]">
          <BarChart data={chartData}>
            <XAxis dataKey="day" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} width={30} />
            <Tooltip />
            <Bar dataKey="visitors" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
