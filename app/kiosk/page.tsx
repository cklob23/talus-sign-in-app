"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
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
  User,
  CalendarCheck,
  Search,
  Camera,
  RefreshCw,
  Lock,
  Shield,
} from "lucide-react"
import type { VisitorType, Host, Location, Profile } from "@/types/database"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatTime, formatDate, formatDateTime, getTimezoneAbbreviation, toIANATimezone } from "@/lib/timezone"
import { logAudit, logAuditViaApi } from "@/lib/audit-log"
import { loadPasswordPolicy, isPasswordExpired, needsReauthentication, getDaysUntilExpiration } from "@/lib/password-policy"
import { useBranding } from "@/hooks/use-branding"

type KioskMode = "receptionist-login" | "home" | "sign-in" | "booking" | "training" | "sign-out" | "employee-login" | "employee-dashboard" | "success" | "photo"

// Storage key for remembered employee
const REMEMBERED_EMPLOYEE_KEY = "talusag_remembered_employee"

interface RememberedEmployee {
  id: string
  email: string
  fullName: string
  locationId: string | null
  role: "admin" | "staff" | "viewer" | "employee"
  avatar_url: string | null
  created_at: string
  updated_at: string
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
  const searchParams = useSearchParams()
  const router = useRouter()
  const { branding } = useBranding()
  const [mode, setMode] = useState<KioskMode>("receptionist-login")
  const [receptionistUser, setReceptionistUser] = useState<{ id: string; email: string; name: string } | null>(null)
  const [receptionistEmail, setReceptionistEmail] = useState("")
  const [receptionistPassword, setReceptionistPassword] = useState("")
  const [receptionistLoading, setReceptionistLoading] = useState(true)
  const [receptionistError, setReceptionistError] = useState<string | null>(null)
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
  const [selectedLocationDistance, setSelectedLocationDistance] = useState<number | null>(null)
  const [userLocationName, setUserLocationName] = useState<string | null>(null)

