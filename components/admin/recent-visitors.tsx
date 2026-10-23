"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { SignIn, EmployeeSignIn, Location } from "@/types/database"
import { formatTime, formatDateTime, toIANATimezone } from "@/lib/timezone"
import { useTimezone } from "@/contexts/timezone-context"
import {
  RECENT_ACTIVITY_DESCRIPTION,
  RECENT_ACTIVITY_EMPTY,
  combineRecentActivity,
  type RecentActivityItem,
} from "@/lib/recent-visitors"

// Format time, adding date if not from today
function formatSignInTime(utcDateString: string, timezone: string): string {
  const signInDate = new Date(utcDateString)
  const now = new Date()
  const iana = toIANATimezone(timezone)

  // Get today's date in the specified timezone
  const todayInTz = new Date(now.toLocaleString("en-US", { timeZone: iana }))
  const signInInTz = new Date(signInDate.toLocaleString("en-US", { timeZone: iana }))

  const isToday =
    todayInTz.getFullYear() === signInInTz.getFullYear() &&
    todayInTz.getMonth() === signInInTz.getMonth() &&
    todayInTz.getDate() === signInInTz.getDate()

  if (isToday) {
    return formatTime(utcDateString, iana)
  }
  return formatDateTime(utcDateString, iana)
}

export function RecentVisitors() {
  const [signIns, setSignIns] = useState<RecentActivityItem[]>([])
  const { timezone: userTimezone } = useTimezone()

  useEffect(() => {
    async function loadRecentSignIns() {
      const supabase = createClient()

      const [{ data: visitorData }, { data: employeeData }] = await Promise.all([
        supabase
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
          .limit(5),
        supabase
          .from("employee_sign_ins")
          .select(
            `
          *,
          profile:profiles(*),
          location:locations(*)
        `,
          )
          .order("sign_in_time", { ascending: false })
          .limit(5),
      ])

      setSignIns(
        combineRecentActivity(
          (visitorData as (SignIn & { location?: Location })[]) ?? [],
          (employeeData as (EmployeeSignIn & { location?: Location })[]) ?? [],
          5,
        ),
      )
    }

    loadRecentSignIns()
  }, [])

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Recent Visitors</CardTitle>
        <CardDescription className="text-xs sm:text-sm">{RECENT_ACTIVITY_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="space-y-3 sm:space-y-4">
          {signIns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{RECENT_ACTIVITY_EMPTY}</p>
          ) : (
            signIns.map((signIn) => (
              <div key={signIn.id} className="flex items-center gap-3 sm:gap-4">
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                  <AvatarImage src={signIn.photo_url || undefined} alt={signIn.name} />
                  <AvatarFallback
                    className={`text-xs sm:text-sm ${signIn.type === "employee" ? "bg-blue-100 text-blue-600" : "bg-accent text-primary-text"}`}
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
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatSignInTime(signIn.sign_in_time, userTimezone)}
                  </span>
                  {!signIn.on_site ? (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Signed out</span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
