"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Download, Search } from "lucide-react"
import type { SignIn } from "@/types/database"

export function HistoryContent() {
  const [signIns, setSignIns] = useState<SignIn[]>([])
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  async function loadHistory() {
    setIsLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("sign_ins")
      .select(
        `
        *,
        visitor:visitors(*),
        host:hosts(*),
        visitor_type:visitor_types(*),
        location:locations(*)
      `,
      )
      .order("sign_in_time", { ascending: false })
      .limit(100)

    if (data) setSignIns(data as SignIn[])
    setIsLoading(false)
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const filteredSignIns = signIns.filter((signIn) => {
    const searchLower = search.toLowerCase()
    return (
      signIn.visitor?.first_name?.toLowerCase().includes(searchLower) ||
      signIn.visitor?.last_name?.toLowerCase().includes(searchLower) ||
      signIn.visitor?.company?.toLowerCase().includes(searchLower) ||
      signIn.host?.name?.toLowerCase().includes(searchLower)
    )
  })

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function formatDuration(signIn: SignIn) {
    if (!signIn.sign_out_time) return "Active"
    const mins = Math.floor(
      (new Date(signIn.sign_out_time).getTime() - new Date(signIn.sign_in_time).getTime()) / (1000 * 60),
    )
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
  }

  function handleExport() {
    const csv = [
      ["Name", "Email", "Company", "Type", "Host", "Sign In", "Sign Out", "Duration"],
      ...filteredSignIns.map((s) => [
        `${s.visitor?.first_name} ${s.visitor?.last_name}`,
        s.visitor?.email || "",
        s.visitor?.company || "",
        s.visitor_type?.name || "",
        s.host?.name || "",
        s.sign_in_time,
        s.sign_out_time || "",
        formatDuration(s),
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `visitor-history-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Visitor History</h1>
          <p className="text-muted-foreground">Complete log of all visitor sign-ins</p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sign-In Records</CardTitle>
              <CardDescription>Showing last 100 records</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search visitors..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : filteredSignIns.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No records found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visitor</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Sign In</TableHead>
                  <TableHead>Sign Out</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSignIns.map((signIn) => (
                  <TableRow key={signIn.id}>
                    <TableCell className="font-medium">
                      {signIn.visitor?.first_name} {signIn.visitor?.last_name}
                    </TableCell>
                    <TableCell>{signIn.visitor?.company || "-"}</TableCell>
                    <TableCell>
                      {signIn.visitor_type && (
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: signIn.visitor_type.badge_color,
                            color: signIn.visitor_type.badge_color,
                          }}
                        >
                          {signIn.visitor_type.name}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{signIn.host?.name || "-"}</TableCell>
                    <TableCell>{formatDateTime(signIn.sign_in_time)}</TableCell>
                    <TableCell>{signIn.sign_out_time ? formatDateTime(signIn.sign_out_time) : "-"}</TableCell>
                    <TableCell>
                      <Badge variant={signIn.sign_out_time ? "secondary" : "default"}>{formatDuration(signIn)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
