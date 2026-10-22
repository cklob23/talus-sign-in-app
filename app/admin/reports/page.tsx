"use client"

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChevronRight, ClipboardList, Download, MapPin } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePermissions } from "@/contexts/permissions-context"
import { startOfDayInTimezone } from "@/lib/timezone"
import {
  addCalendarDays,
  dashboardPeriodLabel,
  REPORT_VIEW_MAX_ROWS,
  reportWindowTimezone,
  resolveOnDemandWindow,
  ymdInZone,
} from "@/lib/reports/period"
import { fetchPages } from "@/lib/reports/query"
import { ReportFilterBar, type FilterOption } from "@/components/admin/reports/filter-bar"
import { TrainingTab } from "@/components/admin/reports/training-tab"
import { ScheduledTab } from "@/components/admin/reports/scheduled-tab"
import { downloadReportCsv } from "@/components/admin/reports/download"
import { SendReportButton } from "@/components/admin/reports/send-dialog"
import { ReportRowCapNotice } from "@/components/admin/reports/row-cap"

interface VisitorRow {
  sign_in_time: string
  sign_out_time: string | null
  visitor_id: string
  visitor: { first_name: string; last_name: string; email: string; company: string } | null
  host: { name: string } | null
  visitor_type: { name: string; badge_color?: string } | null
  location: { id: string; name: string; timezone: string } | null
}

interface EmployeeRow {
  sign_in_time: string
  sign_out_time: string | null
  auto_signed_in: boolean
  profile_id: string
  profile: { full_name: string; email: string; role: string } | null
  location: { id: string; name: string; timezone: string } | null
}

interface BookingRow {
  expected_arrival: string
  status: string
}

const chartColors = {
  light: {
    primary: "#16a34a",
    secondary: "#3b82f6",
    tertiary: "#f59e0b",
    success: "#22c55e",
    axis: "#6b7280",
    tooltip: { bg: "#ffffff", border: "#e5e7eb" },
  },
  dark: {
    primary: "#22c55e",
    secondary: "#60a5fa",
    tertiary: "#fbbf24",
    success: "#4ade80",
    axis: "#9ca3af",
    tooltip: { bg: "#1f2937", border: "#374151" },
  },
}

function defaultCustomRange(timezone: string, now = new Date()) {
  const todayStart = startOfDayInTimezone(timezone, now)
  return {
    start: ymdInZone(addCalendarDays(todayStart, -6, timezone), timezone),
    end: ymdInZone(now, timezone),
  }
}

