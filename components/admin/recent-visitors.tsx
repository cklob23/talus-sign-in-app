"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { SignIn, EmployeeSignIn, Location } from "@/types/database"
import { formatTime } from "@/lib/timezone"
import { useTimezone } from "@/contexts/timezone-context"

interface CombinedSignIn {
  id: string
  type: "visitor" | "employee"
  name: string
  initials: string
  photo_url?: string | null
  sign_in_time: string
  badge_color?: string
  badge_text?: string
  subtitle: string
  timezone: string
}

export function RecentVisitors() {
  const [signIns, setSignIns] = useState<CombinedSignIn[]>([])
  const { timezone: userTimezone } = useTimezone()

  useEffect(() => {
    async function loadRecentSignIns() {
      const supabase = createClient()
      
      // Fetch visitor sign-ins
      const { data: visitorData } = await supabase
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
        .limit(5)

      // Fetch employee sign-ins
      const { data: employeeData } = await supabase
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

      // Combine and sort by sign_in_time
      const combined: CombinedSignIn[] = []

      if (visitorData) {
        for (const v of visitorData as (SignIn & { location?: Location })[]) {
          combined.push({
            id: v.id,
            type: "visitor",
            name: `${v.visitor?.first_name || ""} ${v.visitor?.last_name || ""}`.trim() || "Unknown Visitor",
            initials: `${v.visitor?.first_name?.[0] || ""}${v.visitor?.last_name?.[0] || ""}`,
            photo_url: v.visitor?.photo_url,
            sign_in_time: v.sign_in_time,
            badge_color: v.visitor_type?.badge_color,
            badge_text: v.visitor_type?.name,
            subtitle: v.host ? `Visiting ${v.host.name}` : "No host assigned",
            timezone: v.location?.timezone || "UTC",
          })
        }
      }

      if (employeeData) {
        for (const e of employeeData as (EmployeeSignIn & { location?: Location })[]) {
          const name = e.profile?.full_name || e.profile?.email || "Unknown Employee"
          combined.push({
            id: e.id,
            type: "employee",
            name,
            initials: name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
            photo_url: e.profile?.avatar_url,
            sign_in_time: e.sign_in_time,
            badge_color: "#2563eb", // Blue for employees
            badge_text: "Employee",
            subtitle: e.auto_signed_in ? "Auto sign-in" : "Manual sign-in",
            timezone: e.location?.timezone || "UTC",
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
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Recent Visitors</CardTitle>
        <CardDescription className="text-xs sm:text-sm">Latest sign-ins at the facility</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="space-y-3 sm:space-y-4">
          {signIns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recent sign-ins</p>
          ) : (
            signIns.map((signIn) => (
              <div key={signIn.id} className="flex items-center gap-3 sm:gap-4">
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                  <AvatarImage src={signIn.photo_url || undefined} alt={signIn.name} />
                  <AvatarFallback 
                    className={`text-xs sm:text-sm ${signIn.type === "employee" ? "bg-blue-100 text-blue-600" : "bg-primary/10 text-primary"}`}
                  >
                    {signIn.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">{signIn.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{signIn.subtitle}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {signIn.badge_text && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1.5 py-0 sm:px-2.5 sm:py-0.5"
                      style={{
                        borderColor: signIn.badge_color,
                        color: signIn.badge_color,
                      }}
                    >
                      <span className="hidden sm:inline">{signIn.badge_text}</span>
                      <span className="sm:hidden">{signIn.badge_text.slice(0, 3)}</span>
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatTime(signIn.sign_in_time, userTimezone)}
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
