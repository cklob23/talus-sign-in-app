"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"

interface TimezoneContextType {
  timezone: string
  isLoading: boolean
  setTimezone: (tz: string) => Promise<void>
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined)

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<string>("UTC")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadTimezone() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .single()
        
        if (profile?.timezone) {
          setTimezoneState(profile.timezone)
        } else {
          // Default to browser's timezone if not set
          const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
          setTimezoneState(browserTz || "UTC")
        }
      }
      setIsLoading(false)
    }
    
    loadTimezone()
  }, [])

  const setTimezone = async (tz: string) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      await supabase
        .from("profiles")
        .update({ timezone: tz })
        .eq("id", user.id)
      
      setTimezoneState(tz)
    }
  }

  return (
    <TimezoneContext.Provider value={{ timezone, isLoading, setTimezone }}>
      {children}
    </TimezoneContext.Provider>
  )
}

export function useTimezone() {
  const context = useContext(TimezoneContext)
  if (context === undefined) {
    // Return a default if used outside provider (for pages that don't need it)
    return { 
      timezone: "UTC", 
      isLoading: false, 
      setTimezone: async () => {} 
    }
  }
  return context
}
