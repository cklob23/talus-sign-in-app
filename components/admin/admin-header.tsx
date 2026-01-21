"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bell, LogOut, User, LogIn, Clock, Building2 } from "lucide-react"
import { useRouter } from "next/navigation"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { formatDistanceToNow } from "date-fns"

interface CombinedActivity {
  id: string
  type: "visitor" | "employee"
  name: string
  sign_in_time: string
  sign_out_time: string | null
  badge_text: string
  badge_color: string
  location_name: string | null
}

interface SignInActivity {
  id: string
  visitor_name: string
  visitor_email: string
  sign_in_time: string
  sign_out_time: string | null
  badge_number: string
  visitor_type: { name: string; badge_color: string } | null
  location: { name: string } | null
}

interface SignInActivityRaw {
  id: string
  visitor_name: string
  visitor_email: string
  sign_in_time: string
  sign_out_time: string | null
  badge_number: string
  visitor_type: { name: string; badge_color: string }[] | { name: string; badge_color: string } | null
  location: { name: string }[] | { name: string } | null
}

export function AdminHeader() {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [notifications, setNotifications] = useState<CombinedActivity[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  useEffect(() => {
    fetchRecentActivity()
    
    // Set up real-time subscription for visitor sign-ins
    const supabase = createClient()
    const visitorChannel = supabase
      .channel('sign_ins_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sign_ins'
        },
        () => {
          fetchRecentActivity()
          setUnreadCount(prev => prev + 1)
        }
      )
      .subscribe()

    // Set up real-time subscription for employee sign-ins
    const employeeChannel = supabase
      .channel('employee_sign_ins_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'employee_sign_ins'
        },
        () => {
          fetchRecentActivity()
          setUnreadCount(prev => prev + 1)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(visitorChannel)
      supabase.removeChannel(employeeChannel)
    }
  }, [])

  async function fetchRecentActivity() {
    const supabase = createClient()
    const combined: CombinedActivity[] = []

    // Fetch visitor sign-ins
    const { data: visitorData } = await supabase
      .from('sign_ins')
      .select(`
        id,
        sign_in_time,
        sign_out_time,
        badge_number,
        visitor:visitors(first_name, last_name),
        visitor_type:visitor_types(name, badge_color),
        location:locations(name)
      `)
      .order('sign_in_time', { ascending: false })
      .limit(15)

    if (visitorData) {
      for (const item of visitorData) {
        const visitor = Array.isArray(item.visitor) ? item.visitor[0] : item.visitor
        const visitorType = Array.isArray(item.visitor_type) ? item.visitor_type[0] : item.visitor_type
        const location = Array.isArray(item.location) ? item.location[0] : item.location
        
        combined.push({
          id: item.id,
          type: "visitor",
          name: visitor ? `${visitor.first_name || ""} ${visitor.last_name || ""}`.trim() : "Unknown Visitor",
          sign_in_time: item.sign_in_time,
          sign_out_time: item.sign_out_time,
          badge_text: visitorType?.name || "Visitor",
          badge_color: visitorType?.badge_color || "#16a34a",
          location_name: location?.name || null,
        })
      }
    }

    // Fetch employee sign-ins
    const { data: employeeData } = await supabase
      .from('employee_sign_ins')
      .select(`
        id,
        sign_in_time,
        sign_out_time,
        profile:profiles(full_name, email),
        location:locations(name)
      `)
      .order('sign_in_time', { ascending: false })
      .limit(15)

    if (employeeData) {
      for (const item of employeeData) {
        const profile = Array.isArray(item.profile) ? item.profile[0] : item.profile
        const location = Array.isArray(item.location) ? item.location[0] : item.location
        
        combined.push({
          id: item.id,
          type: "employee",
          name: profile?.full_name || profile?.email || "Unknown Employee",
          sign_in_time: item.sign_in_time,
          sign_out_time: item.sign_out_time,
          badge_text: "Employee",
          badge_color: "#2563eb",
          location_name: location?.name || null,
        })
      }
    }

    // Sort by sign_in_time descending and take top 20
    combined.sort((a, b) => new Date(b.sign_in_time).getTime() - new Date(a.sign_in_time).getTime())
    setNotifications(combined.slice(0, 20))
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open)
    if (open) {
      setUnreadCount(0)
    }
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() || "AD"

  return (
    <header className="h-16 border-b bg-background flex items-center justify-between px-6">
      <div>
        <h2 className="text-lg font-semibold">Admin Portal</h2>
      </div>
      <div className="flex items-center gap-4">
        <Popover open={isOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive rounded-full text-xs text-destructive-foreground flex items-center justify-center font-medium">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="end">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Recent Activity</h3>
                <Badge variant="secondary" className="text-xs">
                  {notifications.length} events
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Sign-in and sign-out notifications
              </p>
            </div>
            <ScrollArea className="h-[400px]">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No recent activity</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((activity) => (
                    <div
                      key={`${activity.type}-${activity.id}`}
                      className="p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            activity.sign_out_time
                              ? 'bg-orange-100 text-orange-600'
                              : activity.type === 'employee'
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-primary/10 text-primary'
                          }`}
                        >
                          {activity.sign_out_time ? (
                            <LogOut className="w-5 h-5" />
                          ) : (
                            <LogIn className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">
                              {activity.name}
                            </p>
                            <Badge
                              variant="outline"
                              className="text-xs shrink-0"
                              style={{
                                borderColor: activity.badge_color,
                                color: activity.badge_color,
                              }}
                            >
                              {activity.badge_text}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {activity.sign_out_time ? 'Signed out' : 'Signed in'}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDistanceToNow(
                                new Date(activity.sign_out_time || activity.sign_in_time),
                                { addSuffix: true }
                              )}
                            </span>
                            {activity.location_name && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {activity.location_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="p-3 border-t">
              <Button
                variant="ghost"
                className="w-full text-sm"
                onClick={() => {
                  setIsOpen(false)
                  router.push('/admin/history')
                }}
              >
                View all activity
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">Account</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
