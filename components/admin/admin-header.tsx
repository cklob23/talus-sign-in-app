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

interface VisitorType {
  name: string
  badge_color: string
}

interface Location {
  name: string
}

interface SignInActivityRaw {
  id: string
  visitor_name: string
  visitor_email: string
  sign_in_time: string
  sign_out_time: string | null
  badge_number: string
  visitor_type: VisitorType | VisitorType[] | null
  location: Location | Location[] | null
}

interface SignInActivity {
  id: string
  visitor_name: string
  visitor_email: string
  sign_in_time: string
  sign_out_time: string | null
  badge_number: string
  visitor_type: VisitorType | null
  location: Location | null
}

export function AdminHeader() {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [notifications, setNotifications] = useState<SignInActivity[]>([])
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
    
    // Set up real-time subscription for new sign-ins
    const supabase = createClient()
    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchRecentActivity() {
    const supabase = createClient()
    const { data } = await supabase
      .from('sign_ins')
      .select(`
        id,
        visitor_name,
        visitor_email,
        sign_in_time,
        sign_out_time,
        badge_number,
        visitor_type:visitor_types(name, badge_color),
        location:locations(name)
      `)
      .order('sign_in_time', { ascending: false })
      .limit(20)

    if (data) {
      // Transform data to handle array vs object responses from Supabase joins
      const transformed: SignInActivity[] = (data as SignInActivityRaw[]).map((item) => ({
        ...item,
        visitor_type: Array.isArray(item.visitor_type) 
          ? item.visitor_type[0] || null 
          : item.visitor_type,
        location: Array.isArray(item.location) 
          ? item.location[0] || null 
          : item.location,
      }))
      setNotifications(transformed)
    }
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
                      key={activity.id}
                      className="p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            activity.sign_out_time
                              ? 'bg-orange-100 text-orange-600'
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
                              {activity.visitor_name}
                            </p>
                            {activity.visitor_type && (
                              <Badge
                                variant="outline"
                                className="text-xs shrink-0"
                                style={{
                                  borderColor: activity.visitor_type.badge_color,
                                  color: activity.visitor_type.badge_color,
                                }}
                              >
                                {activity.visitor_type.name}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {activity.sign_out_time ? 'Signed out' : 'Signed in'}
                            {activity.badge_number && (
                              <span className="ml-1">
                                - Badge #{activity.badge_number}
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDistanceToNow(
                                new Date(activity.sign_out_time || activity.sign_in_time),
                                { addSuffix: true }
                              )}
                            </span>
                            {activity.location && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {activity.location.name}
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
