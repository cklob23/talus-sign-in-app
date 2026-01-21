"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { SignIn, EmployeeSignIn } from "@/types/database"

interface CombinedSignIn {
  id: string
  type: "visitor" | "employee"
  name: string
  initials: string
  sign_in_time: string
  badge_color?: string
  badge_text?: string
  subtitle: string
}

export function RecentVisitors() {
  const [signIns, setSignIns] = useState<CombinedSignIn[]>([])

  useEffect(() => {
    async function loadRecentSignIns() {
      const supabase = createClient()
      
      // Fetch visitor sign-ins
      const { data: visitorData, error: visitorError } = await supabase
        .from("sign_ins")
        .select(
          `
          *,
          visitor:visitors(*),
          host:hosts(*),
          visitor_type:visitor_types(*)
        `,
        )
        .order("sign_in_time", { ascending: false })
        .limit(5)

      console.log("[v0] Visitor sign-ins:", visitorData, "Error:", visitorError)

      // Fetch employee sign-ins
      const { data: employeeData, error: employeeError } = await supabase
        .from("employee_sign_ins")
        .select(
          `
          *,
          profile:profiles(*),
          location:locations(*)
        `,
        )
        .order("sign_in_time", { ascending: false })
        .limit(5)

      console.log("[v0] Employee sign-ins:", employeeData, "Error:", employeeError)

      // Combine and sort by sign_in_time
      const combined: CombinedSignIn[] = []

      if (visitorData) {
        for (const v of visitorData as SignIn[]) {
          combined.push({
            id: v.id,
            type: "visitor",
            name: `${v.visitor?.first_name || ""} ${v.visitor?.last_name || ""}`.trim() || "Unknown Visitor",
            initials: `${v.visitor?.first_name?.[0] || ""}${v.visitor?.last_name?.[0] || ""}`,
            sign_in_time: v.sign_in_time,
            badge_color: v.visitor_type?.badge_color,
            badge_text: v.visitor_type?.name,
            subtitle: v.host ? `Visiting ${v.host.name}` : "No host assigned",
          })
        }
      }

      if (employeeData) {
        for (const e of employeeData as EmployeeSignIn[]) {
          const name = e.profile?.full_name || e.profile?.email || "Unknown Employee"
          combined.push({
            id: e.id,
            type: "employee",
            name,
            initials: name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
            sign_in_time: e.sign_in_time,
            badge_color: "#2563eb", // Blue for employees
            badge_text: "Employee",
            subtitle: e.auto_signed_in ? "Auto sign-in" : "Manual sign-in",
          })
        }
      }

      // Sort by sign_in_time descending and take top 5
      combined.sort((a, b) => new Date(b.sign_in_time).getTime() - new Date(a.sign_in_time).getTime())
      setSignIns(combined.slice(0, 5))
    }

    loadRecentSignIns()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Visitors</CardTitle>
        <CardDescription>Latest sign-ins at the facility</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {signIns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recent sign-ins</p>
          ) : (
            signIns.map((signIn) => (
              <div key={signIn.id} className="flex items-center gap-4">
                <Avatar>
                  <AvatarFallback 
                    className={signIn.type === "employee" ? "bg-blue-100 text-blue-600" : "bg-primary/10 text-primary"}
                  >
                    {signIn.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{signIn.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{signIn.subtitle}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {signIn.badge_text && (
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: signIn.badge_color,
                        color: signIn.badge_color,
                      }}
                    >
                      {signIn.badge_text}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(signIn.sign_in_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
