"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LogOut, RefreshCw } from "lucide-react"
import type { SignIn } from "@/types/database"

export default function CurrentVisitorsPage() {
  const [visitors, setVisitors] = useState<SignIn[]>([])
  const [isLoading, setIsLoading] = useState(true)

  async function loadVisitors() {
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
      .is("sign_out_time", null)
      .order("sign_in_time", { ascending: false })

    if (data) setVisitors(data as SignIn[])
    setIsLoading(false)
  }

  useEffect(() => {
    loadVisitors()
  }, [])

  async function handleSignOut(signInId: string) {
    const supabase = createClient()
    await supabase.from("sign_ins").update({ sign_out_time: new Date().toISOString() }).eq("id", signInId)
    loadVisitors()
  }

  function formatDuration(signInTime: string) {
    const mins = Math.floor((Date.now() - new Date(signInTime).getTime()) / (1000 * 60))
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Current Visitors</h1>
          <p className="text-muted-foreground">Visitors currently on-site</p>
        </div>
        <Button onClick={loadVisitors} variant="outline" disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>On-Site Visitors</CardTitle>
          <CardDescription>{visitors.length} visitor(s) currently signed in</CardDescription>
        </CardHeader>
        <CardContent>
          {visitors.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No visitors currently on-site</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visitor</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Badge</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitors.map((signIn) => (
                  <TableRow key={signIn.id}>
                    <TableCell className="font-medium">
                      {signIn.visitor?.first_name} {signIn.visitor?.last_name}
                      {signIn.visitor?.email && (
                        <span className="block text-xs text-muted-foreground">{signIn.visitor.email}</span>
                      )}
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
                    <TableCell className="font-mono">{signIn.badge_number}</TableCell>
                    <TableCell>{formatDuration(signIn.sign_in_time)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => handleSignOut(signIn.id)}>
                        <LogOut className="w-4 h-4 mr-1" />
                        Sign Out
                      </Button>
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
