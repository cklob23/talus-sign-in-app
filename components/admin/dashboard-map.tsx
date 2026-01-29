"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import dynamic from "next/dynamic"

// Dynamically import the map component to avoid SSR issues with Leaflet
const LocationMap = dynamic(
  () => import("./location-map").then((mod) => mod.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[400px] bg-muted rounded-lg flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading map...</div>
      </div>
    ),
  }
)

interface LocationWithStats {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  currentVisitors: number
  currentEmployees: number
}

export function DashboardMap() {
  const [locations, setLocations] = useState<LocationWithStats[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()

      // Get all locations
      const { data: locationsData } = await supabase
        .from("locations")
        .select("*")
        .order("name")

      if (!locationsData) {
        setIsLoading(false)
        return
      }

      // Get current visitor counts per location
      const { data: visitorCounts } = await supabase
        .from("sign_ins")
        .select("location_id")
        .is("sign_out_time", null)

      // Get current employee counts per location
      const { data: employeeCounts } = await supabase
        .from("employee_sign_ins")
        .select("location_id")
        .is("sign_out_time", null)

      // Calculate counts per location
      const visitorCountMap = new Map<string, number>()
      const employeeCountMap = new Map<string, number>()

      visitorCounts?.forEach((v) => {
        visitorCountMap.set(v.location_id, (visitorCountMap.get(v.location_id) || 0) + 1)
      })

      employeeCounts?.forEach((e) => {
        employeeCountMap.set(e.location_id, (employeeCountMap.get(e.location_id) || 0) + 1)
      })

      // Combine location data with counts
      const locationsWithStats: LocationWithStats[] = locationsData.map((loc) => ({
        id: loc.id,
        name: loc.name,
        address: loc.address,
        latitude: loc.latitude,
        longitude: loc.longitude,
        currentVisitors: visitorCountMap.get(loc.id) || 0,
        currentEmployees: employeeCountMap.get(loc.id) || 0,
      }))

      setLocations(locationsWithStats)
      setIsLoading(false)
    }

    loadData()

    // Set up real-time subscription for updates
    const supabase = createClient()
    
    const visitorChannel = supabase
      .channel("dashboard-visitors")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sign_ins" },
        () => loadData()
      )
      .subscribe()

    const employeeChannel = supabase
      .channel("dashboard-employees")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_sign_ins" },
        () => loadData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(visitorChannel)
      supabase.removeChannel(employeeChannel)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="w-full h-[400px] bg-muted rounded-lg flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading locations...</div>
      </div>
    )
  }

  return <LocationMap locations={locations} />
}
