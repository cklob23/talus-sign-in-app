"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { SignIn } from "@/types/database"

export function RecentVisitors() {
  const [visitors, setVisitors] = useState<SignIn[]>([])

  useEffect(() => {
    async function loadRecentVisitors() {
      const supabase = createClient()
      const { data } = await supabase
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

      if (data) setVisitors(data as SignIn[])
    }

    loadRecentVisitors()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Visitors</CardTitle>
        <CardDescription>Latest sign-ins at the facility</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {visitors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recent visitors</p>
          ) : (
            visitors.map((signIn) => (
              <div key={signIn.id} className="flex items-center gap-4">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {signIn.visitor?.first_name?.[0]}
                    {signIn.visitor?.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {signIn.visitor?.first_name} {signIn.visitor?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {signIn.host ? `Visiting ${signIn.host.name}` : "No host assigned"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
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
