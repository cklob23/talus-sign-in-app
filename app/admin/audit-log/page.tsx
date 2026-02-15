"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ChevronLeft, ChevronRight, ClipboardList, Calendar, RefreshCw, Download } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { addDays, subDays, format, startOfDay, endOfDay } from "date-fns"
import type { AuditLog, Profile } from "@/types/database"
import { formatDateTime, formatFullDateTime } from "@/lib/timezone"
import { useTimezone } from "@/contexts/timezone-context"
import { TierGate } from "@/components/admin/tier-gate"

const ACTION_LABELS: Record<string, string> = {
  // User actions
  "user.login": "Admin logged in",
  "user.logout": "Admin logged out",
  "user.created": "User created",
  "user.updated": "User updated",
  "user.deleted": "User deleted",
  // Visitor actions
  "visitor.sign_in": "Visitor signed in",
  "visitor.sign_out": "Visitor signed out",
  "visitor.created": "Visitor created",
  "visitor.updated": "Visitor updated",
  // Employee actions
  "employee.sign_in": "Employee signed in",
  "employee.sign_out": "Employee signed out",
  // Booking actions
  "booking.created": "Booking created",
  "booking.updated": "Booking updated",
  "booking.cancelled": "Booking cancelled",
  "booking.checked_in": "Booking checked in",
  // Host actions
  "host.created": "Host created",
  "host.updated": "Host updated",
  "host.deleted": "Host deleted",
  // Location actions
  "location.created": "Location created",
  "location.updated": "Location updated",
  "location.deleted": "Location deleted",
  // Evacuation actions
  "evacuation.started": "Evacuation started",
  "evacuation.ended": "Evacuation ended",
  // Settings actions
  "settings.updated": "Settings updated",
  // Visitor type actions
  "visitor_type.created": "Visitor type created",
  "visitor_type.updated": "Visitor type updated",
  "visitor_type.deleted": "Visitor type deleted",
  // Password actions
  "password.reset_email_sent": "Password reset email sent",
  "password.temporary_set": "Temporary password set",
  // Role actions
  "role.created": "Role created",
  "role.updated": "Role updated",
  "role.deleted": "Role deleted",
  "role.assigned": "Role assigned",
  "role.unassigned": "Role unassigned",
  // Kiosk actions
  "kiosk.receptionist_login": "Receptionist logged in",
  "kiosk.receptionist_logout": "Receptionist logged out",
}

const ENTITY_TYPES = [
  { value: "all", label: "All types" },
  { value: "user", label: "Users" },
  { value: "visitor", label: "Visitors" },
  { value: "employee", label: "Employees" },
  { value: "booking", label: "Bookings" },
  { value: "host", label: "Hosts" },
  { value: "location", label: "Locations" },
  { value: "evacuation", label: "Evacuations" },
  { value: "settings", label: "Settings" },
  { value: "visitor_type", label: "Visitor Types" },
]

type AuditLogWithUser = Omit<AuditLog, 'user'> & {
  user: Profile | null
}