export default function ReportsPage() {
  const { resolvedTheme } = useTheme()
  const { profileRole } = usePermissions()
  const colors = chartColors[resolvedTheme === "dark" ? "dark" : "light"]
  const canSchedule = profileRole === "admin" || profileRole === "super_admin"

  const [tab, setTab] = useState("sign-ins")
  const [period, setPeriod] = useState("7")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [locations, setLocations] = useState<(FilterOption & { timezone?: string })[]>([])
  const [visitorTypes, setVisitorTypes] = useState<(FilterOption & { locationId?: string })[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [selectedVisitorTypes, setSelectedVisitorTypes] = useState<string[]>([])
  const [visitors, setVisitors] = useState<VisitorRow[]>([])
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<"visitors" | "employees" | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const windowTz = reportWindowTimezone({ selectedLocationIds: selectedLocations, locations })
  const window = useMemo(
    () => resolveOnDemandWindow({ period, timezone: windowTz, customStart, customEnd }),
    [period, windowTz, customStart, customEnd],
  )
  const fromIso = window.start.toISOString()
  const toIso = window.end.toISOString()
  const periodText = dashboardPeriodLabel(period, customStart, customEnd)

  function changePeriod(next: string) {
    if (next === "custom" && (!customStart || !customEnd)) {
      const range = defaultCustomRange(windowTz)
      setCustomStart(range.start)
      setCustomEnd(range.end)
    }
    setPeriod(next)
  }

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from("locations").select("id, name, timezone").order("name"),
      supabase.from("visitor_types").select("id, name, location_id").order("name"),
    ]).then(([locs, types]) => {
      setLocations((locs.data || []) as (FilterOption & { timezone?: string })[])
      setVisitorTypes(
        ((types.data || []) as Array<{ id: string; name: string; location_id?: string }>).map((row) => ({
          id: row.id,
          name: row.name,
          locationId: row.location_id,
        })),
      )
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const [visitorRes, employeeRes, bookingRes] = await Promise.all([
        fetchPages<VisitorRow>(async (from, to) => {
          let query = supabase
            .from("sign_ins")
            .select("sign_in_time, sign_out_time, visitor_id, visitor:visitors(*), host:hosts(name), visitor_type:visitor_types(name, badge_color), location:locations(id, name, timezone)")
            .gte("sign_in_time", fromIso)
            .lt("sign_in_time", toIso)
            .order("sign_in_time", { ascending: true })
            .range(from, to)
          if (selectedLocations.length) query = query.in("location_id", selectedLocations)
          if (selectedVisitorTypes.length) query = query.in("visitor_type_id", selectedVisitorTypes)
          return query
        }, REPORT_VIEW_MAX_ROWS),
        fetchPages<EmployeeRow>(async (from, to) => {
          let query = supabase
            .from("employee_sign_ins")
            .select("sign_in_time, sign_out_time, auto_signed_in, profile_id, profile:profiles(full_name, email, role), location:locations(id, name, timezone)")
            .gte("sign_in_time", fromIso)
            .lt("sign_in_time", toIso)
            .order("sign_in_time", { ascending: true })
            .range(from, to)
          if (selectedLocations.length) query = query.in("location_id", selectedLocations)
          return query
        }, REPORT_VIEW_MAX_ROWS),
        fetchPages<BookingRow>(async (from, to) => {
          let query = supabase
            .from("bookings")
            .select("expected_arrival, status")
            .gte("expected_arrival", fromIso)
            .lt("expected_arrival", toIso)
            .order("expected_arrival", { ascending: true })
            .range(from, to)
          if (selectedLocations.length) query = query.in("location_id", selectedLocations)
          return query
        }, REPORT_VIEW_MAX_ROWS),
      ])
      if (cancelled) return
      setVisitors(visitorRes.rows)
      setEmployees(employeeRes.rows)
      setBookings(bookingRes.rows)
      setTruncated(visitorRes.truncated || employeeRes.truncated || bookingRes.truncated)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [fromIso, toIso, selectedLocations, selectedVisitorTypes])

  const visitorMetrics = useMemo(() => {
    const unique = new Set(visitors.map((row) => row.visitor_id))
    const done = visitors.filter((row) => row.sign_out_time)
    const signOutRate = visitors.length ? Math.round((done.length / visitors.length) * 100) : 0
    const avg =
      done.length === 0
        ? 0
        : Math.round(
            done.reduce((sum, row) => sum + (new Date(row.sign_out_time!).getTime() - new Date(row.sign_in_time).getTime()) / 60000, 0) /
              done.length,
          )
    const typeMap = new Map<string, { count: number; color: string }>()
    visitors.forEach((row) => {
      if (!row.visitor_type) return
      const existing = typeMap.get(row.visitor_type.name) || { count: 0, color: row.visitor_type.badge_color || colors.primary }
      existing.count += 1
      typeMap.set(row.visitor_type.name, existing)
    })
    const hostMap = new Map<string, number>()
    visitors.forEach((row) => {
      if (row.host?.name) hostMap.set(row.host.name, (hostMap.get(row.host.name) || 0) + 1)
    })
    const companyMap = new Map<string, number>()
    visitors.forEach((row) => {
      if (row.visitor?.company) companyMap.set(row.visitor.company, (companyMap.get(row.visitor.company) || 0) + 1)
    })
    const locMap = new Map<string, number>()
    visitors.forEach((row) => {
      if (row.location?.name) locMap.set(row.location.name, (locMap.get(row.location.name) || 0) + 1)
    })
    return {
      unique: unique.size,
      signOutRate,
      avg,
      byType: Array.from(typeMap.entries()).map(([name, value]) => ({ name, ...value })),
      byHost: Array.from(hostMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      byCompany: Array.from(companyMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      byLocation: Array.from(locMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    }
  }, [visitors, colors.primary])

  const employeeMetrics = useMemo(() => {
    const unique = new Set(employees.map((row) => row.profile_id))
    const done = employees.filter((row) => row.sign_out_time)
    const avg =
      done.length === 0
        ? 0
        : Math.round(
            done.reduce((sum, row) => sum + (new Date(row.sign_out_time!).getTime() - new Date(row.sign_in_time).getTime()) / 60000, 0) /
              done.length,
          )
    return {
      unique: unique.size,
      avg,
      auto: employees.filter((row) => row.auto_signed_in).length,
      manual: employees.filter((row) => !row.auto_signed_in).length,
    }
  }, [employees])

  const bookingMetrics = useMemo(() => {
    const checkedIn = bookings.filter((row) => row.status === "checked_in" || row.status === "completed").length
    return {
      total: bookings.length,
      checkedIn,
      rate: bookings.length ? Math.round((checkedIn / bookings.length) * 100) : 0,
    }
  }, [bookings])

  async function exportKind(kind: "visitors" | "employees") {
    setExporting(kind)
    setExportError(null)
    try {
      await downloadReportCsv({
        kind,
        locations: selectedLocations,
        visitorTypes: kind === "visitors" ? selectedVisitorTypes : [],
        from: fromIso,
        to: toIso,
      })
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not export CSV")
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Reports</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Sign-in logs, training completions, and scheduled email reports. Times use each site timezone.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="w-full flex overflow-x-auto">
          <TabsTrigger value="sign-ins" className="flex-1 text-xs sm:text-sm">Sign-ins</TabsTrigger>
          <TabsTrigger value="employees" className="flex-1 text-xs sm:text-sm">Employees</TabsTrigger>
          <TabsTrigger value="training" className="flex-1 text-xs sm:text-sm">Training</TabsTrigger>
          {canSchedule && <TabsTrigger value="scheduled" className="flex-1 text-xs sm:text-sm">Scheduled</TabsTrigger>}
        </TabsList>

        <TabsContent value="sign-ins" className="space-y-4 mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ReportFilterBar
              period={period}
              onPeriodChange={changePeriod}
              customStart={customStart}
              customEnd={customEnd}
              onCustomStartChange={setCustomStart}
              onCustomEndChange={setCustomEnd}
              locations={locations}
              selectedLocations={selectedLocations}
              onLocationsChange={setSelectedLocations}
              visitorTypes={visitorTypes}
              selectedVisitorTypes={selectedVisitorTypes}
              onVisitorTypesChange={setSelectedVisitorTypes}
              showVisitorTypes
            />
            <div className="flex flex-wrap gap-2">
              {canSchedule && (
                <SendReportButton
                  kind="visitors"
                  period={period}
                  customStart={customStart}
                  customEnd={customEnd}
                  timezone={windowTz}
                  locationIds={selectedLocations}
                  visitorTypeIds={selectedVisitorTypes}
                />
              )}
              <Button variant="outline" size="sm" onClick={() => exportKind("visitors")} disabled={exporting !== null}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
          {exportError && tab === "sign-ins" && <p className="text-sm text-destructive">{exportError}</p>}
          <ReportRowCapNotice truncated={truncated} loaded={visitors.length} />
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading report data...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Visitor sign-ins</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{visitors.length}</div>
                    <p className="text-xs text-muted-foreground">{periodText}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Unique visitors</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{visitorMetrics.unique}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Avg. duration</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{visitorMetrics.avg}<span className="text-sm">m</span></div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Bookings</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{bookingMetrics.total}</div>
                    <p className="text-xs text-muted-foreground">{bookingMetrics.rate}% checked in</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="p-3 sm:p-6">
                    <CardTitle className="text-base">By type</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    {visitorMetrics.byType.length ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={visitorMetrics.byType} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(entry) => entry.name}>
                            {visitorMetrics.byType.map((entry, index) => (
                              <Cell key={entry.name} fill={entry.color || colors.primary} />
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
                    <CardTitle className="text-base">Top hosts</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    {visitorMetrics.byHost.length ? (
                      <div className="space-y-2">
                        {visitorMetrics.byHost.map((host, index) => (
                          <div key={host.name} className="flex items-center justify-between">
                            <span className="text-sm truncate">{index + 1}. {host.name}</span>
                            <span className="text-sm font-medium">{host.count}</span>
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
                    <CardTitle className="text-base">Top companies</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    {visitorMetrics.byCompany.length ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={visitorMetrics.byCompany} layout="vertical">
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
                <Card className="lg:col-span-2">
                  <CardHeader className="p-3 sm:p-6">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Visitors by site
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    {visitorMetrics.byLocation.length ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={visitorMetrics.byLocation}>
                          <XAxis dataKey="name" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} width={30} />
                          <Tooltip contentStyle={{ backgroundColor: colors.tooltip.bg, borderColor: colors.tooltip.border, borderRadius: "8px" }} />
                          <Bar dataKey="count" name="Visitors" fill={colors.primary} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center py-8 text-muted-foreground text-sm">No location data</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="employees" className="space-y-4 mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ReportFilterBar
              period={period}
              onPeriodChange={changePeriod}
              customStart={customStart}
              customEnd={customEnd}
              onCustomStartChange={setCustomStart}
              onCustomEndChange={setCustomEnd}
              locations={locations}
              selectedLocations={selectedLocations}
              onLocationsChange={setSelectedLocations}
            />
            <div className="flex flex-wrap gap-2">
              {canSchedule && (
                <SendReportButton
                  kind="employees"
                  period={period}
                  customStart={customStart}
                  customEnd={customEnd}
                  timezone={windowTz}
                  locationIds={selectedLocations}
                  visitorTypeIds={[]}
                />
              )}
              <Button variant="outline" size="sm" onClick={() => exportKind("employees")} disabled={exporting !== null}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
          {exportError && tab === "employees" && <p className="text-sm text-destructive">{exportError}</p>}
          <ReportRowCapNotice truncated={truncated} loaded={employees.length} />
          <Link href="/admin/reports/timesheets" className="group block">
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
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading report data...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Sign-ins</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{employees.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Unique</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{employeeMetrics.unique}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Auto sign-ins</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{employeeMetrics.auto}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Avg. duration</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{employeeMetrics.avg}<span className="text-sm">m</span></div>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader className="p-3 sm:p-6">
                  <CardTitle className="text-base">Sign-in methods</CardTitle>
                  <CardDescription className="text-xs">Auto vs manual sign-ins</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  {employees.length ? (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="50%" height={180}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Auto", count: employeeMetrics.auto },
                              { name: "Manual", count: employeeMetrics.manual },
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
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground text-sm">No data</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="training" className="mt-4">
          <TrainingTab
            period={period}
            onPeriodChange={changePeriod}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            timezone={windowTz}
            locations={locations}
            selectedLocations={selectedLocations}
            onLocationsChange={setSelectedLocations}
            visitorTypes={visitorTypes}
            selectedVisitorTypes={selectedVisitorTypes}
            onVisitorTypesChange={setSelectedVisitorTypes}
            fromIso={fromIso}
            toIso={toIso}
            canSend={canSchedule}
          />
        </TabsContent>

        {canSchedule && (
          <TabsContent value="scheduled" className="mt-4">
            <ScheduledTab locations={locations} visitorTypes={visitorTypes} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
