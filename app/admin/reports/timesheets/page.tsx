"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Search, Clock, Users, Building2 } from "lucide-react"
import Link from "next/link"
import type { Location, Profile, EmployeeSignIn } from "@/types/database"
import { formatDateTime, formatFullDateTime } from "@/lib/timezone"

interface TimesheetEntry {
  id: string
  profile: Profile | null
  location: Location | null
  sign_in_time: string
  sign_out_time: string | null
  auto_signed_in: boolean
  duration_minutes: number | null
}

export default function TimesheetsPage() {
  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [filteredEntries, setFilteredEntries] = useState<TimesheetEntry[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all")
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [groupFilter, setGroupFilter] = useState<string>("employees")

  // Stats
  const [totalHours, setTotalHours] = useState(0)
  const [totalEmployees, setTotalEmployees] = useState(0)

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()

    // Get start and end of selected date
    const startOfDay = new Date(selectedDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(selectedDate)
    endOfDay.setHours(23, 59, 59, 999)

    const [{ data: signInsData }, { data: locationsData }] = await Promise.all([
      supabase
        .from("employee_sign_ins")
        .select("*, profile:profiles(*), location:locations(*)")
        .gte("sign_in_time", startOfDay.toISOString())
        .lte("sign_in_time", endOfDay.toISOString())
        .order("sign_in_time", { ascending: false }),
      supabase.from("locations").select("*").order("name"),
    ])

    if (locationsData) {
      setLocations(locationsData as Location[])
    }

    if (signInsData) {
      const entriesWithDuration: TimesheetEntry[] = signInsData.map((entry) => {
        let duration_minutes: number | null = null
        if (entry.sign_out_time) {
          const signIn = new Date(entry.sign_in_time)
          const signOut = new Date(entry.sign_out_time)
          duration_minutes = Math.round((signOut.getTime() - signIn.getTime()) / (1000 * 60))
        }
        return {
          id: entry.id,
          profile: entry.profile as Profile | null,
          location: entry.location as Location | null,
          sign_in_time: entry.sign_in_time,
          sign_out_time: entry.sign_out_time,
          auto_signed_in: entry.auto_signed_in,
          duration_minutes,
        }
      })
      setEntries(entriesWithDuration)
    }

    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [selectedDate])

  // Filter entries based on location and search
  useEffect(() => {
    let filtered = [...entries]

    // Filter by location
    if (selectedLocationId !== "all") {
      filtered = filtered.filter((e) => e.location?.id === selectedLocationId)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (e) =>
          e.profile?.full_name?.toLowerCase().includes(query) ||
          e.profile?.email?.toLowerCase().includes(query) ||
          e.profile?.department?.toLowerCase().includes(query)
      )
    }

    // Filter by group (only employees for now)
    if (groupFilter === "employees") {
      filtered = filtered.filter((e) => e.profile?.role === "employee" || e.profile?.role === "staff")
    }

    setFilteredEntries(filtered)

    // Calculate stats
    const uniqueEmployees = new Set(filtered.map((e) => e.profile?.id)).size
    const totalMinutes = filtered.reduce((acc, e) => acc + (e.duration_minutes || 0), 0)
    setTotalEmployees(uniqueEmployees)
    setTotalHours(Math.round((totalMinutes / 60) * 10) / 10)
  }, [entries, selectedLocationId, searchQuery, groupFilter])

  function navigateDate(direction: "prev" | "next") {
    const newDate = new Date(selectedDate)
    if (direction === "prev") {
      newDate.setDate(newDate.getDate() - 1)
    } else {
      newDate.setDate(newDate.getDate() + 1)
    }
    setSelectedDate(newDate)
  }

  function formatDuration(minutes: number | null): string {
    if (minutes === null) return "-"
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}m`
    return `${hours}h ${mins}m`
  }

  function exportCSV() {
    const csvContent = [
      ["Timesheets Report"],
      [`Date: ${selectedDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`],
      [`Location: ${selectedLocationId === "all" ? "All Sites" : locations.find(l => l.id === selectedLocationId)?.name || "Unknown"}`],
      [],
      ["Employee", "Email", "Department", "Location", "Sign In", "Sign Out", "Duration", "Auto Sign-In"],
      ...filteredEntries.map((e) => [
        e.profile?.full_name || "",
        e.profile?.email || "",
        e.profile?.department || "",
        e.location?.name || "",
        formatFullDateTime(e.sign_in_time, e.location?.timezone || "UTC"),
        e.sign_out_time ? formatFullDateTime(e.sign_out_time, e.location?.timezone || "UTC") : "",
        formatDuration(e.duration_minutes),
        e.auto_signed_in ? "Yes" : "No",
      ]),
      [],
      [`Total Employees: ${totalEmployees}`],
      [`Total Hours: ${totalHours}`],
    ]

    const csv = csvContent
      .map((row) =>
        Array.isArray(row) ? row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",") : `"${row}"`
      )
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `timesheets-${selectedDate.toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const dateString = selectedDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/reports" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Reports
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Timesheets</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Employee attendance and hours tracking</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={filteredEntries.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
          <SelectTrigger className="w-auto min-w-32 bg-primary text-primary-foreground border-primary">
            <Building2 className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Site" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-auto min-w-36 bg-primary text-primary-foreground border-primary">
            <Users className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="employees">Employees</SelectItem>
            <SelectItem value="all">All Users</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 bg-primary text-primary-foreground rounded-md">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground"
            onClick={() => navigateDate("prev")}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-2 text-sm font-medium min-w-32 text-center">{dateString}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground"
            onClick={() => navigateDate("next")}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-40"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Employees
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalEmployees}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Total Hours
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalHours}h</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : filteredEntries.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No records found</p>
          ) : (
            <>
              {/* Mobile view */}
              <div className="md:hidden divide-y">
                {filteredEntries.map((entry) => (
                  <div key={entry.id} className="p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={entry.profile?.avatar_url || undefined} />
                        <AvatarFallback>
                          {entry.profile?.full_name?.[0] || entry.profile?.email?.[0]?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{entry.profile?.full_name || entry.profile?.email}</p>
                        <p className="text-xs text-muted-foreground">{entry.profile?.department || "No department"}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatDuration(entry.duration_minutes)}</p>
                        <p className="text-xs text-muted-foreground">{entry.location?.name}</p>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>In: {formatDateTime(entry.sign_in_time, entry.location?.timezone || "UTC")}</span>
                      <span>
                        Out: {entry.sign_out_time ? formatDateTime(entry.sign_out_time, entry.location?.timezone || "UTC") : "-"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop view */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Sign In</TableHead>
                      <TableHead>Sign Out</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={entry.profile?.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {entry.profile?.full_name?.[0] || entry.profile?.email?.[0]?.toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{entry.profile?.full_name || entry.profile?.email}</p>
                              <p className="text-xs text-muted-foreground">{entry.profile?.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{entry.profile?.department || "-"}</TableCell>
                        <TableCell>{entry.location?.name || "-"}</TableCell>
                        <TableCell>{formatDateTime(entry.sign_in_time, entry.location?.timezone || "UTC")}</TableCell>
                        <TableCell>
                          {entry.sign_out_time
                            ? formatDateTime(entry.sign_out_time, entry.location?.timezone || "UTC")
                            : "-"}
                        </TableCell>
                        <TableCell>{formatDuration(entry.duration_minutes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