function getUserDisplayName(log: AuditLogWithUser): string {
  // If we have a linked user profile, use that
  if (log.user?.full_name) return log.user.full_name
  if (log.user?.email) return log.user.email

  // For kiosk/visitor actions without a linked user, derive from context
  const action = log.action
  if (action.startsWith("visitor.") || action.startsWith("booking.checked_in")) {
    // Extract visitor name from description if available
    const desc = log.description || ""
    const match = desc.match(/:\s*(.+?)(?:\s*\(|$)/)
    if (match) return match[1].trim()
    return "Visitor"
  }
  if (action.startsWith("employee.")) {
    const desc = log.description || ""
    const match = desc.match(/:\s*(.+?)(?:\s*\(|$)/)
    if (match) return match[1].trim()
    return "Employee"
  }
  if (action.startsWith("kiosk.")) {
    const desc = log.description || ""
    const match = desc.match(/kiosk:\s*(.+?)$/)
    if (match) return match[1].trim()
    return "Receptionist"
  }
  return "Unknown"
}

function getUserInitials(log: AuditLogWithUser): string {
  if (log.user?.full_name) {
    const parts = log.user.full_name.split(" ")
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    return log.user.full_name[0].toUpperCase()
  }
  if (log.user?.email) return log.user.email[0].toUpperCase()

  // Derive from action type
  const action = log.action
  if (action.startsWith("visitor.") || action.startsWith("booking.checked_in")) return "V"
  if (action.startsWith("employee.")) return "E"
  if (action.startsWith("kiosk.")) return "R"
  return "?"
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogWithUser[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<string>("all")
  const [selectedAction, setSelectedAction] = useState<string>("all")
  const { timezone: userTimezone } = useTimezone()
  // Default to last 7 days, allow up to 30 days lookback
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(subDays(new Date(), 7)))
  const [endDate, setEndDate] = useState<Date>(() => endOfDay(new Date()))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const minDate = subDays(new Date(), 30) // 30 days lookback limit
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const pageSize = 50

  async function loadLogs() {
    setIsLoading(true)
    const supabase = createClient()

    let query = supabase
      .from("audit_logs")
      .select("*, user:profiles(*)")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (selectedUserId !== "all") {
      query = query.eq("user_id", selectedUserId)
    }

    if (selectedAction !== "all") {
      query = query.ilike("entity_type", selectedAction)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error loading audit logs:", error)
      setLogs([])
    } else {
      setLogs(data as AuditLogWithUser[])
      setHasMore(data.length === pageSize)
    }

    setIsLoading(false)
  }

  async function loadUsers() {
    const supabase = createClient()
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .order("full_name")

    if (data) {
      setUsers(data as Profile[])
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    loadLogs()
  }, [startDate, endDate, selectedUserId, selectedAction, page])

  function navigatePage(direction: "prev" | "next") {
    if (direction === "prev" && page > 1) {
      setPage(page - 1)
    } else if (direction === "next" && hasMore) {
      setPage(page + 1)
    }
  }

  function getActionLabel(action: string): string {
    return ACTION_LABELS[action] || action
  }

  const dateRangeString = `${startDate.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })} - ${endDate.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}`

  function exportCsv() {
    if (logs.length === 0) return

    const headers = ["Date", "User", "Action", "Description"]
    const rows = logs.map((log) => [
      formatFullDateTime(log.created_at, userTimezone),
      getUserDisplayName(log),
      getActionLabel(log.action),
      (log.description || "").replace(/"/g, '""'),
    ])

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `audit-log-${format(startDate, "yyyy-MM-dd")}-to-${format(endDate, "yyyy-MM-dd")}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <TierGate feature="advancedAuditLogs" label="Advanced Audit Logs">
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Audit log</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Track all actions performed in the system</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent"
              onClick={() => loadLogs()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent"
              onClick={exportCsv}
              disabled={logs.length === 0 || isLoading}
            >
              <Download className="w-4 h-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="default" className="bg-primary text-primary-foreground gap-2">
                <Calendar className="h-4 w-4" />
                {dateRangeString}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-3 border-b">
                <p className="text-sm font-medium">Select date range (up to 30 days)</p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs bg-transparent"
                    onClick={() => {
                      setStartDate(startOfDay(new Date()))
                      setEndDate(endOfDay(new Date()))
                      setPage(1)
                    }}
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs bg-transparent"
                    onClick={() => {
                      setStartDate(startOfDay(subDays(new Date(), 7)))
                      setEndDate(endOfDay(new Date()))
                      setPage(1)
                    }}
                  >
                    Last 7 days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs bg-transparent"
                    onClick={() => {
                      setStartDate(startOfDay(subDays(new Date(), 30)))
                      setEndDate(endOfDay(new Date()))
                      setPage(1)
                    }}
                  >
                    Last 30 days
                  </Button>
                </div>
              </div>
              <CalendarComponent
                mode="range"
                selected={{ from: startDate, to: endDate }}
                onSelect={(range) => {
                  if (range?.from) {
                    setStartDate(startOfDay(range.from))
                    setEndDate(range.to ? endOfDay(range.to) : endOfDay(range.from))
                    setPage(1)
                  }
                }}
                disabled={(date) => date > new Date() || date < minDate}
                numberOfMonths={2}
                defaultMonth={subDays(new Date(), 30)}
              />
            </PopoverContent>
          </Popover>

          <Select value={selectedUserId} onValueChange={(v) => { setSelectedUserId(v); setPage(1) }}>
            <SelectTrigger className="w-auto min-w-28">
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name || user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedAction} onValueChange={(v) => { setSelectedAction(v); setPage(1) }}>
            <SelectTrigger className="w-auto min-w-28">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Data Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : logs.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No entries found.</p>
            ) : (
              <>
                {/* Mobile view */}
                <div className="md:hidden divide-y">
                  {logs.map((log) => {
                    const displayName = getUserDisplayName(log)
                    const initials = getUserInitials(log)
                    return (
                      <div key={log.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={log.user?.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{displayName}</p>
                              <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at, userTimezone)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">{getActionLabel(log.action)}</span>
                          {log.description && <span className="text-muted-foreground"> - {log.description}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Desktop view */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">Date</TableHead>
                        <TableHead className="w-48">User</TableHead>
                        <TableHead className="w-40">Action</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => {
                        const displayName = getUserDisplayName(log)
                        const initials = getUserInitials(log)
                        return (
                          <TableRow key={log.id}>
                            <TableCell className="text-sm">
                              {formatDateTime(log.created_at, userTimezone)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={log.user?.avatar_url || undefined} />
                                  <AvatarFallback className="text-xs">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{displayName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{getActionLabel(log.action)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{log.description || "-"}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-end gap-2 p-4 border-t">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigatePage("prev")}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigatePage("next")}
                    disabled={!hasMore}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </TierGate>
  )
}