  // Employee login state
  const [employeeEmail, setEmployeeEmail] = useState("")
  const [employeePassword, setEmployeePassword] = useState("")
  const [rememberedEmployee, setRememberedEmployee] = useState<RememberedEmployee | null>(null)
  const [currentEmployee, setCurrentEmployee] = useState<Profile | null>(null)
  const [employeeSignInRecord, setEmployeeSignInRecord] = useState<{ sign_in_time: string; location_name?: string; timezone?: string } | null>(null)
  const [employeeSignedIn, setEmployeeSignedIn] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  // Training video state
  const [trainingWatched, setTrainingWatched] = useState(false)
  const [trainingAcknowledged, setTrainingAcknowledged] = useState(false)
  const [bypassTraining, setBypassTraining] = useState(false)
  const [visitorPhotoUrl, setVisitorPhotoUrl] = useState<string | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoStarted, setVideoStarted] = useState(false)
  const videoTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Distance unit preference
  const [useMiles, setUseMiles] = useState(false)

  // Settings state
  const [hostNotificationsEnabled, setHostNotificationsEnabled] = useState(true)
  const [badgePrintingEnabled, setBadgePrintingEnabled] = useState(false)

  // Clock state for displaying local time
  const [currentTime, setCurrentTime] = useState(new Date())

  // Booking lookup state
  const [bookingEmail, setBookingEmail] = useState("")
  const [bookingResults, setBookingResults] = useState<Array<{
    id: string
    visitor_first_name: string
    visitor_last_name: string
    visitor_email: string
    visitor_company: string | null
    expected_arrival: string
    expected_departure: string | null
    purpose: string | null
    status: string
    host_id: string | null
    location_id: string
    visitor_type_id: string | null
    visitor_type: { id: string; name: string; badge_color: string; requires_training: boolean } | null
  }>>([])
  const [selectedBooking, setSelectedBooking] = useState<typeof bookingResults[0] | null>(null)

  // Check if receptionist is already authenticated via separate cookie
  useEffect(() => {
    async function checkReceptionistSession() {
      try {
        const response = await fetch("/api/kiosk/receptionist-session")
        const data = await response.json()

        if (data.authenticated && data.user) {
          setReceptionistUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
          })
          setMode("home")
        }
      } catch (err) {
        console.error("Failed to check receptionist session:", err)
      } finally {
        setReceptionistLoading(false)
      }
    }
    checkReceptionistSession()
  }, [])

  // Receptionist login with email/password
  async function handleReceptionistLogin(e: React.FormEvent) {
    e.preventDefault()
    setReceptionistLoading(true)
    setReceptionistError(null)

    try {
      // Use the separate receptionist session API (does not create a Supabase session)
      const response = await fetch("/api/kiosk/receptionist-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "password",
          email: receptionistEmail,
          password: receptionistPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Login failed")
      }

      await logAuditViaApi({
        action: "kiosk.receptionist_login",
        entityType: "user",
        entityId: data.user.id,
        description: `Receptionist logged into kiosk: ${data.user.name} (${data.user.email})`,
        metadata: { method: "password", portal: "kiosk", email: data.user.email, role: data.user.role },
        userId: data.user.id,
      })

      setReceptionistUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
      })
      setReceptionistEmail("")
      setReceptionistPassword("")
      setMode("home")
    } catch (error: unknown) {
      setReceptionistError(error instanceof Error ? error.message : "Login failed")
    } finally {
      setReceptionistLoading(false)
    }
  }

  // Receptionist login with Microsoft
  async function handleReceptionistMicrosoftLogin() {
    setReceptionistLoading(true)
    setReceptionistError(null)

    try {
      const supabase = createClient()

      const callbackUrl = `${window.location.origin}/auth/callback?type=kiosk&next=/kiosk`

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          redirectTo: callbackUrl,
          scopes: "email profile openid User.Read",
          queryParams: {
            prompt: "select_account",
          },
        },
      })

      if (error) throw error
    } catch (error: unknown) {
      setReceptionistError(error instanceof Error ? error.message : "Microsoft login failed")
      setReceptionistLoading(false)
    }
  }

  // Receptionist logout - locks the kiosk (only clears the receptionist cookie, not Supabase auth)
  async function handleReceptionistLogout() {
    await logAuditViaApi({
      action: "kiosk.receptionist_logout",
      entityType: "user",
      entityId: receptionistUser?.id,
      description: `Receptionist logged out of kiosk: ${receptionistUser?.name} (${receptionistUser?.email})`,
      metadata: { portal: "kiosk", email: receptionistUser?.email },
      userId: receptionistUser?.id,
    })

    // Only clear the receptionist session cookie - does NOT affect admin Supabase sessions
    await fetch("/api/kiosk/receptionist-session", { method: "DELETE" })
    setReceptionistUser(null)
    setMode("receptionist-login")
  }

  // Handle OAuth callback from Microsoft login
  useEffect(() => {
    const employeeSignedIn = searchParams.get("employee_signed_in")
    const profileId = searchParams.get("profile_id")
    const oauthError = searchParams.get("error")

    if (oauthError) {
      if (oauthError === "not_employee") {
        setError("Your account is not registered as an employee. Please contact an administrator.")
      } else if (oauthError === "profile_creation_failed") {
        setError("Failed to create your profile. Please try again or contact support.")
      } else if (oauthError === "no_profile") {
        setReceptionistError("No profile found for this account. Please contact an administrator.")
        setMode("receptionist-login")
      } else {
        setError("Sign in failed. Please try again.")
      }
      // Clear the URL params
      router.replace("/kiosk")
      return
    }

    if (employeeSignedIn === "true" && profileId) {
      // Fetch the employee profile and show dashboard
      async function loadEmployeeAfterOAuth() {
        const supabase = createClient()
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", profileId)
          .single()

        if (profile) {
          // Fetch the latest sign-in record to get time and location
          const { data: signInRecord } = await supabase
            .from("employee_sign_ins")
            .select("sign_in_time, location:locations(name, timezone)")
            .eq("profile_id", profile.id)
            .is("sign_out_time", null)
            .order("sign_in_time", { ascending: false })
            .limit(1)
            .single()

          setCurrentEmployee({
            id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            phone: profile.phone || null,
            department: profile.department || null,
            location_id: profile.location_id,
            role: profile.role,
            avatar_url: profile.avatar_url,
            last_password_change: profile.last_password_change,
            last_auth_time: profile.last_auth_time,
            failed_login_attempts: profile.failed_login_attempts,
            account_locked_until: profile.account_locked_until,
            timezone: profile.timezone,
            created_at: profile.created_at,
            updated_at: profile.updated_at,
          })

          if (signInRecord) {
            const locations = Array.isArray(signInRecord.location) ? signInRecord.location : [signInRecord.location]
            const loc = locations?.[0] as { name: string; timezone: string } | null | undefined
            setEmployeeSignInRecord({
              sign_in_time: signInRecord.sign_in_time,
              location_name: loc?.name,
              timezone: loc?.timezone,
            })
          }
          setEmployeeSignedIn(true)
          setMode("employee-dashboard")

          // Remember this employee
          if (typeof window !== "undefined") {
            localStorage.setItem("rememberedEmployee", JSON.stringify({
              id: profile.id,
              email: profile.email,
              fullName: profile.full_name,
              locationId: profile.location_id,
            }))
          }
        }

        // Clear the URL params
        router.replace("/kiosk")
      }

      loadEmployeeAfterOAuth()
    }
  }, [searchParams, router])

  // Load settings from database based on selected location
  useEffect(() => {
    async function loadSettings() {
      if (!selectedLocation) return

      const supabase = createClient()
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .eq("location_id", selectedLocation)

      // Reset to defaults first
      setUseMiles(false)
      setHostNotificationsEnabled(true)
      setBadgePrintingEnabled(false)

      if (data && data.length > 0) {
        for (const setting of data) {
          if (setting.key === "distance_unit_miles") {
            setUseMiles(setting.value === true || setting.value === "true")
          }
          if (setting.key === "host_notifications") {
            setHostNotificationsEnabled(setting.value === true || setting.value === "true")
          }
          if (setting.key === "badge_printing") {
            setBadgePrintingEnabled(setting.value === true || setting.value === "true")
          }
        }
      }
    }
    loadSettings()
  }, [selectedLocation])

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

  // Format distance with unit preference
  const formatDistance = useCallback((meters: number, suffix = "away"): string => {
    if (useMiles) {
      const miles = meters / 1609.34
      if (miles < 0.1) {
        const feet = Math.round(meters * 3.28084)
        return `${feet}ft ${suffix}`
      }
      return `${miles.toFixed(1)}mi ${suffix}`
    }
    // Metric
    if (meters < 1000) {
      return `${Math.round(meters)}m ${suffix}`
    }
    return `${(meters / 1000).toFixed(1)}km ${suffix}`
  }, [useMiles])

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

  // Reverse geocode user coordinates to get location name
  useEffect(() => {
    if (!userCoords) return

    async function reverseGeocode() {
      try {
        // Using OpenStreetMap's Nominatim API for reverse geocoding (free, no API key needed)
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${userCoords?.lat}&lon=${userCoords?.lng}&zoom=10`,
          { headers: { "User-Agent": "TalusSignIn/1.0" } }
        )

        if (response.ok) {
          const data = await response.json()
          // Get city/town/village name, falling back to county or state
          const locationName =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.county ||
            data.address?.state ||
            null
          setUserLocationName(locationName)
        }
      } catch (err) {
        console.log("[v0] Reverse geocoding error:", err)
        // Non-critical, just won't show the location name
      }
    }

    reverseGeocode()
  }, [userCoords])

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

  // Calculate distance to selected location when it changes
  useEffect(() => {
    if (userCoords && selectedLocation) {
      const selectedLoc = locations.find(l => l.id === selectedLocation)
      if (selectedLoc?.latitude && selectedLoc?.longitude) {
        const distance = calculateDistance(
          userCoords.lat,
          userCoords.lng,
          selectedLoc.latitude,
          selectedLoc.longitude
        )
        setSelectedLocationDistance(distance)
      } else {
        setSelectedLocationDistance(null)
      }
    } else {
      setSelectedLocationDistance(null)
    }
  }, [userCoords, selectedLocation, locations, calculateDistance])

  // Get the current selected location object
  const currentLocation = locations.find(l => l.id === selectedLocation)
  const isSelectedDifferentFromNearest = nearestLocation && selectedLocation !== nearestLocation.location.id
  const currentTimezone = currentLocation?.timezone || "UTC"

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

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

  // Pre-fill employee email when entering employee-login mode with a remembered employee
  useEffect(() => {
    if (mode === "employee-login" && rememberedEmployee?.email) {
      setEmployeeEmail(rememberedEmployee.email)
    }
  }, [mode, rememberedEmployee])

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

      const currentLoc = locations.find(l => l.id === selectedLocation)
      const locationName = currentLoc?.name
      const locationTimezone = currentLoc?.timezone
      let signInTime = new Date().toISOString()

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
      } else {
        signInTime = existingSignIn.sign_in_time
      }

      setCurrentEmployee({
        id: employee.id,
        email: employee.email,
        full_name: employee.fullName,
        phone: null,
        department: null,
        role: employee.role,
        location_id: employee.locationId,
        avatar_url: employee.avatar_url,
        last_password_change: null,
        last_auth_time: null,
        failed_login_attempts: 0,
        account_locked_until: null,
        timezone: null,
        created_at: "",
        updated_at: "",
      })
      setEmployeeSignInRecord({ sign_in_time: signInTime, location_name: locationName, timezone: locationTimezone })
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
            .select("*, location:locations(name, timezone)")
            .eq("profile_id", profile.id)
            .is("sign_out_time", null)
            .order("sign_in_time", { ascending: false })
            .limit(1)
            .single()

          if (activeSignIn) {
            const loc = activeSignIn.location as { name: string; timezone: string } | null
            setEmployeeSignInRecord({
              sign_in_time: activeSignIn.sign_in_time,
              location_name: loc?.name,
              timezone: loc?.timezone,
            })
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
      supabase.from("hosts").select("*, profile:profiles(id, full_name, email, phone, department)").eq("is_active", true).order("name"),
    ])

    if (locData && locData.length > 0) {
      setLocations(locData)
      setSelectedLocation(locData[0].id)
    }
    if (typesData) setVisitorTypes(typesData)
    if (hostsData) setHosts(hostsData)
  }

  // Lookup bookings by email
  async function handleBookingLookup(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setBookingResults([])
    setSelectedBooking(null)

    try {
      const supabase = createClient()

      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id,
          visitor_first_name,
          visitor_last_name,
          visitor_email,
          visitor_company,
          expected_arrival,
          expected_departure,
          purpose,
          status,
          host_id,
          location_id,
          visitor_type_id,
          visitor_type:visitor_types(id, name, badge_color, requires_training)
        `)
        .ilike("visitor_email", bookingEmail.trim())
        .eq("status", "pending")
        .order("expected_arrival")

      if (bookingsError) throw bookingsError

      if (!bookings || bookings.length === 0) {
        setError("No bookings found for today with this email address. Please check your email or sign in as a new visitor.")
        return
      }

      // Transform the results to match expected type (convert array fields to single objects)
      // Note: host_id and visitor_type_id are UUID strings - visitor_type join may return as array
      const transformedBookings = bookings.map((booking: any) => ({
        ...booking,
        host_id: booking.host_id, // Preserve host_id as-is (UUID string)
        visitor_type_id: booking.visitor_type_id, // Preserve visitor_type_id as-is (UUID string)
        visitor_type: Array.isArray(booking.visitor_type) && booking.visitor_type.length > 0 ? booking.visitor_type[0] : booking.visitor_type,
      })) as typeof bookingResults

      setBookingResults(transformedBookings)

      // If only one booking, auto-select it
      if (bookings.length === 1) {
        const transformedBooking = {
          ...bookings[0],
          host_id: bookings[0].host_id, // host_id is a UUID string, not an array
          visitor_type_id: bookings[0].visitor_type_id, // visitor_type_id is a UUID string
          visitor_type: Array.isArray(bookings[0].visitor_type) && bookings[0].visitor_type.length > 0 ? bookings[0].visitor_type[0] : null,
        } as typeof bookingResults[0]
        setSelectedBooking(transformedBooking)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to lookup booking")
    } finally {
      setIsLoading(false)
    }
  }

  // Complete sign-in for a pre-registered booking
  async function handleBookingSignIn() {
    if (!selectedBooking) return
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Fetch visitor type if we have an ID but no joined data
      let visitorTypeData = selectedBooking.visitor_type
      if (!visitorTypeData && selectedBooking.visitor_type_id) {
        const { data: fetchedType } = await supabase
          .from("visitor_types")
          .select("id, name, badge_color, requires_training")
          .eq("id", selectedBooking.visitor_type_id)
          .single()
        if (fetchedType) {
          visitorTypeData = fetchedType
        }
      }

      // Check if visitor type requires training
      if (visitorTypeData?.requires_training) {
        // First, find or create the visitor
        let visitorId: string | null = null

        const { data: existingVisitor } = await supabase
          .from("visitors")
          .select("id")
          .eq("email", selectedBooking.visitor_email)
          .single()

        if (existingVisitor) {
          visitorId = existingVisitor.id

          // Check for existing training completion
          const { data: trainingCompletion } = await supabase
            .from("training_completions")
            .select("*")
            .eq("visitor_id", existingVisitor.id)
            .eq("visitor_type_id", visitorTypeData!.id)
            .single()

          if (trainingCompletion) {
            const hasExpired = trainingCompletion.expires_at &&
              new Date(trainingCompletion.expires_at) < new Date()

            if (!hasExpired) {
              // Training is valid, proceed with sign-in
              await completeBookingSignIn(visitorId)
              return
            }
          }
        }

        // Need to show training video
        // Send host notification BEFORE training starts
        if (hostNotificationsEnabled && selectedBooking.host_id) {
          const { data: hostData } = await supabase
            .from("hosts")
            .select("id, name, email, profile_id")
            .eq("id", selectedBooking.host_id)
            .single()

          if (hostData) {
            let hostEmail = hostData.email
            let hostName = hostData.name

            if (hostData.profile_id) {
              const { data: profileData } = await supabase
                .from("profiles")
                .select("full_name, email")
                .eq("id", hostData.profile_id)
                .single()

              if (profileData) {
                hostName = profileData.full_name || hostName
                hostEmail = profileData.email || hostEmail
              }
            }

            if (hostEmail) {
              try {
                await fetch("/api/notify-host", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    hostEmail,
                    hostName,
                    visitorName: `${selectedBooking.visitor_first_name} ${selectedBooking.visitor_last_name}`,
                    visitorCompany: selectedBooking.visitor_company,
                    purpose: selectedBooking.purpose,
                    locationName: currentLocation?.name,
                    notificationType: "completing_training",
                    visitorTypeName: visitorTypeData?.name,
                  }),
                })
              } catch (notifyErr) {
                console.error("Failed to send pre-training notification:", notifyErr)
              }
            }
          }
        }

        // Pre-fill the form with booking data for after training
        setForm({
          firstName: selectedBooking.visitor_first_name,
          lastName: selectedBooking.visitor_last_name,
          email: selectedBooking.visitor_email,
          phone: "",
          company: selectedBooking.visitor_company || "",
          visitorTypeId: visitorTypeData!.id,
          hostId: selectedBooking.host_id || "",
          purpose: selectedBooking.purpose || "",
        })
        setMode("training")
        setIsLoading(false)
        return
      }

      // No training required, proceed to photo capture
      setForm({
        firstName: selectedBooking.visitor_first_name,
        lastName: selectedBooking.visitor_last_name,
        email: selectedBooking.visitor_email,
        phone: "",
        company: selectedBooking.visitor_company || "",
        visitorTypeId: selectedBooking.visitor_type_id || selectedBooking.visitor_type?.id || "",
        hostId: selectedBooking.host_id || "",
        purpose: selectedBooking.purpose || "",
      })
      proceedToPhoto()
      setIsLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in")
      setIsLoading(false)
    }
  }

  // Complete the sign-in process for a booking
  async function completeBookingSignIn(existingVisitorId: string | null) {
    if (!selectedBooking) return

    const supabase = createClient()
    console.log("Completing sign-in for booking:", selectedBooking)
    // Create or update visitor record
    let visitorId = existingVisitorId

    if (!visitorId) {
      const { data: existingVisitor } = await supabase
        .from("visitors")
        .select("id")
        .eq("email", selectedBooking.visitor_email)
        .single()

      if (existingVisitor) {
        visitorId = existingVisitor.id
        // Update existing visitor
        await supabase
          .from("visitors")
          .update({
            first_name: selectedBooking.visitor_first_name,
            last_name: selectedBooking.visitor_last_name,
            company: selectedBooking.visitor_company,
          })
          .eq("id", visitorId)
      } else {
        // Create new visitor
        const { data: newVisitor, error: visitorError } = await supabase
          .from("visitors")
          .insert({
            first_name: selectedBooking.visitor_first_name,
            last_name: selectedBooking.visitor_last_name,
            email: selectedBooking.visitor_email,
            company: selectedBooking.visitor_company,
          })
          .select()
          .single()

        if (visitorError) throw visitorError
        visitorId = newVisitor.id
      }
    }

    // Upload photo if captured and update visitor
    let photoUrl: string | null = null
    if (capturedPhoto && visitorId) {
      photoUrl = await uploadPhotoToSupabase(capturedPhoto, visitorId)

      // Update visitor with photo URL using API route to bypass RLS
      if (photoUrl) {
        try {
          const response = await fetch("/api/visitor-photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              visitorId: visitorId,
              photoUrl: photoUrl,
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            console.error("Error updating visitor photo_url:", errorData.error)
          }
        } catch (err) {
          console.error("Failed to update visitor photo:", err)
        }
      }
    }

    // Generate badge number
    const badgeNumber = `V${String(Math.floor(Math.random() * 9000) + 1000)}`

    // Create sign-in record - use visitor_type_id directly from booking
    const { error: signInError } = await supabase
      .from("sign_ins")
      .insert({
        visitor_id: visitorId,
        location_id: selectedLocation,
        visitor_type_id: selectedBooking.visitor_type_id || selectedBooking.visitor_type?.id || null,
        host_id: selectedBooking.host_id,
        purpose: selectedBooking.purpose,
        badge_number: badgeNumber,
        sign_in_time: new Date().toISOString(),
      })

    if (signInError) throw signInError

    // Update booking status to checked_in
    await supabase
      .from("bookings")
      .update({ status: "checked_in" })
      .eq("id", selectedBooking.id)

    // Log booking check-in via API
    await logAuditViaApi({
      action: "booking.checked_in",
      entityType: "booking",
      entityId: selectedBooking.id,
      description: `Booking checked in: ${selectedBooking.visitor_first_name} ${selectedBooking.visitor_last_name}`,
      metadata: {
        booking_id: selectedBooking.id,
        visitor_email: selectedBooking.visitor_email,
        host_id: selectedBooking.host_id,
        location_id: selectedBooking.location_id
      }
    })

    console.log(hostNotificationsEnabled, selectedBooking.host_id)
    // Send host notification if enabled and booking has a host
    if (hostNotificationsEnabled && selectedBooking.host_id) {
      let hostEmail: string | null = null
      let hostName: string | null = null

      // Fetch host with profile data
      const { data: hostData } = await supabase
        .from("hosts")
        .select("id, name, email, profile_id")
        .eq("id", selectedBooking.host_id)
        .single()
      console.log("Host data:", hostData)
      if (hostData) {
        hostName = hostData.name
        hostEmail = hostData.email

        // If host is linked to a profile, fetch profile email
        if (hostData.profile_id) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", hostData.profile_id)
            .single()

          if (profileData) {
            hostName = profileData.full_name || hostName
            hostEmail = profileData.email || hostEmail
          }
        }
      }
      console.log(hostName, hostEmail)
      if (hostEmail) {
        try {
          await fetch("/api/notify-host", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              hostEmail,
              hostName,
              visitorName: `${selectedBooking.visitor_first_name} ${selectedBooking.visitor_last_name}`,
              visitorCompany: selectedBooking.visitor_company,
              purpose: selectedBooking.purpose,
              badgeNumber,
              locationName: currentLocation?.name,
              visitorPhotoUrl: photoUrl,
            }),
          })
        } catch (notifyErr) {
          console.error("Failed to send host notification:", notifyErr)
        }
      }
    }

    // Handle badge printing if enabled
    if (badgePrintingEnabled) {
      const printWindow = window.open("", "_blank", "width=400,height=300")

      if (printWindow) {
        printWindow.document.open()
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
          <title>Visitor Badge</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 20px;
              }

              .badge {
                width: 3.375in;
                height: 2.125in;
                background: #fff;
                border-radius: 8px;
                border: 1px dashed #d1d5db;
                display: flex;
                padding: 12px;
                margin: 0 auto;
                position: relative;
                box-sizing: border-box;
              }

              .lanyard-slot {
                position: absolute;
                top: 6px;
                left: 50%;
                transform: translateX(-50%);
                width: 30px;
                height: 8px;
                background: #e5e7eb;
                border-radius: 4px;
              }

              .photo-section {
                width: 40%;
                display: flex;
                align-items: center;
                justify-content: center;
                padding-right: 12px;
              }

              .visitor-photo {
                width: 100%;
                aspect-ratio: 1;
                object-fit: cover;
                border: 4px solid #9ca3af;
                background: #e5e7eb;
              }

              .photo-placeholder {
                width: 100%;
                aspect-ratio: 1;
                background: #e5e7eb;
                border: 4px solid #9ca3af;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #9ca3af;
                font-size: 36px;
              }

              .info-section {
                width: 60%;
                display: flex;
                flex-direction: column;
                justify-content: center;
                padding-left: 8px;
              }

              .logo {
                max-width: 100px;
                height: auto;
                margin-bottom: 8px;
                align-self: flex-end;
              }

              .visitor-name {
                font-size: 20px;
                font-weight: bold;
                color: #111;
                margin: 4px 0;
                line-height: 1.2;
              }

              .visitor-type {
                font-size: 12px;
                font-weight: 600;
                color: #374151;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin: 2px 0;
              }

              .location {
                font-size: 11px;
                font-weight: 500;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.3px;
                margin: 2px 0;
              }

              .badge-number {
                font-size: 10px;
                color: #9ca3af;
                margin-top: 6px;
              }

              @media print {
                body { margin: 0; padding: 0; }
                .badge { border: 1px dashed #d1d5db; }
              }
            </style>
          </head>
          <body>
            <div class="badge">
              <div class="lanyard-slot"></div>
              <div class="photo-section">
                ${photoUrl || capturedPhoto
            ? `<img src="${photoUrl || capturedPhoto}" class="visitor-photo" crossorigin="anonymous" />`
            : `<div class="photo-placeholder">${selectedBooking.visitor_first_name?.[0] || ""}${selectedBooking.visitor_last_name?.[0] || ""}</div>`
          }
              </div>
              <div class="info-section">
                <img src="${branding.companyLogo || `${window.location.origin}/talusAg_Logo.png`}" alt="Logo" class="logo" />
                <div class="visitor-name">${selectedBooking.visitor_first_name} ${selectedBooking.visitor_last_name}</div>
                <div class="visitor-type">${selectedBooking.visitor_company || "Visitor"}</div>
                <div class="location">${locations.find(l => l.id === selectedLocation)?.name || ""}</div>
                <div class="badge-number">${badgeNumber}</div>
              </div>
            </div>

            <script>
              window.onload = () => {
                setTimeout(() => {
                  window.print()
                  window.close()
                }, 300)
              }
            </script>
          </body>
          </html>
        `)
        printWindow.document.close()
      }
    }

    setSuccessData({
      name: `${selectedBooking.visitor_first_name} ${selectedBooking.visitor_last_name}`,
      badge: badgeNumber,
      type: "in",
    })

    // Reset booking state
    setBookingEmail("")
    setBookingResults([])
    setSelectedBooking(null)
    setMode("success")
    setIsLoading(false)
  }

  // Check if visitor type requires training and redirect if needed
  async function handleSignInSubmit(e: React.FormEvent) {
    e.preventDefault()
    const selectedType = visitorTypes.find((t) => t.id === form.visitorTypeId)

    if (selectedType?.requires_training) {
      // Check if this visitor has already completed training for this visitor type
      const supabase = createClient()

      // First, find the visitor by email (if they've visited before)
      const { data: existingVisitor } = await supabase
        .from("visitors")
        .select("id")
        .eq("email", form.email)
        .single()

      if (existingVisitor) {
        // Check for existing training completion
        const { data: trainingCompletion } = await supabase
          .from("training_completions")
          .select("*")
          .eq("visitor_id", existingVisitor.id)
          .eq("visitor_type_id", selectedType.id)
          .single()

        if (trainingCompletion) {
          // Check if training has expired
          const hasExpired = trainingCompletion.expires_at &&
            new Date(trainingCompletion.expires_at) < new Date()

          if (!hasExpired) {
            // Training already completed and not expired, skip training
            completeSignIn()
            return
          }
        }
      }

      // No prior training or expired - send pre-training notification and go to training video step
      if (hostNotificationsEnabled && form.hostId) {
        const supabase = createClient()
        const { data: hostData } = await supabase
          .from("hosts")
          .select("id, name, email, profile_id")
          .eq("id", form.hostId)
          .single()

        if (hostData) {
          let hostEmail = hostData.email
          let hostName = hostData.name

          if (hostData.profile_id) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", hostData.profile_id)
              .single()

            if (profileData) {
              hostName = profileData.full_name || hostName
              hostEmail = profileData.email || hostEmail
            }
          }

          if (hostEmail) {
            try {
              await fetch("/api/notify-host", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  hostEmail,
                  hostName,
                  visitorName: `${form.firstName} ${form.lastName}`,
                  visitorCompany: form.company,
                  purpose: form.purpose,
                  locationName: currentLocation?.name,
                  notificationType: "completing_training",
                  visitorTypeName: selectedType?.name,
                }),
              })
            } catch (notifyErr) {
              console.error("Failed to send pre-training notification:", notifyErr)
            }
          }
        }
      }

      setMode("training")
    } else {
      // No training required, proceed to photo capture
      proceedToPhoto()
    }
  }

  // Start simulated video progress (since we can't track YouTube progress directly)
  function startVideoProgress() {
    if (videoStarted) return
    setVideoStarted(true)

    // Simulate 3.46 minutes of required watching time
    const totalDuration = 60 * 3.46
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
    stopCamera() // Ensure camera is stopped

    try {
      const supabase = createClient()

      // Create visitor via API to bypass RLS
      const visitorResponse = await fetch("/api/kiosk/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email || null,
          phone: form.phone || null,
          company: form.company || null,
        }),
      })

      if (!visitorResponse.ok) {
        const errorData = await visitorResponse.json()
        throw new Error(errorData.error || "Failed to create visitor")
      }

      const { visitor } = await visitorResponse.json()

      // Upload photo if captured
      let photoUrl: string | null = null
      if (capturedPhoto) {
        photoUrl = await uploadPhotoToSupabase(capturedPhoto, visitor.id)

        // Update visitor with photo URL using API route to bypass RLS
        if (photoUrl) {
          try {
            const response = await fetch("/api/visitor-photo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                visitorId: visitor.id,
                photoUrl: photoUrl,
              }),
            })

            if (!response.ok) {
              const errorData = await response.json()
              console.error("Error updating visitor photo_url:", errorData.error)
            }
          } catch (err) {
            console.error("Failed to update visitor photo:", err)
          }
        }
      }

      // Store for badge printing
      setVisitorPhotoUrl(photoUrl)

      // If training was required, record the completion via API
      const selectedType = visitorTypes.find((t) => t.id === form.visitorTypeId)
      if (selectedType?.requires_training) {
        await fetch("/api/kiosk/training", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitor_id: visitor.id,
            visitor_type_id: form.visitorTypeId,
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        })
      }

      // Generate badge number
      const badgeNumber = `V${String(Date.now()).slice(-6)}`

      // Get location timezone
      const locationTimezone = currentLocation?.timezone || "UTC"

      // Create sign-in record via API to bypass RLS
      const signInResponse = await fetch("/api/kiosk/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id: visitor.id,
          visitor_name: `${form.firstName} ${form.lastName}`,
          visitor_email: form.email || null,
          location_id: selectedLocation,
          visitor_type_id: form.visitorTypeId || null,
          host_id: form.hostId || null,
          badge_number: badgeNumber,
          photo_url: photoUrl,
          timezone: locationTimezone,
        }),
      })

      if (!signInResponse.ok) {
        const errorData = await signInResponse.json()
        throw new Error(errorData.error || "Failed to create sign-in record")
      }

      const { signIn: signInRecord } = await signInResponse.json()

      // Send host notification email if enabled and host is selected
      if (hostNotificationsEnabled && form.hostId) {
        // Fetch host with profile data
        const { data: hostData } = await supabase
          .from("hosts")
          .select("id, name, email, profile_id")
          .eq("id", form.hostId)
          .single()

        let hostEmail: string | null = null
        let hostName: string | null = null

        if (hostData) {
          hostName = hostData.name
          hostEmail = hostData.email

          // If host is linked to a profile, fetch profile email
          if (hostData.profile_id) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", hostData.profile_id)
              .single()

            if (profileData) {
              hostName = profileData.full_name || hostName
              hostEmail = profileData.email || hostEmail
            }
          }
        }

        if (hostEmail) {
          try {
            await fetch("/api/notify-host", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                hostEmail,
                hostName,
                visitorName: `${form.firstName} ${form.lastName}`,
                visitorCompany: form.company,
                purpose: form.purpose,
                badgeNumber,
                locationName: currentLocation?.name,
                visitorPhotoUrl: photoUrl,
              }),
            })
          } catch (notifyErr) {
            console.error("Failed to send host notification:", notifyErr)
          }
        }
      }


      // Trigger badge printing if enabled
      if (badgePrintingEnabled) {
        const printWindow = window.open("", "_blank", "width=400,height=300")

        if (printWindow) {
          printWindow.document.open()
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Visitor Badge</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  text-align: center;
                  padding: 20px;
}
.badge {
                width: 3.375in;
                height: 2.125in;
                background: #fff;
                border-radius: 8px;
                border: 1px dashed #d1d5db;
                display: flex;
                padding: 12px;
                margin: 0 auto;
                position: relative;
                box-sizing: border-box;
              }

              .lanyard-slot {
                position: absolute;
                top: 6px;
                left: 50%;
                transform: translateX(-50%);
                width: 30px;
                height: 8px;
                background: #e5e7eb;
                border-radius: 4px;
              }

              .photo-section {
                width: 40%;
                display: flex;
                align-items: center;
                justify-content: center;
                padding-right: 12px;
              }

              .visitor-photo {
                width: 100%;
                aspect-ratio: 1;
                object-fit: cover;
                border: 4px solid #9ca3af;
                background: #e5e7eb;
              }

              .photo-placeholder {
                width: 100%;
                aspect-ratio: 1;
                background: #e5e7eb;
                border: 4px solid #9ca3af;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #9ca3af;
                font-size: 36px;
              }

              .info-section {
                width: 60%;
                display: flex;
                flex-direction: column;
                justify-content: center;
                padding-left: 8px;
              }

              .logo {
                max-width: 100px;
                height: auto;
                margin-bottom: 8px;
                align-self: flex-end;
              }

              .visitor-name {
                font-size: 20px;
                font-weight: bold;
                color: #111;
                margin: 4px 0;
                line-height: 1.2;
              }

              .visitor-type {
                font-size: 12px;
                font-weight: 600;
                color: #374151;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin: 2px 0;
              }

              .location {
                font-size: 11px;
                font-weight: 500;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.3px;
                margin: 2px 0;
              }

              .badge-number {
                font-size: 10px;
                color: #9ca3af;
                margin-top: 6px;
              }

              @media print {
                body { margin: 0; padding: 0; }
                .badge { border: 1px dashed #d1d5db; }
              }
              </style>
            </head>
            <body>
              <div class="badge">
                <div class="lanyard-slot"></div>
                <div class="photo-section">
                  ${visitorPhotoUrl || capturedPhoto
              ? `<img src="${visitorPhotoUrl || capturedPhoto}" class="visitor-photo" crossorigin="anonymous" />`
              : `<div class="photo-placeholder">${form.firstName?.[0] || ""}${form.lastName?.[0] || ""}</div>`
            }
                </div>
                <div class="info-section">
                  <img src="${branding.companyLogo || `${window.location.origin}/talusAg_Logo.png`}" alt="Logo" class="logo" />
                  <div class="visitor-name">${form.firstName} ${form.lastName}</div>
                  <div class="visitor-type">${form.company || selectedType?.name || "Visitor"}</div>
                  <div class="location">${locations.find(l => l.id === selectedLocation)?.name || ""}</div>
                  <div class="badge-number">${badgeNumber}</div>
                </div>
              </div>

              <script>
                window.onload = () => {
                  setTimeout(() => {
                    window.print()
                    window.close()
                  }, 300)
                }
              </script>
            </body>
            </html>
          `)
          printWindow.document.close()
        }
      }

      // Update booking status if this was a booking check-in after training
      if (selectedBooking) {
        await supabase
          .from("bookings")
          .update({ status: "checked_in" })
          .eq("id", selectedBooking.id)

        // Log booking check-in via API
        await logAuditViaApi({
          action: "booking.checked_in",
          entityType: "booking",
          entityId: selectedBooking.id,
          description: `Booking checked in: ${selectedBooking.visitor_first_name} ${selectedBooking.visitor_last_name}`,
          metadata: {
            booking_id: selectedBooking.id,
            visitor_email: selectedBooking.visitor_email,
            host_id: selectedBooking.host_id,
            location_id: selectedBooking.location_id
          }
        })

        // Clear booking state
        setBookingEmail("")
        setBookingResults([])
        setSelectedBooking(null)
      }

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
    setBypassTraining(false)
    setVideoProgress(0)
    setVideoStarted(false)
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current)
    }
  }

  // Camera functions for visitor photo
  async function startCamera() {
    try {
      setCameraError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
      })
      setCameraStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      console.error("Camera access error:", err)
      setCameraError("Unable to access camera. Please allow camera access or skip photo.")
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop())
      setCameraStream(null)
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Mirror the image horizontally for a more natural selfie look
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)

    const photoData = canvas.toDataURL("image/jpeg", 0.8)
    setCapturedPhoto(photoData)
    stopCamera()
  }

  function retakePhoto() {
    setCapturedPhoto(null)
    startCamera()
  }

  async function uploadPhotoToSupabase(photoData: string, visitorId: string): Promise<string | null> {
    try {
      const supabase = createClient()

      // Convert base64 to blob
      const response = await fetch(photoData)
      const blob = await response.blob()

      // Generate unique filename - just use filename, not nested path
      const filename = `${visitorId}_${Date.now()}.jpg`

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from("visitor-photos")
        .upload(filename, blob, {
          contentType: "image/jpeg",
          upsert: true
        })

      if (error) {
        console.error("Photo upload error:", error)
        return null
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("visitor-photos")
        .getPublicUrl(filename)

      return urlData.publicUrl
    } catch (err) {
      console.error("Photo upload failed:", err)
      return null
    }
  }

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  // Go to photo mode after training (or directly if no training needed)
  function proceedToPhoto() {
    stopCamera()
    setMode("photo")
    // Start camera after a brief delay to allow mode change
    setTimeout(() => {
      startCamera()
    }, 100)
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

      // Update sign-out time via API to bypass RLS
      const signOutResponse = await fetch("/api/kiosk/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sign_in_id: signIn.id,
          visitor_id: signIn.visitor_id,
          visitor_name: `${signIn.visitor?.first_name} ${signIn.visitor?.last_name}`,
          visitor_email: signIn.visitor?.email || null,
          badge_number: signIn.badge_number
        }),
      })

      if (!signOutResponse.ok) {
        const errorData = await signOutResponse.json()
        throw new Error(errorData.error || "Failed to sign out")
      }

      // Update any checked_in bookings for this visitor to completed
      await supabase
        .from("bookings")
        .update({ status: "completed" })
        .eq("visitor_email", signOutEmail.toLowerCase().trim())
        .eq("status", "checked_in")

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
    setCapturedPhoto(null)
    setVisitorPhotoUrl(null)
    setCameraError(null)
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
    // Clear booking state
    setBookingEmail("")
    setBookingResults([])
    setSelectedBooking(null)
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

      // Load and enforce password policy
      const policy = await loadPasswordPolicy()

      // Check password expiration
      if (isPasswordExpired(profile.last_password_change, policy)) {
        throw new Error("Your password has expired. Please contact an administrator to reset it.")
      }

      // Check if re-authentication is required
      if (needsReauthentication(profile.last_auth_time, policy)) {
        // Update last auth time since they just authenticated
        await supabase
          .from("profiles")
          .update({ last_auth_time: new Date().toISOString() })
          .eq("id", profile.id)
      }

      // Warn if password is expiring soon (within 7 days)
      const daysUntilExpiration = getDaysUntilExpiration(profile.last_password_change, policy)
      if (daysUntilExpiration !== null && daysUntilExpiration <= 7 && daysUntilExpiration > 0) {
        // We could show a warning here, but for now just log it
        console.log(`[v0] Password expires in ${daysUntilExpiration} days for user ${profile.email}`)
      }

      setCurrentEmployee(profile)

      // Create employee sign-in record
      console.log("[v0] Creating employee sign-in for profile:", profile.id, "at location:", selectedLocation)
      const signInTime = new Date().toISOString()
      const selectedLoc = locations.find(l => l.id === selectedLocation)
      const locationName = selectedLoc?.name
      const locationTimezone = selectedLoc?.timezone

      const { data: empSignInRecord, error: signInError } = await supabase.from("employee_sign_ins").insert({
        profile_id: profile.id,
        location_id: selectedLocation,
        auto_signed_in: false,
        device_id: navigator.userAgent,
      }).select().single()

      if (signInError) {
        console.log("[v0] Employee sign-in insert error:", signInError)
        throw signInError
      }

      // Log employee sign-in
      await logAudit({
        action: "employee.sign_in",
        entityType: "employee",
        entityId: profile.id,
        description: `Employee signed in: ${profile.full_name || profile.email}`,
        metadata: {
          profile_id: profile.id,
          sign_in_id: empSignInRecord?.id,
          location_id: selectedLocation,
          method: "password"
        }
      })

      setEmployeeSignInRecord({ sign_in_time: signInTime, location_name: locationName, timezone: locationTimezone })

      // Remember employee if checkbox is checked
      if (rememberMe) {
        const rememberedData: RememberedEmployee = {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name || "",
          locationId: profile.location_id,
          role: profile.role,
          avatar_url: profile.avatar_url || null,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
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

  async function handleEmployeeMicrosoftLogin() {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // First, sign out any existing session to ensure clean OAuth flow
      // This prevents stale refresh token issues
      await supabase.auth.signOut()

      const redirectUrl = `${window.location.origin}/auth/callback?type=employee&location_id=${selectedLocation}`

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          redirectTo: redirectUrl,
          scopes: "email profile openid User.Read",
          queryParams: {
            prompt: "select_account", // Always show account picker for reliability
          },
        },
      })

      if (error) throw error
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in with Microsoft")
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

        // Log employee sign-out
        await logAudit({
          action: "employee.sign_out",
          entityType: "employee",
          entityId: currentEmployee.id,
          description: `Employee signed out: ${currentEmployee.full_name || currentEmployee.email}`,
          metadata: {
            profile_id: currentEmployee.id,
            sign_in_id: signIn.id,
            location_id: signIn.location_id
          }
        })
      }

      // Sign out of Supabase Auth with global scope to clear all sessions
      await supabase.auth.signOut({ scope: "global" })

      // Clear remembered employee from local storage
      localStorage.removeItem(REMEMBERED_EMPLOYEE_KEY)
      localStorage.removeItem("rememberedEmployee")

      // Clear all state
      setRememberedEmployee(null)
      setSuccessData({
        name: currentEmployee.full_name || currentEmployee.email,
        badge: "Employee",
        type: "out",
      })
      setCurrentEmployee(null)
      setEmployeeSignedIn(false)
      setEmployeeSignInRecord(null)
      setEmployeeEmail("")
      setEmployeePassword("")
      setMode("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign out")
    } finally {
      setIsLoading(false)
    }
  }

  async function forgetEmployee() {
    // Clear local storage
    localStorage.removeItem(REMEMBERED_EMPLOYEE_KEY)
    localStorage.removeItem("rememberedEmployee")
    setRememberedEmployee(null)

    // Also sign out of Supabase if currently authenticated
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "global" })

    // Reset employee-related state
    setCurrentEmployee(null)
    setEmployeeSignedIn(false)
    setEmployeeSignInRecord(null)
    setEmployeeEmail("")
    setEmployeePassword("")
  }

  const selectedVisitorType = visitorTypes.find((t) => t.id === form.visitorTypeId)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/30">
      {mode === "receptionist-login" ? (
        <header className="bg-background/80 backdrop-blur-sm border-b sticky top-0 z-50">
          <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-center">
            <Link href="/">
              <TalusAgLogo />
            </Link>
          </div>
        </header>
      ) : (
        <header className="bg-background/80 backdrop-blur-sm border-b sticky top-0 z-50">
          <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2">
            <div className="shrink-0">
              <Link href="/">
                <TalusAgLogo />
              </Link>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              {/* Clock display with location timezone */}
              <div className="hidden md:flex items-center gap-2 text-sm border-r pr-4 mr-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {currentTime.toLocaleTimeString("en-US", {
                    timeZone: toIANATimezone(currentTimezone),
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-medium text-xs text-muted-foreground">
                  {getTimezoneAbbreviation(currentTimezone)}
                </span>
              </div>
              {/* Location indicator */}
              <div className="hidden sm:flex items-center gap-2 text-sm">
                {isDetectingLocation ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Detecting location...</span>
                  </>
                ) : isSelectedDifferentFromNearest && currentLocation ? (
                  <>
                    <Building2 className="w-4 h-4 text-amber-500" />
                    <span className="text-foreground font-medium">{currentLocation.name}</span>
                    {selectedLocationDistance !== null && (
                      <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                        {formatDistance(selectedLocationDistance)}
                      </Badge>
                    )}
                  </>
                ) : nearestLocation ? (
                  <>
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-foreground font-medium">{locations.find((l) => l.id === selectedLocation)?.name != nearestLocation.location.name ? locations.find((l) => l.id === selectedLocation)?.name : nearestLocation.location.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {formatDistance(nearestLocation.distance)}
                    </Badge>
                  </>
                ) : currentLocation ? (
                  <>
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{currentLocation.name}</span>
                  </>
                ) : (
                  <>
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Select location</span>
                  </>
                )}
              </div>

              {locations.length > 1 && (
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger className="w-[140px] sm:w-[180px]">
                    <SelectValue placeholder="Location" />
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

              {/* Receptionist lock/logout button */}
              {receptionistUser && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground bg-transparent"
                  onClick={handleReceptionistLogout}
                  title={`Logged in as ${receptionistUser.name}. Click to lock kiosk.`}
                >
                  <Lock className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1 text-xs">Lock</span>
                </Button>
              )}
            </div>
          </div>
        </header>
      )}

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {mode === "receptionist-login" && (
          <div className="max-w-sm mx-auto mt-8 sm:mt-16">
            <div className="text-center mb-6 sm:mb-8">
              <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Kiosk Login</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Employee sign-in required to activate the visitor kiosk
              </p>
            </div>

            {receptionistLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <Card>
                <CardHeader className="text-center p-4 sm:p-6 pb-2 sm:pb-2">
                  <CardTitle className="text-lg sm:text-xl">Employee Login</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Sign in to unlock the visitor management kiosk
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-2 sm:pt-4">
                  <form onSubmit={handleReceptionistLogin}>
                    <div className="flex flex-col gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="receptionist-email" className="text-sm">Email</Label>
                        <Input
                          id="receptionist-email"
                          type="email"
                          placeholder={`employee@${branding.companyName.toLowerCase().replace(/\s+/g, "")}.com`}
                          required
                          value={receptionistEmail}
                          onChange={(e) => setReceptionistEmail(e.target.value)}
                          autoComplete="email"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="receptionist-password" className="text-sm">Password</Label>
                        <Input
                          id="receptionist-password"
                          type="password"
                          required
                          value={receptionistPassword}
                          onChange={(e) => setReceptionistPassword(e.target.value)}
                          autoComplete="current-password"
                        />
                      </div>
                      {receptionistError && (
                        <p className="text-sm text-destructive">{receptionistError}</p>
                      )}
                      <Button type="submit" className="w-full" disabled={receptionistLoading}>
                        {receptionistLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          "Sign In"
                        )}
                      </Button>

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="w-full bg-transparent"
                        onClick={handleReceptionistMicrosoftLogin}
                        disabled={receptionistLoading}
                      >
                        <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                          <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                          <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                          <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                        </svg>
                        Sign in with Microsoft
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {mode === "home" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6 sm:mb-12">
              <h1 className="text-2xl sm:text-4xl font-bold text-foreground mb-2 sm:mb-3">Visitor Check-In</h1>
              <p className="text-sm sm:text-lg text-muted-foreground">Welcome to {branding.companyName || "Talus"}. Please sign in or sign out below.</p>
            </div>

            {/* Visitor options - always shown */}
            <div className="grid grid-cols-3 gap-3 sm:gap-6">
              <Card
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group flex flex-col h-full"
                onClick={() => setMode("sign-in")}
              >
                <CardHeader className="text-center pb-2 sm:pb-4 p-3 sm:p-6 flex-1">
                  <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2 sm:mb-4 group-hover:bg-primary/20 transition-colors">
                    <UserPlus className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                  </div>
                  <CardTitle className="text-base sm:text-2xl">Sign In</CardTitle>
                  <CardDescription className="text-xs sm:text-sm hidden sm:block">New visitor? Sign in here</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 mt-auto">
                  <Button className="w-full" size="lg">
                    Sign In
                  </Button>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer hover:shadow-lg hover:border-blue-500/50 transition-all group flex flex-col h-full"
                onClick={() => setMode("booking")}
              >
                <CardHeader className="text-center pb-2 sm:pb-4 p-3 sm:p-6 flex-1">
                  <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-blue-100 flex items-center justify-center mb-2 sm:mb-4 group-hover:bg-blue-200 transition-colors">
                    <CalendarCheck className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
                  </div>
                  <CardTitle className="text-base sm:text-2xl">I Have a Booking</CardTitle>
                  <CardDescription className="text-xs sm:text-sm hidden sm:block">Pre-registered? Check in here</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 mt-auto">
                  <Button variant="outline" className="w-full bg-transparent border-blue-200 text-blue-600 hover:bg-blue-50" size="lg">
                    Check In
                  </Button>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group flex flex-col h-full"
                onClick={() => setMode("sign-out")}
              >
                <CardHeader className="text-center pb-2 sm:pb-4 p-3 sm:p-6 flex-1">
                  <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-secondary flex items-center justify-center mb-2 sm:mb-4 group-hover:bg-secondary/80 transition-colors">
                    <LogOut className="w-6 h-6 sm:w-8 sm:h-8 text-foreground" />
                  </div>
                  <CardTitle className="text-lg sm:text-2xl">Sign Out</CardTitle>
                  <CardDescription className="text-xs sm:text-sm hidden sm:block">Leaving? Sign out here</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 mt-auto">
                  <Button variant="secondary" className="w-full" size="lg">
                    Sign Out
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="mt-4 sm:mt-8">
              {/* Employee Login/Sign Out Card - Show different state based on sign-in status */}
              {employeeSignedIn && currentEmployee ? (
                <Card className="border-green-200 bg-green-50/50 mb-4 sm:mb-6">
                  <CardContent className="py-3 sm:py-4 px-3 sm:px-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <Avatar className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center shrink-0">
                          <AvatarImage src={currentEmployee.avatar_url || undefined} />
                          <AvatarFallback className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-white font-semibold shrink-0 bg-blue-500">
                            {currentEmployee.full_name?.charAt(0) || currentEmployee.email.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm sm:text-base truncate">{currentEmployee.full_name || currentEmployee.email}</h3>
                          <p className="text-xs sm:text-sm text-green-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Currently signed in
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="text-xs sm:text-sm self-end sm:self-auto"
                        onClick={handleEmployeeSignOut}
                        disabled={isLoading}
                      >
                        <LogOut className="w-4 h-4 mr-1" />
                        Sign Out
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card
                  className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group mb-4 sm:mb-6"
                  onClick={() => setMode("employee-login")}
                >
                  <CardContent className="py-3 sm:py-4 px-3 sm:px-6">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors shrink-0">
                          <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm sm:text-base">Employee Sign In</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground">{branding.companyName || "Talus"} employees sign in here</p>
                        </div>
                      </div>
                      <ArrowLeft className="w-5 h-5 text-muted-foreground rotate-180 shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Remembered employee - only show quick sign-in option if NOT already signed in */}
              {rememberedEmployee && !employeeSignedIn && (
                <Card className="mb-4 sm:mb-6 border-blue-200 bg-blue-50/50">
                  <CardContent className="py-3 sm:py-4 px-3 sm:px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <Avatar className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-white font-semibold shrink-0 bg-blue-600">
                          <AvatarImage src={rememberedEmployee.avatar_url || undefined} />
                          <AvatarFallback className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-white font-semibold shrink-0 bg-blue-600">
                            {rememberedEmployee.fullName?.charAt(0) || rememberedEmployee.email.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm sm:text-base truncate">{rememberedEmployee.fullName || rememberedEmployee.email}</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {nearestLocation && rememberedEmployee.locationId === nearestLocation.location.id ? (
                              "You're at your registered location"
                            ) : (
                              "Quick sign in available"
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 self-end sm:self-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs sm:text-sm bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            forgetEmployee()
                          }}
                        >
                          Not you?
                        </Button>
                        <Button
                          size="sm"
                          className="text-xs sm:text-sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            autoSignInEmployee(rememberedEmployee)
                          }}
                          disabled={isLoading}
                        >
                          Sign In
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" />
                {formatDate(new Date().toISOString(), locations.find(l => l.id === selectedLocation)?.timezone || "UTC")}
              </p>
            </div>
          </div>
        )}

        {mode === "sign-in" && (
          <div className="max-w-xl mx-auto">
            <Button variant="ghost" className="mb-4 sm:mb-6 bg-transparent" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-xl sm:text-2xl">Visitor Sign In</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Please fill out the form below to sign in</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                <form onSubmit={handleSignInSubmit} className="space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

        {mode === "booking" && (
          <div className="max-w-xl mx-auto">
            <Button variant="ghost" className="mb-4 sm:mb-6 bg-transparent" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-xl sm:text-2xl flex items-center gap-2">
                  <CalendarCheck className="w-6 h-6 text-blue-600" />
                  Check In with Booking
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Enter your email address to find your booking
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                {!bookingResults.length ? (
                  <form onSubmit={handleBookingLookup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="bookingEmail">Email Address *</Label>
                      <Input
                        id="bookingEmail"
                        type="email"
                        required
                        value={bookingEmail}
                        onChange={(e) => setBookingEmail(e.target.value)}
                        placeholder="your.email@example.com"
                      />
                    </div>

                    {error && (
                      <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                        {error}
                      </div>
                    )}

                    <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Looking up...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-2" />
                          Find My Booking
                        </>
                      )}
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {bookingResults.map((booking) => (
                        <Card
                          key={booking.id}
                          className={`cursor-pointer transition-all ${selectedBooking?.id === booking.id
                            ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20"
                            : "hover:border-blue-300"
                            }`}
                          onClick={() => setSelectedBooking(booking)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-base">
                                  {booking.visitor_first_name} {booking.visitor_last_name}
                                </h3>
                                {booking.visitor_company && (
                                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                    <Building2 className="w-3 h-3" />
                                    {booking.visitor_company}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <Badge variant="secondary" className="text-xs">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {formatTime(booking.expected_arrival, locations.find(l => l.id === selectedLocation)?.timezone || "UTC")}
                                  </Badge>
                                  {booking.host_id && (
                                    <Badge variant="outline" className="text-xs">
                                      <User className="w-3 h-3 mr-1" />
                                      {hosts.find((h) => h.id === booking.host_id)?.name}
                                    </Badge>
                                  )}
                                  {booking.visitor_type && (
                                    <Badge
                                      className="text-xs text-white"
                                      style={{ backgroundColor: booking.visitor_type.badge_color }}
                                    >
                                      {booking.visitor_type.name}
                                    </Badge>
                                  )}
                                </div>
                                {booking.purpose && (
                                  <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                                    Purpose: {booking.purpose}
                                  </p>
                                )}
                              </div>
                              {selectedBooking?.id === booking.id && (
                                <CheckCircle className="w-5 h-5 text-blue-600 shrink-0" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {error && (
                      <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                        {error}
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1 bg-transparent"
                        onClick={() => {
                          setBookingResults([])
                          setSelectedBooking(null)
                          setError(null)
                        }}
                      >
                        Search Again
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={!selectedBooking || isLoading}
                        onClick={handleBookingSignIn}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Checking In...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Check In
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "sign-out" && (
          <div className="max-w-md mx-auto">
            <Button variant="ghost" className="mb-4 sm:mb-6 bg-transparent" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-xl sm:text-2xl">Visitor Sign Out</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Enter the email you used when signing in</CardDescription>
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
            <Button variant="ghost" className="mb-4 sm:mb-6 bg-transparent" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl sm:text-2xl">Employee Sign In</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Sign in with your {branding.companyName || "Talus"} credentials</CardDescription>
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
                  <div className="flex items-center justify-between">
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
                    <Link href="/kiosk/forgot-password" className="text-sm text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  {currentLocation && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-sm font-medium">Signing in at {currentLocation.name}</p>
                          {selectedLocationDistance !== null && (
                            <p className="text-xs text-muted-foreground">
                              {formatDistance(selectedLocationDistance, "from your location")}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* {userLocationName && (
                        <div className="flex items-center gap-3 pt-1 border-t border-border/50">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            Your current location: <span className="font-medium text-foreground">{userLocationName}</span>
                          </p>
                        </div>
                      )} */}
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

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-transparent"
                    size="lg"
                    onClick={handleEmployeeMicrosoftLogin}
                    disabled={isLoading}
                  >
                    <svg className="mr-2 h-5 w-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                    </svg>
                    Sign in with Microsoft
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "employee-dashboard" && currentEmployee && (
          <div className="max-w-md mx-auto">
            <Card className="border-blue-200">
              <CardHeader className="text-center p-4 sm:p-6">
                <Avatar className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center mx-auto">
                  <AvatarImage src={currentEmployee.avatar_url || undefined} />
                  <AvatarFallback className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-500 flex items-center justify-center mx-auto text-white text-xl sm:text-2xl font-semibold">
                    {currentEmployee.full_name?.charAt(0) || currentEmployee.email.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <CardTitle className="text-xl sm:text-2xl">
                  Welcome, {currentEmployee.full_name || currentEmployee.email}!
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">You are signed in as an employee</CardDescription>
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
                        {employeeSignInRecord?.sign_in_time
                          ? `${formatTime(employeeSignInRecord.sign_in_time, employeeSignInRecord.timezone || "UTC")} ${getTimezoneAbbreviation(employeeSignInRecord.timezone || "UTC")}`
                          : "—"}
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
            <Button variant="ghost" className="mb-4 sm:mb-6 bg-transparent" onClick={() => setMode("sign-in")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Form
            </Button>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-start sm:items-center gap-3 mb-2">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg sm:text-2xl">
                      {selectedVisitorType.training_title || "Safety Training Required"}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      As a {selectedVisitorType.name}, you must complete this training before signing in
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4 sm:space-y-6">
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
                {videoStarted && !bypassTraining && (
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

                {/* Bypass Training Option */}
                {!trainingWatched && !bypassTraining && (
                  <div className="border border-dashed border-muted-foreground/30 rounded-lg p-4 bg-muted/30">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="bypass"
                        checked={bypassTraining}
                        onCheckedChange={(checked) => {
                          setBypassTraining(checked === true)
                          if (checked === true) {
                            setTrainingWatched(true)
                          }
                        }}
                        className="mt-1"
                      />
                      <label htmlFor="bypass" className="text-sm leading-relaxed cursor-pointer text-muted-foreground">
                        <span className="font-medium text-foreground">Already watched this training?</span>
                        <br />
                        If you watched this training video with other visitors (e.g., checking in as a group), you may skip re-watching. You will still need to acknowledge the safety guidelines.
                      </label>
                    </div>
                  </div>
                )}

                {/* Acknowledgment Checkbox */}
                {(trainingWatched || bypassTraining) && (
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
                        all safety guidelines and procedures while on {branding.companyName || "Talus"} premises. I understand that failure
                        to comply may result in being asked to leave the facility.
                      </label>
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                {/* Continue to Photo Button */}
                <Button
                  onClick={proceedToPhoto}
                  className="w-full"
                  size="lg"
                  disabled={(!trainingWatched && !bypassTraining) || !trainingAcknowledged || isLoading}
                >
                  {isLoading ? (
                    "Processing..."
                  ) : (!trainingWatched && !bypassTraining) ? (
                    <>
                      <Clock className="w-4 h-4 mr-2" />
                      Complete Training to Continue
                    </>
                  ) : !trainingAcknowledged ? (
                    "Please Acknowledge to Continue"
                  ) : (
                    <>
                      <Camera className="w-4 h-4 mr-2" />
                      Continue to Photo
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "photo" && (
          <div className="max-w-xl mx-auto">
            <Button variant="ghost" className="mb-4 sm:mb-6 bg-transparent" onClick={() => {
              stopCamera()
              setCapturedPhoto(null)
              setMode(selectedBooking ? "booking" : "sign-in")
            }}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-start sm:items-center gap-3 mb-2">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Camera className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg sm:text-2xl">Visitor Photo</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Please take a photo for your visitor badge
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4 sm:space-y-6">
                {/* Camera/Photo Preview */}
                <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
                  {cameraError ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-4">
                      <Camera className="w-16 h-16 mb-4 opacity-50" />
                      <p className="text-center">{cameraError}</p>
                      <Button variant="outline" onClick={startCamera} className="mt-4 bg-transparent">
                        Try Again
                      </Button>
                    </div>
                  ) : capturedPhoto ? (
                    <img
                      src={capturedPhoto || "/placeholder.svg"}
                      alt="Captured photo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{ transform: "scaleX(-1)" }}
                      />
                      {!cameraStream && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
                          <Camera className="w-16 h-16 mb-4 opacity-50 text-muted-foreground" />
                          <p className="text-muted-foreground">Starting camera...</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Hidden canvas for capturing */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Camera Controls */}
                <div className="flex gap-3">
                  {capturedPhoto ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={retakePhoto}
                        className="flex-1 bg-transparent"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retake Photo
                      </Button>
                      <Button
                        onClick={completeSignIn}
                        className="flex-1"
                        disabled={isLoading}
                      >
                        {isLoading ? "Completing Sign In..." : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Complete Sign In
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCapturedPhoto(null)
                          stopCamera()
                          completeSignIn()
                        }}
                        className="flex-1 bg-transparent"
                        disabled={isLoading}
                      >
                        Skip Photo
                      </Button>
                      <Button
                        onClick={capturePhoto}
                        className="flex-1"
                        disabled={!cameraStream || isLoading}
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Take Photo
                      </Button>
                    </>
                  )}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "success" && successData && (
          <div className="max-w-md mx-auto text-center">
            <Card className="border-primary/20">
              <CardContent className="p-4 sm:p-6 py-6 sm:py-8">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
                </div>

                <h2 className="text-xl sm:text-2xl font-bold mb-2">{successData.type === "in" ? "Welcome!" : "Goodbye!"}</h2>
                <p className="text-base sm:text-lg text-muted-foreground mb-4 sm:mb-6">{successData.name}</p>

                {successData.type === "in" && (
                  <div className="bg-secondary rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">Your Badge Number</p>
                    <p className="text-2xl sm:text-3xl font-mono font-bold text-foreground">{successData.badge}</p>
                  </div>
                )}

                <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">
                  {successData.type === "in"
                    ? "Please collect your visitor badge from reception."
                    : `Thank you for visiting ${branding.companyName || "Talus"}.`}
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
