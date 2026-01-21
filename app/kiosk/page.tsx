"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { TalusAgLogo } from "@/components/talusag-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  UserPlus,
  LogOut,
  CheckCircle,
  ArrowLeft,
  Clock,
  Building2,
  PlayCircle,
  AlertTriangle,
  MapPin,
  Briefcase,
  Loader2,
  User
} from "lucide-react"
import type { VisitorType, Host, Location, Profile } from "@/types/database"
import Link from "next/link"

type KioskMode = "home" | "sign-in" | "training" | "sign-out" | "employee-login" | "employee-dashboard" | "success"

// Storage key for remembered employee
const REMEMBERED_EMPLOYEE_KEY = "talusag_remembered_employee"

interface RememberedEmployee {
  id: string
  email: string
  fullName: string
  locationId: string | null
}

interface SignInForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  company: string
  visitorTypeId: string
  hostId: string
  purpose: string
}

export default function KioskPage() {
  const [mode, setMode] = useState<KioskMode>("home")
  const [visitorTypes, setVisitorTypes] = useState<VisitorType[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signOutEmail, setSignOutEmail] = useState("")
  const [successData, setSuccessData] = useState<{ name: string; badge: string; type: "in" | "out" } | null>(null)

  const [form, setForm] = useState<SignInForm>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    visitorTypeId: "",
    hostId: "",
    purpose: "",
  })

  // Geolocation state
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [isDetectingLocation, setIsDetectingLocation] = useState(true)
  const [nearestLocation, setNearestLocation] = useState<{ location: Location; distance: number } | null>(null)

  // Employee login state
  const [employeeEmail, setEmployeeEmail] = useState("")
  const [employeePassword, setEmployeePassword] = useState("")
  const [rememberedEmployee, setRememberedEmployee] = useState<RememberedEmployee | null>(null)
  const [currentEmployee, setCurrentEmployee] = useState<Profile | null>(null)
  const [employeeSignedIn, setEmployeeSignedIn] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  // Training video state
  const [trainingWatched, setTrainingWatched] = useState(false)
  const [trainingAcknowledged, setTrainingAcknowledged] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoStarted, setVideoStarted] = useState(false)
  const videoTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c // Distance in meters
  }, [])

  // Find nearest location based on user coordinates
  const findNearestLocation = useCallback((coords: { lat: number; lng: number }, locs: Location[]) => {
    let nearest: { location: Location; distance: number } | null = null

    for (const loc of locs) {
      if (loc.latitude && loc.longitude) {
        const distance = calculateDistance(coords.lat, coords.lng, loc.latitude, loc.longitude)
        if (!nearest || distance < nearest.distance) {
          nearest = { location: loc, distance }
        }
      }
    }

    return nearest
  }, [calculateDistance])

  // Get user's geolocation
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser")
      setIsDetectingLocation(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        setUserCoords(coords)
        setIsDetectingLocation(false)
      },
      (error) => {
        console.log("[v0] Geolocation error:", error.message)
        setGeoError("Unable to get your location. Please select manually.")
        setIsDetectingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  // Auto-select nearest location when coordinates and locations are available
  useEffect(() => {
    if (userCoords && locations.length > 0) {
      const nearest = findNearestLocation(userCoords, locations)
      if (nearest) {
        setNearestLocation(nearest)
        setSelectedLocation(nearest.location.id)
      }
    }
  }, [userCoords, locations, findNearestLocation])

  // Check for remembered employee and auto-login
  useEffect(() => {
    const stored = localStorage.getItem(REMEMBERED_EMPLOYEE_KEY)
    if (stored) {
      try {
        const employee = JSON.parse(stored) as RememberedEmployee
        setRememberedEmployee(employee)
        // Auto-login if at their location
        if (nearestLocation && employee.locationId === nearestLocation.location.id) {
          autoSignInEmployee(employee)
        }
      } catch (e) {
        localStorage.removeItem(REMEMBERED_EMPLOYEE_KEY)
      }
    }
  }, [nearestLocation])

  async function autoSignInEmployee(employee: RememberedEmployee) {
    if (!selectedLocation) {
      setError("No location selected. Please select a location first.")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Check if already signed in today
      const { data: existingSignIn } = await supabase
        .from("employee_sign_ins")
        .select("*")
        .eq("profile_id", employee.id)
        .is("sign_out_time", null)
        .single()

      if (!existingSignIn) {
        // Auto sign in - use selectedLocation instead of nearestLocation
        const { error: insertError } = await supabase.from("employee_sign_ins").insert({
          profile_id: employee.id,
          location_id: selectedLocation,
          auto_signed_in: true,
          device_id: navigator.userAgent,
        })

        if (insertError) {
          console.log("[v0] Employee sign-in insert error:", insertError)
          throw insertError
        }
      }

      setCurrentEmployee({
        id: employee.id,
        email: employee.email,
        full_name: employee.fullName,
        role: "employee",
        location_id: employee.locationId,
        created_at: "",
        updated_at: "",
      })
      setEmployeeSignedIn(true)
      setMode("employee-dashboard")
    } catch (err) {
      console.log("[v0] Auto sign-in error:", err)
      setError(err instanceof Error ? err.message : "Failed to auto sign in")
    } finally {
      setIsLoading(false)
    }
  }

  // Check for existing employee auth session on load
  useEffect(() => {
    async function checkExistingSession() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // User is authenticated, check if they have an employee profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()

        if (profile && ["employee", "admin", "staff"].includes(profile.role)) {
          setCurrentEmployee(profile)

          // Check if they have an active sign-in
          const { data: activeSignIn } = await supabase
            .from("employee_sign_ins")
            .select("*")
            .eq("profile_id", profile.id)
            .is("sign_out_time", null)
            .single()

          if (activeSignIn) {
            setEmployeeSignedIn(true)
            setMode("employee-dashboard")
          }
        }
      }
    }

    checkExistingSession()
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()

    const [{ data: locData }, { data: typesData }, { data: hostsData }] = await Promise.all([
      supabase.from("locations").select("*").order("name"),
      supabase.from("visitor_types").select("*").order("name"),
      supabase.from("hosts").select("*").eq("is_active", true).order("name"),
    ])

    if (locData && locData.length > 0) {
      setLocations(locData)
      setSelectedLocation(locData[0].id)
    }
    if (typesData) setVisitorTypes(typesData)
    if (hostsData) setHosts(hostsData)
  }

  // Check if visitor type requires training and redirect if needed
  function handleSignInSubmit(e: React.FormEvent) {
    e.preventDefault()
    const selectedType = visitorTypes.find((t) => t.id === form.visitorTypeId)

    if (selectedType?.requires_training) {
      // Go to training video step
      setMode("training")
    } else {
      // Proceed directly to sign in
      completeSignIn()
    }
  }

  // Start simulated video progress (since we can't track YouTube progress directly)
  function startVideoProgress() {
    if (videoStarted) return
    setVideoStarted(true)

    // Simulate 60 seconds of required watching time
    const totalDuration = 60
    let elapsed = 0

    videoTimerRef.current = setInterval(() => {
      elapsed += 1
      const progress = Math.min((elapsed / totalDuration) * 100, 100)
      setVideoProgress(progress)

      if (progress >= 100) {
        setTrainingWatched(true)
        if (videoTimerRef.current) {
          clearInterval(videoTimerRef.current)
        }
      }
    }, 1000)
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (videoTimerRef.current) {
        clearInterval(videoTimerRef.current)
      }
    }
  }, [])

  async function completeSignIn() {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Create or find visitor
      const { data: visitor, error: visitorError } = await supabase
        .from("visitors")
        .insert({
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email || null,
          phone: form.phone || null,
          company: form.company || null,
        })
        .select()
        .single()

      if (visitorError) throw visitorError

      // If training was required, record the completion
      const selectedType = visitorTypes.find((t) => t.id === form.visitorTypeId)
      if (selectedType?.requires_training) {
        await supabase.from("training_completions").insert({
          visitor_id: visitor.id,
          visitor_type_id: form.visitorTypeId,
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year expiry
        })
      }

      // Generate badge number
      const badgeNumber = `V${String(Date.now()).slice(-6)}`

      // Create sign-in record
      const { error: signInError } = await supabase.from("sign_ins").insert({
        visitor_id: visitor.id,
        location_id: selectedLocation,
        visitor_type_id: form.visitorTypeId || null,
        host_id: form.hostId || null,
        purpose: form.purpose || null,
        badge_number: badgeNumber,
      })

      if (signInError) throw signInError

      setSuccessData({
        name: `${form.firstName} ${form.lastName}`,
        badge: badgeNumber,
        type: "in",
      })
      setMode("success")
      resetForm()
      resetTraining()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in")
    } finally {
      setIsLoading(false)
    }
  }

  function resetTraining() {
    setTrainingWatched(false)
    setTrainingAcknowledged(false)
    setVideoProgress(0)
    setVideoStarted(false)
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current)
    }
  }

  async function handleSignOut(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // First, find visitor(s) with this email
      const { data: visitors, error: visitorError } = await supabase
        .from("visitors")
        .select("id, first_name, last_name")
        .eq("email", signOutEmail.toLowerCase().trim())

      if (visitorError) throw visitorError

      if (!visitors || visitors.length === 0) {
        throw new Error("No active sign-in found for this email")
      }

      // Get all visitor IDs
      const visitorIds = visitors.map((v) => v.id)

      // Find active sign-in for any of these visitors
      const { data: signIn, error: findError } = await supabase
        .from("sign_ins")
        .select("*, visitor:visitors(*)")
        .in("visitor_id", visitorIds)
        .is("sign_out_time", null)
        .order("sign_in_time", { ascending: false })
        .limit(1)
        .single()

      if (findError || !signIn) {
        throw new Error("No active sign-in found for this email")
      }

      // Update sign-out time
      const { error: updateError } = await supabase
        .from("sign_ins")
        .update({ sign_out_time: new Date().toISOString() })
        .eq("id", signIn.id)

      if (updateError) throw updateError

      setSuccessData({
        name: `${signIn.visitor?.first_name} ${signIn.visitor?.last_name}`,
        badge: signIn.badge_number || "",
        type: "out",
      })
      setMode("success")
      setSignOutEmail("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign out")
    } finally {
      setIsLoading(false)
    }
  }

  function resetForm() {
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      company: "",
      visitorTypeId: "",
      hostId: "",
      purpose: "",
    })
  }

  function handleReset() {
    setMode("home")
    setError(null)
    setSuccessData(null)
    resetForm()
    resetTraining()
    setSignOutEmail("")
    setEmployeeEmail("")
    setEmployeePassword("")
  }

  async function handleEmployeeLogin(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: employeeEmail,
        password: employeePassword,
      })

      if (authError) throw authError

      // Get employee profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authData.user.id)
        .single()

      if (profileError) throw profileError

      // Check if they have employee or admin/staff role
      if (!["employee", "admin", "staff"].includes(profile.role)) {
        throw new Error("You do not have permission to sign in as an employee")
      }

      setCurrentEmployee(profile)

      // Create employee sign-in record
      console.log("[v0] Creating employee sign-in for profile:", profile.id, "at location:", selectedLocation)
      const { error: signInError } = await supabase.from("employee_sign_ins").insert({
        profile_id: profile.id,
        location_id: selectedLocation,
        auto_signed_in: false,
        device_id: navigator.userAgent,
      })

      if (signInError) {
        console.log("[v0] Employee sign-in insert error:", signInError)
        throw signInError
      }

      // Remember employee if checkbox is checked
      if (rememberMe) {
        const rememberedData: RememberedEmployee = {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name || "",
          locationId: profile.location_id,
        }
        localStorage.setItem(REMEMBERED_EMPLOYEE_KEY, JSON.stringify(rememberedData))
        setRememberedEmployee(rememberedData)
      }

      setEmployeeSignedIn(true)
      setMode("employee-dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleEmployeeSignOut() {
    if (!currentEmployee) return
    setIsLoading(true)

    try {
      const supabase = createClient()

      // Find active employee sign-in
      const { data: signIn } = await supabase
        .from("employee_sign_ins")
        .select("*")
        .eq("profile_id", currentEmployee.id)
        .is("sign_out_time", null)
        .order("sign_in_time", { ascending: false })
        .limit(1)
        .single()

      if (signIn) {
        await supabase
          .from("employee_sign_ins")
          .update({ sign_out_time: new Date().toISOString() })
          .eq("id", signIn.id)
      }

      // Sign out of Supabase Auth
      await supabase.auth.signOut()

      setSuccessData({
        name: currentEmployee.full_name || currentEmployee.email,
        badge: "Employee",
        type: "out",
      })
      setCurrentEmployee(null)
      setEmployeeSignedIn(false)
      setMode("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign out")
    } finally {
      setIsLoading(false)
    }
  }

  function forgetEmployee() {
    localStorage.removeItem(REMEMBERED_EMPLOYEE_KEY)
    setRememberedEmployee(null)
  }

  const selectedVisitorType = visitorTypes.find((t) => t.id === form.visitorTypeId)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/30">
      <header className="bg-background/80 backdrop-blur-sm border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <TalusAgLogo />
          </Link>
          <div className="flex items-center gap-4">
            {/* Location indicator */}
            <div className="flex items-center gap-2 text-sm">
              {isDetectingLocation ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Detecting location...</span>
                </>
              ) : nearestLocation ? (
                <>
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="text-foreground font-medium">{nearestLocation.location.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {nearestLocation.distance < 1000
                      ? `${Math.round(nearestLocation.distance)}m away`
                      : `${(nearestLocation.distance / 1000).toFixed(1)}km away`}
                  </Badge>
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {locations.find((l) => l.id === selectedLocation)?.name || "Select location"}
                  </span>
                </>
              )}
            </div>
            {/* Location selector if multiple locations */}
            {locations.length > 1 && (
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Change location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {mode === "home" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-foreground mb-3">Visitor Check-In</h1>
              <p className="text-lg text-muted-foreground">Welcome to TalusAg. Please sign in or sign out below.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group"
                onClick={() => setMode("sign-in")}
              >
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <UserPlus className="w-8 h-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Sign In</CardTitle>
                  <CardDescription>New visitor? Sign in here</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" size="lg">
                    Sign In
                  </Button>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group"
                onClick={() => setMode("sign-out")}
              >
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4 group-hover:bg-secondary/80 transition-colors">
                    <LogOut className="w-8 h-8 text-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Sign Out</CardTitle>
                  <CardDescription>Leaving? Sign out here</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="secondary" className="w-full" size="lg">
                    Sign Out
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8">
              {/* Employee Login Card */}
              <Card
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group mb-6"
                onClick={() => setMode("employee-login")}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                        <Briefcase className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Employee Sign In</h3>
                        <p className="text-sm text-muted-foreground">TalusAg employees sign in here</p>
                      </div>
                    </div>
                    <ArrowLeft className="w-5 h-5 text-muted-foreground rotate-180" />
                  </div>
                </CardContent>
              </Card>

              {/* Remembered employee - show quick sign-out if signed in, otherwise show quick sign-in */}
              {rememberedEmployee && (
                <Card className={`mb-6 ${employeeSignedIn ? "border-green-200 bg-green-50/50" : "border-blue-200 bg-blue-50/50"}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold ${employeeSignedIn ? "bg-green-600" : "bg-blue-600"}`}>
                          {rememberedEmployee.fullName.charAt(0) || rememberedEmployee.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold">{rememberedEmployee.fullName || rememberedEmployee.email}</h3>
                          <p className="text-sm text-muted-foreground">
                            {employeeSignedIn ? (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-3 h-3" />
                                Currently signed in
                              </span>
                            ) : nearestLocation && rememberedEmployee.locationId === nearestLocation.location.id ? (
                              "You're at your registered location"
                            ) : (
                              "Quick sign in available"
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            forgetEmployee()
                          }}
                        >
                          Not you?
                        </Button>
                        {employeeSignedIn ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEmployeeSignOut()
                            }}
                            disabled={isLoading}
                          >
                            <LogOut className="w-4 h-4 mr-1" />
                            Sign Out
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              autoSignInEmployee(rememberedEmployee)
                            }}
                            disabled={isLoading}
                          >
                            Sign In
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" />
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        )}

        {mode === "sign-in" && (
          <div className="max-w-xl mx-auto">
            <Button variant="ghost" className="mb-6" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Visitor Sign In</CardTitle>
                <CardDescription>Please fill out the form below to sign in</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignInSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        required
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        placeholder="John"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name *</Label>
                      <Input
                        id="lastName"
                        required
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        placeholder="Doe"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="john.doe@example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="visitorType">Visitor Type *</Label>
                    <Select
                      value={form.visitorTypeId}
                      onValueChange={(value) => setForm({ ...form, visitorTypeId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select visitor type" />
                      </SelectTrigger>
                      <SelectContent>
                        {visitorTypes.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: type.badge_color }} />
                              {type.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedVisitorType?.requires_company && (
                    <div className="space-y-2">
                      <Label htmlFor="company">Company *</Label>
                      <Input
                        id="company"
                        required={selectedVisitorType.requires_company}
                        value={form.company}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        placeholder="Company name"
                      />
                    </div>
                  )}

                  {selectedVisitorType?.requires_host && (
                    <div className="space-y-2">
                      <Label htmlFor="host">Who are you visiting? *</Label>
                      <Select value={form.hostId} onValueChange={(value) => setForm({ ...form, hostId: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select host" />
                        </SelectTrigger>
                        <SelectContent>
                          {hosts.map((host) => (
                            <SelectItem key={host.id} value={host.id}>
                              {host.name} {host.department && `(${host.department})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="purpose">Purpose of Visit</Label>
                    <Textarea
                      id="purpose"
                      value={form.purpose}
                      onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                      placeholder="Brief description of your visit"
                      rows={3}
                    />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? "Processing..." : selectedVisitorType?.requires_training ? (
                      <>
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Continue to Training
                      </>
                    ) : (
                      "Complete Sign In"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "sign-out" && (
          <div className="max-w-md mx-auto">
            <Button variant="ghost" className="mb-6" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Visitor Sign Out</CardTitle>
                <CardDescription>Enter the email you used when signing in</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignOut} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signOutEmail">Email Address</Label>
                    <Input
                      id="signOutEmail"
                      type="email"
                      required
                      value={signOutEmail}
                      onChange={(e) => setSignOutEmail(e.target.value)}
                      placeholder="john.doe@example.com"
                    />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? "Signing Out..." : "Sign Out"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "employee-login" && (
          <div className="max-w-md mx-auto">
            <Button variant="ghost" className="mb-6" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Briefcase className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Employee Sign In</CardTitle>
                    <CardDescription>Sign in with your TalusAg credentials</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleEmployeeLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="employeeEmail">Email Address</Label>
                    <Input
                      id="employeeEmail"
                      type="email"
                      required
                      value={employeeEmail}
                      onChange={(e) => setEmployeeEmail(e.target.value)}
                      placeholder="you@talusag.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="employeePassword">Password</Label>
                    <Input
                      id="employeePassword"
                      type="password"
                      required
                      value={employeePassword}
                      onChange={(e) => setEmployeePassword(e.target.value)}
                      placeholder="Enter your password"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="rememberMe"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <label htmlFor="rememberMe" className="text-sm cursor-pointer">
                      Remember me on this device
                    </label>
                  </div>

                  {nearestLocation && (
                    <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Signing in at {nearestLocation.location.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {nearestLocation.distance < 1000
                            ? `${Math.round(nearestLocation.distance)}m from location`
                            : `${(nearestLocation.distance / 1000).toFixed(1)}km from location`}
                        </p>
                      </div>
                    </div>
                  )}

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "employee-dashboard" && currentEmployee && (
          <div className="max-w-md mx-auto">
            <Card className="border-blue-200">
              <CardHeader className="text-center">
                <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold">
                  {currentEmployee.full_name?.charAt(0) || currentEmployee.email.charAt(0).toUpperCase()}
                </div>
                <CardTitle className="text-2xl">
                  Welcome, {currentEmployee.full_name || currentEmployee.email}!
                </CardTitle>
                <CardDescription>You are signed in as an employee</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-medium">
                        {locations.find((l) => l.id === selectedLocation)?.name || "Unknown"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Signed in at</p>
                      <p className="font-medium">
                        {new Date().toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Role</p>
                      <p className="font-medium capitalize">{currentEmployee.role}</p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleEmployeeSignOut}
                  variant="destructive"
                  className="w-full"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing Out...
                    </>
                  ) : (
                    <>
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="w-full bg-transparent"
                >
                  Back to Kiosk Home
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "training" && selectedVisitorType && (
          <div className="max-w-3xl mx-auto">
            <Button variant="ghost" className="mb-6" onClick={() => setMode("sign-in")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Form
            </Button>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">
                      {selectedVisitorType.training_title || "Safety Training Required"}
                    </CardTitle>
                    <CardDescription>
                      As a {selectedVisitorType.name}, you must complete this training before signing in
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Video Container */}
                <div className="relative">
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                    {selectedVisitorType.training_video_url ? (
                      <iframe
                        src={selectedVisitorType.training_video_url}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Safety Training Video"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                        <PlayCircle className="w-16 h-16 mb-4 opacity-50" />
                        <p>Training video not available</p>
                        <p className="text-sm">Please contact reception for assistance</p>
                      </div>
                    )}
                  </div>

                  {/* Play overlay for tracking */}
                  {!videoStarted && selectedVisitorType.training_video_url && (
                    <div
                      className="absolute inset-0 bg-foreground/60 flex flex-col items-center justify-center cursor-pointer rounded-lg"
                      onClick={startVideoProgress}
                    >
                      <div className="w-20 h-20 rounded-full bg-background flex items-center justify-center mb-4 hover:scale-110 transition-transform">
                        <PlayCircle className="w-12 h-12 text-primary" />
                      </div>
                      <p className="text-background font-medium text-lg">Click to Start Training</p>
                    </div>
                  )}
                </div>

                {/* Progress Bar */}
                {videoStarted && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Training Progress</span>
                      <span className="font-medium">{Math.round(videoProgress)}%</span>
                    </div>
                    <Progress value={videoProgress} className="h-2" />
                    {!trainingWatched && (
                      <p className="text-sm text-muted-foreground">
                        Please watch the entire video to proceed
                      </p>
                    )}
                  </div>
                )}

                {/* Acknowledgment Checkbox */}
                {trainingWatched && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="acknowledge"
                        checked={trainingAcknowledged}
                        onCheckedChange={(checked) => setTrainingAcknowledged(checked === true)}
                        className="mt-1"
                      />
                      <label htmlFor="acknowledge" className="text-sm leading-relaxed cursor-pointer">
                        I confirm that I have watched and understood the safety training video. I agree to follow
                        all safety guidelines and procedures while on TalusAg premises. I understand that failure
                        to comply may result in being asked to leave the facility.
                      </label>
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                {/* Complete Button */}
                <Button
                  onClick={completeSignIn}
                  className="w-full"
                  size="lg"
                  disabled={!trainingWatched || !trainingAcknowledged || isLoading}
                >
                  {isLoading ? (
                    "Completing Sign In..."
                  ) : !trainingWatched ? (
                    <>
                      <Clock className="w-4 h-4 mr-2" />
                      Complete Training to Continue
                    </>
                  ) : !trainingAcknowledged ? (
                    "Please Acknowledge to Continue"
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Complete Sign In
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "success" && successData && (
          <div className="max-w-md mx-auto text-center">
            <Card className="border-primary/20">
              <CardContent className="pt-8 pb-8">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-primary" />
                </div>

                <h2 className="text-2xl font-bold mb-2">{successData.type === "in" ? "Welcome!" : "Goodbye!"}</h2>
                <p className="text-lg text-muted-foreground mb-6">{successData.name}</p>

                {successData.type === "in" && (
                  <div className="bg-secondary rounded-lg p-4 mb-6">
                    <p className="text-sm text-muted-foreground mb-1">Your Badge Number</p>
                    <p className="text-3xl font-mono font-bold text-foreground">{successData.badge}</p>
                  </div>
                )}

                <p className="text-sm text-muted-foreground mb-6">
                  {successData.type === "in"
                    ? "Please collect your visitor badge from reception."
                    : "Thank you for visiting TalusAg."}
                </p>

                <Button onClick={handleReset} size="lg" className="w-full">
                  Done
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
