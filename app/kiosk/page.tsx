"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { hasFeature, setCurrentTenant } from "@/lib/tier"
import { fixAzureOAuthUrl } from "@/lib/fix-azure-oauth-url"
import { printVisitorBadge } from "@/lib/print-badge"
import { BADGE_NUMBER_INPUT_RE, generateBadgeNumber as makeBadgeNumber, normalizeBadgeInput } from "@/lib/badge-number"
import { QRCode } from "@/components/qr-code"
import { usePreciseGeolocation } from "@/hooks/use-precise-geolocation"
import { TalusAgLogo } from "@/components/talusag-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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
  Briefcase,
  Loader2,
  User,
  CalendarCheck,
  Search,
  Camera,
  RefreshCw,
  Lock,
  Shield,
  Printer,
  Calendar,
  FileText,
  ExternalLink
} from "lucide-react"
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad"
import type { VisitorType, Host, Location, Profile } from "@/types/database"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatTime, formatDate, formatDateTime, getTimezoneAbbreviation, localDayBounds, toIANATimezone } from "@/lib/timezone"
import { logAudit, logAuditViaApi } from "@/lib/audit-log"
import { loadPasswordPolicy, isPasswordExpired, needsReauthentication, getDaysUntilExpiration } from "@/lib/password-policy"
import { useBranding } from "@/hooks/use-branding"
import { useNdaEnabled } from "@/hooks/use-features"
import { TrainingPlayer } from "@/components/training-player"
import { kioskClientGate, shouldEnforceGeofence } from "@/lib/checkin-geofence"
import { resolveFreshDeviceCoords, STALE_LOCATION_MESSAGE } from "@/lib/fresh-device-coords"
import { LangToggle } from "@/components/lang-toggle"
import { KioskWelcome } from "@/components/kiosk/kiosk-welcome"
import { KioskTypeStep } from "@/components/kiosk/kiosk-type-step"
import { KioskResolvedSite } from "@/components/kiosk/kiosk-resolved-site"
import { KioskSiteLine } from "@/components/kiosk/kiosk-site-line"
import { KioskSessionLoading } from "@/components/kiosk/kiosk-session-loading"
import { kioskBootScreen } from "@/lib/kiosk-boot"
import { headerLocationKind, isVisitorFlowMode, readStaffSite, resolveKioskSite } from "@/lib/kiosk-site"
import { fill, hostArrivalMessage, readVisitorLang, staffGeofenceLine, visitorCopy, writeVisitorLang, type VisitorLang } from "@/lib/visitor-i18n"
import { fetchVisitorTypesWithPhoto, typeRequiresPhoto } from "@/lib/requires-photo"
import { classifyCameraError, type CameraIssue } from "@/lib/camera-fallback"
import { attachAndPlayCamera } from "@/lib/camera-preview"
import type { TrainingPlaybackControls } from "@/components/training-player"
import { KIOSK_DONE_RESET_MS, KIOSK_IDLE_MS, idleSecondsLeft, shouldIdleReset, shouldShowIdleWarning } from "@/lib/checkin-idle"

type KioskMode = "receptionist-login" | "home" | "visitor-type" | "sign-in" | "booking" | "training" | "cleared" | "code" | "nda" | "sign-out" | "employee-login" | "employee-dashboard" | "success" | "photo"

/** What the server says about the NDA for this visitor type and person. */
interface KioskNdaInfo {
  ndaDocumentId: string
  title: string
  version: number
  documentUrl: string
}

// Storage key for remembered employee (persists across sign-outs for auto sign-in)
const REMEMBERED_EMPLOYEE_KEY = "talusag_remembered_employee"
// Storage key for active employee session (persists across same-tab navigation, clears on sign-out or tab close)
const ACTIVE_EMPLOYEE_SESSION_KEY = "talusag_active_employee_session"
// Storage key for last sign-out date (prevents auto sign-in until next day after manual sign-out)
const LAST_SIGNOUT_DATE_KEY = "talusag_last_signout_date"
// Storage key for tracking when employee went outside geofence (persists across page navigation)
const OUTSIDE_GEOFENCE_SINCE_KEY = "talusag_outside_geofence_since"

interface RememberedEmployee {
  id: string
  email: string
  fullName: string
  locationId: string | null
  role: "admin" | "staff" | "viewer" | "employee"
  custom_role_id: string
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
  const ndaEnabled = useNdaEnabled()
  const [mode, setMode] = useState<KioskMode>("receptionist-login")
  const [receptionistUser, setReceptionistUser] = useState<{ id: string; email: string; name: string } | null>(null)
  const [tenantLoaded, setTenantLoaded] = useState(false)
  const [microsoftSsoEnabled, setMicrosoftSsoEnabled] = useState(false)
  const [receptionistEmail, setReceptionistEmail] = useState("")
  const [receptionistPassword, setReceptionistPassword] = useState("")
  const [receptionistLoading, setReceptionistLoading] = useState(true)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [receptionistError, setReceptionistError] = useState<string | null>(null)
  const [visitorTypes, setVisitorTypes] = useState<VisitorType[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [hostsError, setHostsError] = useState<string | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [hasVendors, setHasVendors] = useState(false)
  const [companySearch, setCompanySearch] = useState("")
  const [companyResults, setCompanyResults] = useState<{ id: string; name: string }[]>([])
  const [isSearchingCompany, setIsSearchingCompany] = useState(false)
  const [showCompanyResults, setShowCompanyResults] = useState(false)
  const [otherCompanyName, setOtherCompanyName] = useState("")
  const [selectedLocation, setSelectedLocation] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signOutIdentifier, setSignOutIdentifier] = useState("")
  const [successData, setSuccessData] = useState<{
    name: string
    badge: string
    type: "in" | "out"
    email?: string
    company?: string
    visitorType?: string
    locationName?: string
    photoUrl?: string
    signInId?: string
    hostName?: string
    hostNotified?: boolean
  } | null>(null)
  const [lang, setLang] = useState<VisitorLang>("en")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [geofenceOverride, setGeofenceOverride] = useState(false)
  const [idleSeconds, setIdleSeconds] = useState<number | null>(null)
  const lastActivityRef = useRef(Date.now())
  const videoPlayingRef = useRef(false)
  const [photoStaffOverride, setPhotoStaffOverride] = useState(false)


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
  // Distance unit preference
  const [useMiles, setUseMiles] = useState(false)

  const [employeeSignedIn, setEmployeeSignedIn] = useState(false)

  // Geolocation (via Vincenty-based high-precision hook with averaged readings)
  // When an employee is signed in, enable continuous monitoring to detect if they leave the geofence
  const [userLocationName, setUserLocationName] = useState<string | null>(null)
  const {
    userCoords,
    nearestLocation,
    selectedLocationDistance,
    calculateDistance,
    formatDistance,
    geoError,
    isDetectingLocation,
    retryGeolocation,
  } = usePreciseGeolocation(
    locations,
    useMiles,
    selectedLocation,
    employeeSignedIn, // Enable continuous monitoring when employee is signed in
    30 * 1000 // Refresh location every 2 minutes
  )

  // Employee login state
  const [employeeEmail, setEmployeeEmail] = useState("")
  const [employeePassword, setEmployeePassword] = useState("")
  const [rememberedEmployee, setRememberedEmployee] = useState<RememberedEmployee | null>(null)
  const [currentEmployee, setCurrentEmployee] = useState<Profile | null>(null)
  const [employeeSignInRecord, setEmployeeSignInRecord] = useState<{ sign_in_time: string; location_name?: string; timezone?: string } | null>(null)
  const [rememberMe, setRememberMe] = useState(true)

  // Training video state
  const [trainingWatched, setTrainingWatched] = useState(false)
  const [trainingAcknowledged, setTrainingAcknowledged] = useState(false)
  /** Null means no signature is needed (feature off, none uploaded, or still valid). */
  const [ndaInfo, setNdaInfo] = useState<KioskNdaInfo | null>(null)
  const [ndaAgreed, setNdaAgreed] = useState(false)
  const [ndaHasInk, setNdaHasInk] = useState(false)
  /** Captured when leaving the NDA step, because the canvas unmounts with it. */
  const [ndaSignature, setNdaSignature] = useState<string | null>(null)
  const [visitorPhotoUrl, setVisitorPhotoUrl] = useState<string | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraIssue, setCameraIssue] = useState<CameraIssue | null>(null)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoStarted, setVideoStarted] = useState(false)
  const trainingPlaybackRef = useRef<TrainingPlaybackControls | null>(null)
  const [videoSeconds, setVideoSeconds] = useState<number | null>(null)
  const [clearanceMessage, setClearanceMessage] = useState<string | null>(null)
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
  const [codeDigits, setCodeDigits] = useState("")
  const videoTimerRef = useRef<NodeJS.Timeout | null>(null)
  /** Signed ticket from /api/kiosk/training/start; the server needs it to record training. */
  const trainingTicketRef = useRef<string | null>(null)
  /** Set when training-status said this visitor's earlier training is still valid. */
  const priorTrainingValidRef = useRef(false)
  const skipKindRef = useRef<"link" | "code" | null>(null)
  const codeProofRef = useRef<string | null>(null)
  // Guards against duplicate sign-ins / duplicate host notifications caused by
  // double/triple taps on the kiosk touchscreen or component re-renders.
  const ndaSignatureRef = useRef<SignaturePadHandle>(null)
  const signInInProgressRef = useRef(false)
  const hostNotifiedRef = useRef<string | null>(null)
  const signInIdempotencyKeyRef = useRef<string | null>(null)
  const trainingIdempotencyKeyRef = useRef<string | null>(null)

  // Settings state
  const [hostNotificationsEnabled, setHostNotificationsEnabled] = useState(true)

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

  // Load the tenant plan/addons from the DB so hasFeature() works correctly
  const loadTenant = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant")
      if (res.ok) {
        const { tenant } = await res.json()
        if (tenant) {
          setCurrentTenant(tenant)
        }
      }
    } catch {
      // Fallback to default tenant (starter) if fetch fails
    } finally {
      setTenantLoaded(true)
    }
  }, [])

  // Check Microsoft SSO status - always check on mount regardless of auth state
  // This allows the MS login button to show on the login page itself
  useEffect(() => {
    fetch("/api/auth/microsoft-sso-status")
      .then((res) => res.json())
      .then((d) => setMicrosoftSsoEnabled(d.enabled === true))
      .catch(() => setMicrosoftSsoEnabled(false))
  }, [])

  // Check if receptionist is already authenticated via separate cookie
  useEffect(() => {
    async function checkReceptionistSession() {
      try {
        const response = await fetch("/api/kiosk/receptionist-session")
        const data = await response.json()

        if (data.authenticated && data.user) {
          // Load tenant from DB before rendering feature-gated UI
          await loadTenant()

          setReceptionistUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
          })
          setMode("home")
          void loadData()

          // Check if Microsoft SSO is enabled (only available with SSO add-on)
          if (hasFeature("ssoIntegration")) {
            fetch("/api/auth/microsoft-sso-status")
              .then((res) => res.json())
              .then((d) => setMicrosoftSsoEnabled(d.enabled === true))
              .catch(() => setMicrosoftSsoEnabled(false))
          }
        }
      } catch (err) {
        console.error("Failed to check receptionist session:", err)
      } finally {
        setSessionChecked(true)
        setReceptionistLoading(false)
      }
    }
    checkReceptionistSession()
  }, [loadTenant])

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

      // Load tenant plan from DB before rendering feature-gated UI
      await loadTenant()

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
      void loadData()
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

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          redirectTo: callbackUrl,
          scopes: "email profile openid User.Read",
          skipBrowserRedirect: true,
          queryParams: {
            prompt: "select_account",
          },
        },
      })

      if (error) throw error
      if (data?.url) {
        window.location.href = fixAzureOAuthUrl(data.url)
      }
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
          // Fetch the latest open sign-in record. Use limit(1) + array access
          // (NOT .single(), which throws if multiple open rows exist) and avoid
          // an embedded locations join (which can fail under anon RLS and would
          // wipe out the whole row, leaving "Signed in at" blank).
          const { data: signInRows } = await supabase
            .from("employee_sign_ins")
            .select("sign_in_time, location_id")
            .eq("profile_id", profile.id)
            .is("sign_out_time", null)
            .order("sign_in_time", { ascending: false })
            .limit(1)
          const signInRecord = signInRows?.[0] ?? null

          setCurrentEmployee({
            id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            phone: profile.phone || null,
            department: profile.department || null,
            location_id: profile.location_id,
            role: profile.role,
            custom_role_id: profile.custom_role_id,
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
            // Resolve the location name/timezone separately (single-table read,
            // allowed for anon) so a join-RLS issue can't blank the sign-in time.
            let locName: string | undefined
            let locTz: string | undefined
            const locId = signInRecord.location_id || profile.location_id
            if (locId) {
              const { data: locRow } = await supabase
                .from("locations")
                .select("name, timezone")
                .eq("id", locId)
                .maybeSingle()
              if (locRow) {
                locName = locRow.name
                locTz = locRow.timezone
              }
            }
            setEmployeeSignInRecord({
              sign_in_time: signInRecord.sign_in_time,
              location_name: locName,
              timezone: locTz,
            })
          }
          setEmployeeSignedIn(true)
          setMode("employee-dashboard")

          // Remember this employee
          if (typeof window !== "undefined") {
            const rememberedData: RememberedEmployee = {
              id: profile.id,
              email: profile.email,
              fullName: profile.full_name || "",
              locationId: profile.location_id,
              role: profile.role,
              custom_role_id: profile.custom_role_id,
              avatar_url: profile.avatar_url || null,
              created_at: profile.created_at,
              updated_at: profile.updated_at,
            }
            localStorage.setItem(REMEMBERED_EMPLOYEE_KEY, JSON.stringify(rememberedData))
            setRememberedEmployee(rememberedData)
          }
        }

        // Clear the URL params
        router.replace("/kiosk")
      }

      loadEmployeeAfterOAuth()
    }
  }, [searchParams, router])

  // Load settings via API (bypasses RLS since kiosk has no Supabase auth session)
  useEffect(() => {
    async function loadSettings() {
      if (!selectedLocation) return

      try {
        const res = await fetch(`/api/kiosk/settings?location_id=${encodeURIComponent(selectedLocation)}`)
        if (!res.ok) return

        const { settings: merged } = await res.json()

        // Reset to defaults first
        setUseMiles(false)
        setHostNotificationsEnabled(true)

        if (merged.distance_unit_miles !== undefined) {
          setUseMiles(merged.distance_unit_miles === true || merged.distance_unit_miles === "true")
        }
        if (merged.host_notifications !== undefined) {
          setHostNotificationsEnabled(merged.host_notifications === true || merged.host_notifications === "true")
        }
      } catch (err) {
        console.error("Failed to load kiosk settings:", err)
      }
    }
    loadSettings()
  }, [selectedLocation])

  // NOTE: calculateDistance, formatDistance, watchPosition, findNearestLocation,
  // and selectedLocationDistance are now provided by usePreciseGeolocation hook.

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

  // Auto-select the nearest site from a fresh fix. Freeze mid visitor sign-in
  // so the site cannot jump while a guest is mid-flow.
  useEffect(() => {
    const freeze = isVisitorFlowMode(mode) || (isDetectingLocation && !userCoords)
    const resolved = resolveKioskSite({
      locations,
      nearestId: nearestLocation?.location.id ?? null,
      persistedId: readStaffSite(),
      currentId: selectedLocation || null,
      gpsReady: Boolean(userCoords) && !isDetectingLocation,
      freeze,
    })
    if (resolved.id && resolved.id !== selectedLocation) {
      setSelectedLocation(resolved.id)
      setGeofenceOverride(false)
    }
  }, [locations, nearestLocation, userCoords, isDetectingLocation, mode, selectedLocation])

  // Get the current selected location object
  const currentLocation = locations.find(l => l.id === selectedLocation)
  const currentTimezone = currentLocation?.timezone || "UTC"

  const siteKind = headerLocationKind({
    hasLocations: locations.length > 0,
    geoError,
    hasFix: Boolean(userCoords),
    isDetecting: isDetectingLocation,
    meters: selectedLocationDistance,
  })
  const siteUnavailable = siteKind === "unavailable"
  const siteMeters = siteKind === "distance" ? selectedLocationDistance : null

  // Geofence enforcement (same rules as QR, via lib/checkin-geofence).
  // Visitor unlock is PR #9's geofenceOverride ("Allow sign-in anyway").
  const geofenceRadius = currentLocation?.auto_signin_radius_meters
  const deviceCoords = userCoords
    ? {
        lat: userCoords.lat,
        lng: userCoords.lng,
        accuracy: userCoords.accuracy,
        timestamp: userCoords.timestamp,
      }
    : null
  const clientGate = kioskClientGate({
    target: currentLocation,
    coords: deviceCoords,
    geoError,
    isDetecting: isDetectingLocation,
    staffOverride: false,
  })
  const isOutsideGeofence = clientGate.blocked && clientGate.reason !== "checking"
  const fenceRadius = clientGate.verdict?.radius ?? geofenceRadius ?? null
  const fenceDistance = clientGate.verdict?.distance ?? selectedLocationDistance

  async function kioskCoordsPayload() {
    if (geofenceOverride) return deviceCoords
    const required = currentLocation ? shouldEnforceGeofence(currentLocation) : false
    if (!required) return deviceCoords
    const resolved = await resolveFreshDeviceCoords({ fallback: deviceCoords })
    if (!resolved.ok) {
      throw new Error(STALE_LOCATION_MESSAGE)
    }
    return resolved.coords
  }

  async function allowSignInAnyway() {
    if (!currentLocation || geofenceOverride) return
    setGeofenceOverride(true)
    await logAuditViaApi({
      action: "kiosk.geofence_override",
      entityType: "location",
      entityId: currentLocation.id,
      description: `Staff overrode the on-site check at ${currentLocation.name}`,
      metadata: {
        location_id: currentLocation.id,
        reason: clientGate.reason,
        distance_meters: fenceDistance != null ? Math.round(fenceDistance) : null,
      },
    })
  }

  // Auto sign-in countdown for remembered employees within geofence
  const [autoSignInCountdown, setAutoSignInCountdown] = useState<number | null>(null)
  const autoSignInTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Check for remembered employee on mount
  useEffect(() => {
    const stored = localStorage.getItem(REMEMBERED_EMPLOYEE_KEY)
    if (stored) {
      try {
        const employee = JSON.parse(stored) as RememberedEmployee
        setRememberedEmployee(employee)
      } catch (e) {
        localStorage.removeItem(REMEMBERED_EMPLOYEE_KEY)
      }
    }
  }, [])

  // Restore active employee session on mount (survives same-tab navigation)
  useEffect(() => {
    const session = sessionStorage.getItem(ACTIVE_EMPLOYEE_SESSION_KEY)
    if (session) {
      try {
        const { employee, signInRecord } = JSON.parse(session)
        if (employee && signInRecord) {
          setCurrentEmployee(employee)
          setEmployeeSignInRecord(signInRecord)
          setEmployeeSignedIn(true)
          setMode("employee-dashboard")
        }
      } catch {
        sessionStorage.removeItem(ACTIVE_EMPLOYEE_SESSION_KEY)
      }
    }
  }, [])

  // Persist active employee session to sessionStorage whenever it changes
  // This allows the session to survive same-tab navigation (e.g. visiting admin portal and back)
  useEffect(() => {
    if (employeeSignedIn && currentEmployee && employeeSignInRecord) {
      sessionStorage.setItem(ACTIVE_EMPLOYEE_SESSION_KEY, JSON.stringify({
        employee: currentEmployee,
        signInRecord: employeeSignInRecord,
      }))
    }
  }, [employeeSignedIn, currentEmployee, employeeSignInRecord])

  // Auto sign-in countdown for remembered employees within geofence
  useEffect(() => {
    if (!rememberedEmployee || employeeSignedIn || mode !== "home") return
    if (!selectedLocation) return

    // Check if employee already signed out today - skip auto sign-in until tomorrow
    const lastSignoutDate = localStorage.getItem(LAST_SIGNOUT_DATE_KEY)
    if (lastSignoutDate) {
      const today = new Date().toDateString()
      if (lastSignoutDate === today) {
        // Employee signed out today - don't auto sign-in until next day
        if (autoSignInTimerRef.current) {
          clearInterval(autoSignInTimerRef.current)
          autoSignInTimerRef.current = null
        }
        setAutoSignInCountdown(null)
        return
      }
    }

    if (clientGate.blocked && clientGate.reason === "checking") return

    if (clientGate.blocked) {
      if (autoSignInTimerRef.current) {
        clearInterval(autoSignInTimerRef.current)
        autoSignInTimerRef.current = null
      }
      setAutoSignInCountdown(null)
      return
    }

    // Either no geofence (auto-sign-in always allowed) or within geofence
    // Start a 5-second countdown, then auto sign-in
    if (autoSignInTimerRef.current) return // already running
    setAutoSignInCountdown(7)
    autoSignInTimerRef.current = setInterval(() => {
      setAutoSignInCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (autoSignInTimerRef.current) {
            clearInterval(autoSignInTimerRef.current)
            autoSignInTimerRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (autoSignInTimerRef.current) {
        clearInterval(autoSignInTimerRef.current)
        autoSignInTimerRef.current = null
      }
    }
  }, [rememberedEmployee, employeeSignedIn, mode, selectedLocation, clientGate.blocked, clientGate.reason])

  // Fire auto sign-in when countdown reaches 0
  useEffect(() => {
    if (autoSignInCountdown === 0 && rememberedEmployee && !employeeSignedIn) {
      autoSignInEmployee(rememberedEmployee)
    }
  }, [autoSignInCountdown])

  // Auto sign-out: track how long a signed-in employee is outside the geofence
  // Shows a visible countdown and auto-signs out when it reaches 0
  // Timestamp is persisted to sessionStorage so it survives page navigation
  const outsideGeofenceSinceRef = useRef<number | null>(null)
  const autoSignOutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [autoSignOutSecondsLeft, setAutoSignOutSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    // Clean up any existing timer first
    if (autoSignOutTimerRef.current) {
      clearInterval(autoSignOutTimerRef.current)
      autoSignOutTimerRef.current = null
    }

    const autoSignOutMinutes = currentLocation?.auto_signout_minutes
    // Only monitor if: employee is signed in, auto-signout is configured, and there's a geofence
    if (!employeeSignedIn || !currentEmployee || !autoSignOutMinutes || autoSignOutMinutes <= 0) {
      outsideGeofenceSinceRef.current = null
      sessionStorage.removeItem(OUTSIDE_GEOFENCE_SINCE_KEY)
      setAutoSignOutSecondsLeft(null)
      return
    }

    const thresholdMs = autoSignOutMinutes * 60 * 1000

    if (!isOutsideGeofence) {
      // Within geofence — reset everything and clear persisted timestamp
      outsideGeofenceSinceRef.current = null
      sessionStorage.removeItem(OUTSIDE_GEOFENCE_SINCE_KEY)
      setAutoSignOutSecondsLeft(null)
      return
    }

    // Outside geofence — start or continue tracking
    // First, try to restore from sessionStorage (survives page navigation)
    if (outsideGeofenceSinceRef.current === null) {
      const stored = sessionStorage.getItem(OUTSIDE_GEOFENCE_SINCE_KEY)
      if (stored) {
        outsideGeofenceSinceRef.current = parseInt(stored, 10)
      } else {
        outsideGeofenceSinceRef.current = Date.now()
        sessionStorage.setItem(OUTSIDE_GEOFENCE_SINCE_KEY, outsideGeofenceSinceRef.current.toString())
      }
    }

    // Tick every second for a live countdown
    autoSignOutTimerRef.current = setInterval(() => {
      if (outsideGeofenceSinceRef.current === null) return

      const elapsed = Date.now() - outsideGeofenceSinceRef.current
      const remaining = Math.max(0, Math.ceil((thresholdMs - elapsed) / 1000))
      setAutoSignOutSecondsLeft(remaining)

      if (remaining <= 0) {
        // Auto sign out
        fetch("/api/kiosk/employee-signout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: currentEmployee.id,
            location_id: selectedLocation,
          }),
        }).then(() => {
          setEmployeeSignedIn(false)
          setCurrentEmployee(null)
          setEmployeeSignInRecord(null)
          setAutoSignOutSecondsLeft(null)
          sessionStorage.removeItem("talusag_active_employee_session")
          setMode("home")
        }).catch(err => {
          console.error("Auto sign-out failed:", err)
        })

        // Clear after firing
        outsideGeofenceSinceRef.current = null
        sessionStorage.removeItem(OUTSIDE_GEOFENCE_SINCE_KEY)
        if (autoSignOutTimerRef.current) {
          clearInterval(autoSignOutTimerRef.current)
          autoSignOutTimerRef.current = null
        }
      }
    }, 1000)

    // Set initial countdown immediately
    const elapsed = Date.now() - outsideGeofenceSinceRef.current
    const remaining = Math.max(0, Math.ceil((thresholdMs - elapsed) / 1000))
    setAutoSignOutSecondsLeft(remaining)

    return () => {
      if (autoSignOutTimerRef.current) {
        clearInterval(autoSignOutTimerRef.current)
        autoSignOutTimerRef.current = null
      }
    }
  }, [employeeSignedIn, currentEmployee, isOutsideGeofence, currentLocation?.auto_signout_minutes, selectedLocation])

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
      // Call server-side API (uses service-role key, no auth session required)
      const response = await fetch("/api/kiosk/employee-auto-signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: employee.id,
          location_id: selectedLocation,
          coords: await kioskCoordsPayload(),
          staff_override: geofenceOverride || undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to auto sign in")
      }

      setCurrentEmployee({
        id: result.profile.id,
        email: result.profile.email,
        full_name: result.profile.full_name,
        phone: null,
        department: null,
        role: result.profile.role,
        custom_role_id: result.profile.custom_role_id,
        location_id: result.profile.location_id,
        timezone: result.profile.timezone,
        avatar_url: result.profile.avatar_url,
        last_auth_time: result.profile.last_auth_time,
        last_password_change: result.profile.last_password_change,
        account_locked_until: result.profile.account_locked_until,
        failed_login_attempts: result.profile.failed_login_attempts,
        created_at: "",
        updated_at: "",
      })
      setEmployeeSignInRecord({
        sign_in_time: result.signIn.sign_in_time,
        location_name: result.signIn.location_name,
        timezone: result.signIn.timezone,
      })
      setEmployeeSignedIn(true)
      setMode("employee-dashboard")
    } catch (err) {
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

          // Check if they have an active sign-in. Use limit(1) + array access
          // (not .single()) and resolve the location separately to stay robust
          // against multiple open rows and anon RLS on the locations join.
          const { data: activeSignInRows } = await supabase
            .from("employee_sign_ins")
            .select("sign_in_time, location_id")
            .eq("profile_id", profile.id)
            .is("sign_out_time", null)
            .order("sign_in_time", { ascending: false })
            .limit(1)
          const activeSignIn = activeSignInRows?.[0] ?? null

          if (activeSignIn) {
            let locName: string | undefined
            let locTz: string | undefined
            const locId = activeSignIn.location_id || profile.location_id
            if (locId) {
              const { data: locRow } = await supabase
                .from("locations")
                .select("name, timezone")
                .eq("id", locId)
                .maybeSingle()
              if (locRow) {
                locName = locRow.name
                locTz = locRow.timezone
              }
            }
            setEmployeeSignInRecord({
              sign_in_time: activeSignIn.sign_in_time,
              location_name: locName,
              timezone: locTz,
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

    const [{ data: locData }, typesRes, hostsRes] = await Promise.all([
      supabase.from("locations").select("*").order("name"),
      fetchVisitorTypesWithPhoto((columns) =>
        supabase.from("visitor_types").select(columns).order("name"),
      ),
      fetch("/api/kiosk/hosts"),
    ])

    if (locData && locData.length > 0) {
      setLocations(locData)
      // Only set a default if geolocation hasn't already picked one
      if (!selectedLocation) {
        const persisted = readStaffSite()
        const persistedOk = persisted && locData.some((loc) => loc.id === persisted)
        setSelectedLocation(persistedOk ? persisted : locData[0].id)
      }
    } else if (locData) {
      setLocations([])
    }
    if (typesRes.data) setVisitorTypes(typesRes.data as VisitorType[])

    if (hostsRes.ok) {
      const hostsJson = await hostsRes.json().catch(() => null)
      if (Array.isArray(hostsJson?.hosts)) {
        setHosts(hostsJson.hosts)
        setHostsError(null)
      } else {
        setHosts([])
        setHostsError("Could not load hosts")
      }
    } else if (hostsRes.status !== 401) {
      const hostsJson = await hostsRes.json().catch(() => null)
      setHosts([])
      setHostsError(hostsJson?.error || "Could not load hosts")
    }

    // Check if vendors exist (just fetch 1 to see if the table has data)
    try {
      const res = await fetch("/api/vendors?active_only=true&limit=1")
      if (res.ok) {
        const { vendors } = await res.json()
        if (vendors && vendors.length > 0) setHasVendors(true)
      }
    } catch {
      // Fallback: no vendor list, will show free text input
    }
  }

  // Lookup bookings by email
  async function handleBookingLookup(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setBookingResults([])
    setSelectedBooking(null)

    try {
      if (!selectedLocation) {
        setError("Select a site first, then look up your booking for today.")
        return
      }

      const supabase = createClient()
      const bounds = localDayBounds(currentTimezone)

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
        .eq("location_id", selectedLocation)
        .gte("expected_arrival", bounds.start.toISOString())
        .lt("expected_arrival", bounds.end.toISOString())
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
    if (isOutsideGeofence && !geofenceOverride) {
      setError(visitorCopy(lang).geofenceVisitor)
      return
    }
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
        let visitorId: string | null = null

        if (selectedBooking.visitor_email) {
          const statusRes = await fetch("/api/kiosk/training-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: selectedBooking.visitor_email,
              visitor_type_id: visitorTypeData.id,
            }),
          })
          if (statusRes.ok) {
            const status = await statusRes.json()
            visitorId = status.visitorId || null
            if (status.skipKind === "link" && visitorId) {
              await completeBookingSignIn(visitorId)
              return
            }
            if (status.skipKind === "code") {
              skipKindRef.current = "code"
              setClearanceMessage(status.message || null)
              setMaskedEmail(status.maskedEmail || null)
              setForm({
                firstName: selectedBooking.visitor_first_name,
                lastName: selectedBooking.visitor_last_name,
                email: selectedBooking.visitor_email,
                phone: "",
                company: selectedBooking.visitor_company || "",
                visitorTypeId: visitorTypeData.id,
                hostId: selectedBooking.host_id || "",
                purpose: selectedBooking.purpose || "",
              })
              setMode("code")
              void requestTrainingCode(selectedBooking.visitor_email, visitorTypeData.id)
              setIsLoading(false)
              return
            }
          }
        }

        // Need to show training video
        // Send host notification BEFORE training starts (deduped against retaps)
        await sendTrainingHostNotification({
          hostId: selectedBooking.host_id,
          visitorName: `${selectedBooking.visitor_first_name} ${selectedBooking.visitor_last_name}`,
          visitorCompany: selectedBooking.visitor_company,
          purpose: selectedBooking.purpose,
          visitorTypeName: visitorTypeData?.name,
          visitorTypeId: visitorTypeData?.id,
        })

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
      // Handle specific error cases with user-friendly messages
      const errorMessage = err instanceof Error ? err.message : "Failed to sign in"

      // "signal is aborted without reason" is a network/fetch error that can occur
      // due to connectivity issues or the request being interrupted
      if (errorMessage.toLowerCase().includes("signal") && errorMessage.toLowerCase().includes("abort")) {
        setError("Connection interrupted. Please check your internet connection and try again.")
      } else if (errorMessage.toLowerCase().includes("invalid login credentials")) {
        setError("Invalid email or password. Please try again.")
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Badge format is shared with the QR self sign-in flow: "V" + five digits.
  function generateBadgeNumber(): string {
    return makeBadgeNumber()
  }

  // Send a host notification at most once per visitor session and per type.
  // The dedupe key prevents the same email/SMS from being sent multiple times
  // when the kiosk button is tapped repeatedly or a handler re-runs.
  async function sendTrainingHostNotification(opts: {
    hostId: string | null
    visitorName: string
    visitorCompany?: string | null
    purpose?: string | null
    visitorTypeName?: string | null
    visitorTypeId?: string | null
  }) {
    if (!hostNotificationsEnabled || !opts.hostId) return

    const dedupeKey = `${opts.hostId}:completing_training`
    if (hostNotifiedRef.current === dedupeKey) return
    hostNotifiedRef.current = dedupeKey
    if (!trainingIdempotencyKeyRef.current) {
      trainingIdempotencyKeyRef.current = crypto.randomUUID()
    }

    try {
      const res = await fetch("/api/notify-host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostId: opts.hostId,
          visitorName: opts.visitorName,
          visitorCompany: opts.visitorCompany,
          purpose: opts.purpose,
          locationName: currentLocation?.name,
          locationId: currentLocation?.id,
          notificationType: "completing_training",
          visitorTypeName: opts.visitorTypeName,
          visitorTypeId: opts.visitorTypeId,
          idempotencyKey: trainingIdempotencyKeyRef.current,
        }),
      })
      if (!res.ok) {
        hostNotifiedRef.current = null
      }
    } catch (err) {
      hostNotifiedRef.current = null
      console.error("Failed to send host notification:", err)
    }
  }

  async function requestTrainingCode(email: string | null | undefined, visitorTypeId: string) {
    if (!email) return
    try {
      await fetch("/api/kiosk/training-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          visitor_type_id: visitorTypeId,
          location_id: selectedLocation || null,
        }),
      })
    } catch {
      // The visitor can watch the video if the email does not go out.
    }
  }

  // Issue a training ticket, then let the shared player report the ended event.
  // Start the player immediately so unmute + play stay on the same tap as "start".
  async function startVideoProgress() {
    if (videoStarted || isLoading) return
    if (!selectedVisitorType) return

    setError(null)
    setVideoStarted(true)
    setVideoProgress(0)
    videoPlayingRef.current = true
    void trainingPlaybackRef.current?.unmuteAndPlay()

    setIsLoading(true)
    try {
      const res = await fetch("/api/kiosk/training/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor_type_id: selectedVisitorType.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || typeof json.ticket !== "string") {
        throw new Error(json.error || "Could not start training. Please try again.")
      }
      trainingTicketRef.current = json.ticket
    } catch (err) {
      setVideoStarted(false)
      videoPlayingRef.current = false
      setError(err instanceof Error ? err.message : "Could not start training. Please try again.")
      return
    } finally {
      setIsLoading(false)
    }
  }

  async function verifyKioskCode() {
    if (!selectedVisitorType || codeDigits.length !== 6) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/kiosk/training-code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          visitor_type_id: selectedVisitorType.id,
          code: codeDigits,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || typeof json.proof !== "string") {
        throw new Error(json.error || "That code is not right.")
      }
      codeProofRef.current = json.proof
      priorTrainingValidRef.current = true
      skipKindRef.current = "code"
      proceedToPhoto()
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code is not right.")
    } finally {
      setIsLoading(false)
    }
  }

  // Walk-in visitor form submit: validate, then either go to training or photo.
  async function handleSignInSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (isOutsideGeofence && !geofenceOverride) {
      setError(visitorCopy(lang).geofenceVisitor)
      return
    }

    const nextErrors: Record<string, string> = {}
    if (!form.firstName.trim()) nextErrors.firstName = visitorCopy(lang).firstNameRequired
    if (!form.lastName.trim()) nextErrors.lastName = visitorCopy(lang).lastNameRequired
    if (!selectedVisitorType) nextErrors.visitorType = visitorCopy(lang).typeRequired
    if (selectedVisitorType?.requires_host && !form.hostId) nextErrors.host = visitorCopy(lang).hostRequired
    if (selectedVisitorType?.requires_company && !form.company.trim()) nextErrors.company = visitorCopy(lang).companyRequired
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setError(Object.values(nextErrors)[0])
      return
    }
    if (!selectedVisitorType) return

    setError(null)

    // Training required: check for a still-valid prior completion to skip the video.
    if (selectedVisitorType.requires_training) {
      setIsLoading(true)
      try {
        if (form.email) {
          const statusRes = await fetch("/api/kiosk/training-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: form.email,
              visitor_type_id: selectedVisitorType.id,
            }),
          })
          if (statusRes.ok) {
            const status = await statusRes.json()
            if (status.skipKind === "link") {
              priorTrainingValidRef.current = true
              skipKindRef.current = "link"
              setClearanceMessage(status.message || "You are cleared.")
              setIsLoading(false)
              setMode("cleared")
              return
            }
            if (status.skipKind === "code") {
              skipKindRef.current = "code"
              setClearanceMessage(status.message || null)
              setMaskedEmail(status.maskedEmail || null)
              setIsLoading(false)
              setMode("code")
              void requestTrainingCode(form.email, selectedVisitorType.id)
              return
            }
          }
        }

        // Notify the host once that the visitor is checking in and completing training.
        await sendTrainingHostNotification({
          hostId: form.hostId || null,
          visitorName: `${form.firstName} ${form.lastName}`,
          visitorCompany: form.company,
          purpose: form.purpose,
          visitorTypeName: selectedVisitorType.name,
          visitorTypeId: selectedVisitorType.id,
        })

        setMode("training")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to proceed")
      } finally {
        setIsLoading(false)
      }
      return
    }

    // No training required, go straight to the photo/sign-in step.
    proceedToPhoto()
  }

  // Finalize a sign-in (walk-in or booking that went through the photo step).
  async function completeSignIn() {
    if (signInInProgressRef.current) return
    signInInProgressRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      // 1. Create the visitor record.
      const visitorRes = await fetch("/api/kiosk/visitor", {
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
      const visitorData = await visitorRes.json()
      if (!visitorRes.ok) throw new Error(visitorData.error || "Failed to create visitor")
      const visitorId = visitorData.visitor.id

      // 2. Upload the captured photo, if any.
      let photoUrl: string | null = null
      if (capturedPhoto) {
        photoUrl = await uploadPhotoToSupabase(capturedPhoto, visitorId)
        if (photoUrl) {
          await fetch("/api/kiosk/visitor", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: visitorId, photo_url: photoUrl }),
          })
        }
      }

      // 3. Record training completion when applicable.
      // The server checks the training ticket (or an earlier valid completion)
      // and the acknowledgement before recording it, and the sign-in below is
      // refused without a valid completion.
      if (selectedVisitorType?.requires_training) {
        const trainingRes = await fetch("/api/kiosk/training", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitor_id: visitorId,
            visitor_type_id: selectedVisitorType.id,
            email: form.email || null,
            training: {
              ticket: trainingTicketRef.current,
              acknowledged: trainingAcknowledged,
              prior: priorTrainingValidRef.current,
              via: skipKindRef.current,
              codeToken: codeProofRef.current,
              videoSeconds,
            },
          }),
        })
        if (!trainingRes.ok) {
          const trainingJson = await trainingRes.json().catch(() => ({}))
          const code = typeof trainingJson.code === "string" ? trainingJson.code : ""
          if (code.startsWith("training_")) {
            // Back to the video with the reason shown, instead of a dead end.
            stopCamera()
            resetTraining()
            setMode("training")
            setError(trainingJson.error || "Please complete the safety training.")
            return
          }
          throw new Error(trainingJson.error || "Failed to record training")
        }
      }

      const badgeNumber = generateBadgeNumber()
      const visitorName = `${form.firstName} ${form.lastName}`

      // 3b. Record the NDA signature BEFORE the sign-in exists. If this fails the
      // visitor must not be admitted, and aborting here means there is no
      // sign-in row to unwind.
      let acknowledgementId: string | null = null
      if (ndaEnabled && ndaInfo && ndaSignature) {
        const ndaRes = await fetch("/api/kiosk/nda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "sign",
            ndaDocumentId: ndaInfo.ndaDocumentId,
            signatureDataUrl: ndaSignature,
            visitorId,
            visitorTypeId: selectedVisitorType?.id || null,
            locationId: selectedLocation,
            hostId: form.hostId || null,
            visitorName,
            visitorCompany: form.company || null,
            email: form.email || null,
          }),
        })
        const ndaJson = await ndaRes.json()
        if (!ndaRes.ok) throw new Error(ndaJson.error || "Could not record the signed NDA")
        acknowledgementId = ndaJson.acknowledgementId ?? null
      }

      if (!signInIdempotencyKeyRef.current) {
        signInIdempotencyKeyRef.current = crypto.randomUUID()
      }

      // 4. Create the sign-in record. Arrival email is sent by this route.
      const signInRes = await fetch("/api/kiosk/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id: visitorId,
          visitor_name: visitorName,
          visitor_email: form.email || null,
          visitor_company: form.company || null,
          purpose: form.purpose || null,
          visitor_type_name: selectedVisitorType?.name || null,
          location_id: selectedLocation,
          host_id: form.hostId || null,
          badge_number: badgeNumber,
          photo_url: photoUrl,
          visitor_type_id: form.visitorTypeId || null,
          booking_id: selectedBooking?.id || null,
          timezone: currentTimezone,
          idempotency_key: signInIdempotencyKeyRef.current,
          coords: await kioskCoordsPayload(),
          staff_override: geofenceOverride || undefined,
          photo_missing: !capturedPhoto && (photoStaffOverride || Boolean(cameraIssue)),
        }),
      })
      const signInData = await signInRes.json()
      if (!signInRes.ok) throw new Error(signInData.error || "Failed to sign in")

      // 4b. Bind the acknowledgement to the visit now that it exists. A failure
      // here is not fatal: the signed NDA is already stored against the visitor.
      if (acknowledgementId && signInData.signIn?.id) {
        await fetch("/api/kiosk/nda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "link",
            acknowledgementId,
            signInId: signInData.signIn.id,
          }),
        }).catch(() => { })
      }

      stopCamera()
      setSuccessData({
        name: visitorName,
        badge: badgeNumber,
        type: "in",
        email: form.email || undefined,
        company: form.company || undefined,
        visitorType: selectedVisitorType?.name,
        locationName: currentLocation?.name,
        photoUrl: photoUrl || undefined,
        signInId: signInData.signIn?.id,
        hostName: hosts.find((host) => host.id === form.hostId)?.name,
        hostNotified: hostNotificationsEnabled && Boolean(form.hostId),
      })
      setMode("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete sign in")
    } finally {
      setIsLoading(false)
      signInInProgressRef.current = false
    }
  }

  // Complete a booking sign-in directly (used when the booked visitor already
  // exists and has valid, unexpired training, so no video/photo is required).
  async function completeBookingSignIn(visitorId: string) {
    if (!selectedBooking) return
    if (signInInProgressRef.current) return
    signInInProgressRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      const badgeNumber = generateBadgeNumber()
      const visitorName = `${selectedBooking.visitor_first_name} ${selectedBooking.visitor_last_name}`

      if (!signInIdempotencyKeyRef.current) {
        signInIdempotencyKeyRef.current = crypto.randomUUID()
      }

      const signInRes = await fetch("/api/kiosk/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id: visitorId,
          visitor_name: visitorName,
          visitor_email: selectedBooking.visitor_email || null,
          visitor_company: selectedBooking.visitor_company || null,
          purpose: selectedBooking.purpose || null,
          visitor_type_name: selectedBooking.visitor_type?.name || null,
          location_id: selectedLocation,
          host_id: selectedBooking.host_id || null,
          badge_number: badgeNumber,
          photo_url: null,
          visitor_type_id: selectedBooking.visitor_type_id || selectedBooking.visitor_type?.id || null,
          booking_id: selectedBooking.id,
          timezone: currentTimezone,
          idempotency_key: signInIdempotencyKeyRef.current,
          coords: await kioskCoordsPayload(),
          staff_override: geofenceOverride || undefined,
        }),
      })
      const signInData = await signInRes.json()
      if (!signInRes.ok) throw new Error(signInData.error || "Failed to sign in")

      setSuccessData({
        name: visitorName,
        badge: badgeNumber,
        type: "in",
        email: selectedBooking.visitor_email || undefined,
        company: selectedBooking.visitor_company || undefined,
        visitorType: selectedBooking.visitor_type?.name,
        locationName: currentLocation?.name,
        signInId: signInData.signIn?.id,
        hostName: hosts.find((host) => host.id === selectedBooking.host_id)?.name,
        hostNotified: hostNotificationsEnabled && Boolean(selectedBooking.host_id),
      })
      setMode("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete sign in")
    } finally {
      setIsLoading(false)
      signInInProgressRef.current = false
    }
  }

  function resetTraining() {
    setTrainingWatched(false)
    setTrainingAcknowledged(false)
    setNdaInfo(null)
    setNdaAgreed(false)
    setNdaHasInk(false)
    setNdaSignature(null)
    setVideoProgress(0)
    setVideoStarted(false)
    setVideoSeconds(null)
    setClearanceMessage(null)
    setMaskedEmail(null)
    setCodeDigits("")
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current)
    }
    trainingTicketRef.current = null
    priorTrainingValidRef.current = false
    skipKindRef.current = null
    codeProofRef.current = null
  }

  // Camera functions for visitor photo
  async function startCamera() {
    try {
      setCameraError(null)
      setCameraIssue(null)
      setCameraReady(false)
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraIssue("unavailable")
        setCameraError(copy.photoCameraUnavailable)
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
      })
      setCameraStream(stream)
    } catch (err) {
      console.error("Camera access error:", err)
      const issue = classifyCameraError(err)
      setCameraIssue(issue)
      setCameraError(issue === "denied" ? copy.photoCameraDenied : copy.photoCameraUnavailable)
      setCameraReady(false)
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop())
      setCameraStream(null)
    }
    setCameraReady(false)
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

  // Attach the stream after photo mode mounts, then wait until video.play() resolves.
  useEffect(() => {
    const video = videoRef.current
    if (!cameraStream || !video || mode !== "photo" || capturedPhoto) {
      return
    }
    let cancelled = false
    setCameraReady(false)
    void attachAndPlayCamera(video, cameraStream)
      .then(() => {
        if (!cancelled) setCameraReady(true)
      })
      .catch(() => {
        if (!cancelled) setCameraReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [cameraStream, mode, capturedPhoto])

  // Go to photo mode after training (or directly if no training needed)
  /**
   * Gate the photo step behind the NDA when one is required.
   *
   * Every path into photo capture funnels through here (walk-in, post-training,
   * and booking), so this is the single place the NDA can be enforced without
   * duplicating the check.
   */
  async function proceedToPhoto() {
    if (ndaSignature) {
      // Already signed during this visit; do not ask twice.
      goToPhotoCapture()
      return
    }

    if (ndaEnabled && selectedVisitorType?.requires_nda) {
      setIsLoading(true)
      try {
        const res = await fetch("/api/kiosk/nda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "resolve",
            visitorTypeId: selectedVisitorType.id,
            locationId: selectedLocation,
            email: form.email || null,
          }),
        })
        const json = await res.json()
        if (res.ok && json.required) {
          setNdaInfo(json as KioskNdaInfo)
          setNdaAgreed(false)
          setNdaHasInk(false)
          stopCamera()
          setMode("nda")
          return
        }
        // Not required (or lookup failed): fall through. completeSignIn still
        // re-checks server-side, so a missed signature cannot slip through.
        setNdaInfo(null)
      } catch {
        setNdaInfo(null)
      } finally {
        setIsLoading(false)
      }
    }

    goToPhotoCapture()
  }

  function goToPhotoCapture() {
    // Skip photo capture if not available in current tier, not required for this
    // type, or a receptionist already overrode the requirement.
    if (!hasFeature("photoCapture") || !typeRequiresPhoto(selectedVisitorType) || photoStaffOverride) {
      completeSignIn()
      return
    }
    stopCamera()
    setCameraReady(false)
    setMode("photo")
    void startCamera()
  }

  async function handleSignOut(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const raw = signOutIdentifier.trim()
      if (!raw) {
        throw new Error("Enter your badge number or email")
      }
      const badge = normalizeBadgeInput(raw)
      const looksLikeBadge = BADGE_NUMBER_INPUT_RE.test(badge)

      const findRes = await fetch("/api/kiosk/find-sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(looksLikeBadge ? { badgeNumber: badge } : { email: raw }),
      })

      const findData = await findRes.json()

      if (!findRes.ok || !findData.sign_in) {
        throw new Error(findData.error || "No active sign-in found")
      }

      const signIn = findData.sign_in

      const signOutResponse = await fetch("/api/kiosk/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sign_in_id: signIn.id,
          visitor_id: signIn.visitor_id,
          visitor_name: signIn.visitor_name,
          visitor_email: signIn.visitor_email,
          badge_number: signIn.badge_number,
        }),
      })

      if (!signOutResponse.ok) {
        const errorData = await signOutResponse.json()
        throw new Error(errorData.error || "Failed to sign out")
      }

      if (signIn.visitor_email) {
        await fetch("/api/kiosk/complete-bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitor_email: String(signIn.visitor_email).toLowerCase().trim() }),
        })
      }

      setSuccessData({
        name: signIn.visitor_name || "",
        badge: signIn.badge_number || "",
        type: "out",
      })
      setMode("success")
      setSignOutIdentifier("")
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
    setCameraIssue(null)
    setOtherCompanyName("")
    setCompanySearch("")
    setCompanyResults([])
    setShowCompanyResults(false)
    setCameraError(null)
  }

  function handleReset() {
    setMode("home")
    setError(null)
    setSuccessData(null)
    resetForm()
    resetTraining()
    setSignOutIdentifier("")
    setEmployeeEmail("")
    setEmployeePassword("")
    // Clear booking state
    setBookingEmail("")
    setBookingResults([])
    setSelectedBooking(null)
    // Clear dedupe guards so the next visitor session can sign in and notify.
    signInInProgressRef.current = false
    hostNotifiedRef.current = null
    signInIdempotencyKeyRef.current = null
    trainingIdempotencyKeyRef.current = null
    setFieldErrors({})
    setPhotoStaffOverride(false)
    setIdleSeconds(null)
    lastActivityRef.current = Date.now()
    videoPlayingRef.current = false
  }

  async function handleEmployeeLogin(e: React.FormEvent) {
    e.preventDefault()

    if (isOutsideGeofence) {
      setError(`You are too far from ${currentLocation?.name || "the selected location"}. Please move within ${geofenceRadius ? Math.round(geofenceRadius) : 0} meters to sign in.`)
      return
    }

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

      // Log employee sign-in via API to bypass RLS
      await logAuditViaApi({
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
          custom_role_id: profile.custom_role_id,
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
          skipBrowserRedirect: true,
          queryParams: {
            prompt: "select_account",
          },
        },
      })

      if (error) throw error
      if (data?.url) {
        window.location.href = fixAzureOAuthUrl(data.url)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in with Microsoft")
      setIsLoading(false)
    }
  }

  async function handleEmployeeSignOut() {
    if (!currentEmployee) return
    setIsLoading(true)

    try {
      // Use server-side API to update the sign-in record (bypasses RLS)
      // This works for all sign-in methods: password, Microsoft SSO, and auto sign-in
      const response = await fetch("/api/kiosk/employee-signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: currentEmployee.id,
          location_id: selectedLocation,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to sign out")
      }

      // Also sign out of Supabase Auth if there's an active session
      const supabase = createClient()
      await supabase.auth.signOut({ scope: "global" }).catch(() => { })

      // Clear the active session and geofence tracking from sessionStorage
      sessionStorage.removeItem(ACTIVE_EMPLOYEE_SESSION_KEY)
      sessionStorage.removeItem(OUTSIDE_GEOFENCE_SINCE_KEY)

      // Store today's date to prevent auto sign-in until tomorrow
      // This ensures that after signing out for the day, the employee won't be
      // automatically signed back in while still within the geofence
      localStorage.setItem(LAST_SIGNOUT_DATE_KEY, new Date().toDateString())

      // NOTE: Do NOT clear REMEMBERED_EMPLOYEE_KEY here.
      // The "Remember Me" localStorage entry should survive sign-outs
      // so the auto sign-in countdown works when the employee returns.
      // Only forgetEmployee() (triggered by "Not you?") should clear it.

      // Clear runtime state but keep rememberedEmployee so the card shows on return
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
    // Clear local storage and session storage
    localStorage.removeItem(REMEMBERED_EMPLOYEE_KEY)
    localStorage.removeItem("rememberedEmployee")
    localStorage.removeItem(LAST_SIGNOUT_DATE_KEY)
    sessionStorage.removeItem(ACTIVE_EMPLOYEE_SESSION_KEY)
    sessionStorage.removeItem(OUTSIDE_GEOFENCE_SINCE_KEY)
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
  const copy = visitorCopy(lang)
  const staffFenceDetail =
    fenceDistance != null && fenceRadius != null
      ? staffGeofenceLine({
          copy,
          distanceMeters: fenceDistance,
          site: currentLocation?.name || "this site",
          radiusMeters: fenceRadius,
        })
      : null
  const visitorBlockedByGeofence =
    (clientGate.blocked && clientGate.reason === "checking") || (isOutsideGeofence && !geofenceOverride)

  useEffect(() => {
    setLang(readVisitorLang())
  }, [])

  useEffect(() => {
    lastActivityRef.current = Date.now()
    const bump = () => {
      lastActivityRef.current = Date.now()
      setIdleSeconds(null)
    }
    const events = ["pointerdown", "keydown", "touchstart"] as const
    events.forEach((event) => window.addEventListener(event, bump, { passive: true }))
    const timer = window.setInterval(() => {
      const visitorModes = ["visitor-type", "sign-in", "booking", "training", "cleared", "code", "photo", "sign-out", "success"]
      if (!visitorModes.includes(mode)) return
      const mediaPlaying = mode === "training" && (videoPlayingRef.current || (videoStarted && !trainingWatched))
      const done = mode === "success"
      const limitMs = done ? KIOSK_DONE_RESET_MS : KIOSK_IDLE_MS
      if (mediaPlaying) {
        setIdleSeconds(null)
        return
      }
      if (shouldIdleReset({
        now: Date.now(),
        lastActivityAt: lastActivityRef.current,
        mediaPlaying,
        busy: isLoading || signInInProgressRef.current,
        done: false,
        limitMs,
      })) {
        handleReset()
        return
      }
      if (shouldShowIdleWarning({ now: Date.now(), lastActivityAt: lastActivityRef.current, limitMs })) {
        setIdleSeconds(idleSecondsLeft({ now: Date.now(), lastActivityAt: lastActivityRef.current, limitMs }))
      } else {
        setIdleSeconds(null)
      }
    }, 1000)
    return () => {
      window.clearInterval(timer)
      events.forEach((event) => window.removeEventListener(event, bump))
    }
  }, [mode, videoStarted, trainingWatched, isLoading])

  if (kioskBootScreen({ sessionChecked, hasSession: Boolean(receptionistUser) }) === "loading") {
    return <KioskSessionLoading />
  }

  return (
    <div className="kiosk-touch min-h-screen bg-[#f5f8f6]">
      {mode === "receptionist-login" ? (
        <header className="bg-background/80 backdrop-blur-sm border-b sticky top-0 z-50">
          <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-center">
            <Link href="/">
              <TalusAgLogo />
            </Link>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-50 border-b border-[#dce6df] bg-white">
          <div className="container mx-auto flex items-center justify-between gap-2 px-3 py-3 sm:px-4">
            <div className="shrink-0">
              <Link href="/">
                <TalusAgLogo />
              </Link>
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-4">
              <div className="hidden min-w-0 items-center gap-3 text-sm md:flex">
                <span className="flex shrink-0 items-center gap-2 border-r border-[#dce6df] pr-3">
                  <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="font-medium">
                    {currentTime.toLocaleTimeString("en-US", {
                      timeZone: toIANATimezone(currentTimezone),
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                {siteKind === "none" ? (
                  receptionistUser ? (
                    <span className="truncate text-[#8a4500]">{copy.noSitesStaff}</span>
                  ) : null
                ) : siteKind === "detecting" || currentLocation ? (
                  <KioskSiteLine
                    siteName={currentLocation?.name ?? ""}
                    meters={siteMeters}
                    unavailable={siteUnavailable}
                    detecting={siteKind === "detecting"}
                    copy={copy}
                  />
                ) : null}
              </div>
              <div className={`min-w-0 md:hidden ${receptionistUser && siteKind !== "detecting" ? "hidden" : "max-w-[36%]"}`}>
                {siteKind === "none" ? (
                  receptionistUser ? (
                    <span className="block truncate text-xs text-[#8a4500]">{copy.noSitesStaff}</span>
                  ) : null
                ) : siteKind === "detecting" || currentLocation ? (
                  <KioskSiteLine
                    siteName={currentLocation?.name ?? ""}
                    meters={siteMeters}
                    unavailable={siteUnavailable}
                    detecting={siteKind === "detecting"}
                    copy={copy}
                    compact
                  />
                ) : null}
              </div>
              <LangToggle
                lang={lang}
                onLang={(next) => {
                  writeVisitorLang(next)
                  setLang(next)
                }}
              />

              {/* Receptionist lock/logout button */}
              {receptionistUser && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 min-h-11 min-w-11 bg-transparent px-2 text-muted-foreground hover:text-foreground"
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

      <main className="container mx-auto px-3 py-4 sm:px-4 sm:py-8">
        {idleSeconds !== null && (
          <button
            type="button"
            className="mb-4 w-full rounded-xl border border-[#8a4500] bg-[#fff3df] px-4 py-3 text-left text-[#8a4500]"
            onClick={() => {
              lastActivityRef.current = Date.now()
              setIdleSeconds(null)
            }}
          >
            {fill(copy.startingOver, { seconds: idleSeconds })}
          </button>
        )}
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
                      {locations.length === 0 ? (
                        <p className="text-sm text-[#8a4500]">{copy.noSitesStaff}</p>
                      ) : (
                        <KioskResolvedSite
                          label={copy.chooseSite}
                          siteName={currentLocation?.name ?? null}
                          distanceText={
                            selectedLocationDistance !== null
                              ? formatDistance(selectedLocationDistance, "from your location")
                              : null
                          }
                          pendingText={copy.checkingLocation}
                        />
                      )}
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

                      {microsoftSsoEnabled && (
                        <>
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
                        </>
                      )}
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {mode === "home" && (
          <div className="mx-auto max-w-5xl">
            {locations.length === 0 ? (
              <div className="mb-6 rounded-xl border border-[#fff3df] bg-[#fff3df] p-4">
                <p className="font-medium text-[#8a4500]">{copy.noSitesStaff}</p>
              </div>
            ) : null}
            {isOutsideGeofence && !geofenceOverride && (
              <div className="mb-6 rounded-xl border border-[#fff3df] bg-[#fff3df] p-4">
                <p className="font-medium text-[#8a4500]">{copy.geofenceVisitor}</p>
                {receptionistUser && (
                  <div className="mt-2 space-y-2 text-sm text-[#8a4500]">
                    {staffFenceDetail ? <p>{staffFenceDetail}</p> : null}
                    <Button type="button" variant="outline" className="min-h-12" onClick={() => void allowSignInAnyway()}>
                      {copy.geofenceOverride}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <KioskWelcome
              companyName={branding.companyName}
              copy={copy}
              onSignIn={() => setMode("visitor-type")}
              onSignOut={() => setMode("sign-out")}
              onBooking={() => setMode("booking")}
              onStaff={() => setMode("employee-login")}
              showBooking={hasFeature("visitorPreRegistration")}
              visitorBlocked={visitorBlockedByGeofence || locations.length === 0}
            />
            <div className="mt-6">
              {/* Employee Login/Sign Out Card - Show different state based on sign-in status */}
              {employeeSignedIn && currentEmployee ? (
                <Card className={`mb-4 sm:mb-6 ${autoSignOutSecondsLeft !== null ? "border-amber-300 bg-amber-50/50" : "border-green-200 bg-green-50/50"}`}>
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
                          {autoSignOutSecondsLeft !== null ? (
                            <p className="text-xs sm:text-sm text-amber-700 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Outside zone — auto sign-out in{" "}
                              <span className="font-mono font-bold">
                                {Math.floor(autoSignOutSecondsLeft / 60)}:{String(autoSignOutSecondsLeft % 60).padStart(2, "0")}
                              </span>
                            </p>
                          ) : (
                            <p className="flex items-center gap-1 text-xs text-[#00703f] sm:text-sm">
                              <CheckCircle className="w-3 h-3" />
                              Currently signed in
                            </p>
                          )}
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
              ) : null}

              {/* Remembered employee - only show quick sign-in option if NOT already signed in */}
              {rememberedEmployee && !employeeSignedIn && (
                <Card className={`mb-4 sm:mb-6 ${isOutsideGeofence ? "border-amber-200 bg-amber-50/50" : autoSignInCountdown !== null && autoSignInCountdown > 0 ? "border-green-300 bg-green-50/50" : "border-blue-200 bg-blue-50/50"}`}>
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
                            {isOutsideGeofence ? (
                              <span className="text-amber-700">
                                {selectedLocationDistance ? formatDistance(selectedLocationDistance, "away") : "Too far away"} — move closer to sign in
                              </span>
                            ) : autoSignInCountdown !== null && autoSignInCountdown > 0 ? (
                              <span className="text-green-700">
                                Auto signing in, in {autoSignInCountdown}s...
                              </span>
                            ) : (
                              selectedLocationDistance ? formatDistance(selectedLocationDistance, "from location") : "Quick sign in available"
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
                            // Cancel any running countdown
                            if (autoSignInTimerRef.current) {
                              clearInterval(autoSignInTimerRef.current)
                              autoSignInTimerRef.current = null
                            }
                            setAutoSignInCountdown(null)
                            forgetEmployee()
                          }}
                        >
                          Not you?
                        </Button>
                        {autoSignInCountdown !== null && autoSignInCountdown > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs sm:text-sm bg-transparent"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (autoSignInTimerRef.current) {
                                clearInterval(autoSignInTimerRef.current)
                                autoSignInTimerRef.current = null
                              }
                              setAutoSignInCountdown(null)
                            }}
                          >
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="text-xs sm:text-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              autoSignInEmployee(rememberedEmployee)
                            }}
                            disabled={isLoading || isOutsideGeofence}
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
                <Calendar className="w-4 h-4" />
                {formatDate(new Date().toISOString(), locations.find(l => l.id === selectedLocation)?.timezone || "UTC")}
              </p>
            </div>
          </div>
        )}

        {mode === "visitor-type" && (
          <div>
            {visitorBlockedByGeofence && (
              <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-[#fff3df] bg-[#fff3df] p-4">
                <p className="font-medium text-[#8a4500]">{copy.geofenceVisitor}</p>
                {receptionistUser && (
                  <div className="mt-2 space-y-2 text-sm text-[#8a4500]">
                    {staffFenceDetail ? <p>{staffFenceDetail}</p> : null}
                    <Button type="button" variant="outline" className="min-h-12" onClick={() => void allowSignInAnyway()}>
                      {copy.geofenceOverride}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <KioskTypeStep
              types={visitorTypes}
              copy={copy}
              onBack={() => setMode("home")}
              onPick={(id) => {
                setForm({ ...form, visitorTypeId: id })
                setFieldErrors({})
                setError(null)
                setMode("sign-in")
              }}
            />
          </div>
        )}

        {mode === "sign-in" && (
          <div className="max-w-xl mx-auto">
            <Button variant="ghost" className="mb-4 sm:mb-6 bg-transparent" onClick={() => setMode("visitor-type")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {copy.back}
            </Button>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <p className="mb-2 text-sm text-[#55625a]">{fill(copy.stepOf, { current: 2, total: selectedVisitorType?.requires_training ? 4 : 3 })}</p>
                <CardTitle className="text-xl sm:text-2xl">{copy.yourDetails}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">{copy.welcomeSubtitle}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                <form onSubmit={handleSignInSubmit} className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between gap-3 rounded-xl border bg-[#f5f8f6] p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: selectedVisitorType?.badge_color || "#00854c" }} />
                      <span className="truncate font-semibold">{selectedVisitorType?.name || copy.whyHere}</span>
                    </div>
                    <Button type="button" variant="ghost" className="shrink-0" onClick={() => setMode("visitor-type")}>
                      {copy.changeType}
                    </Button>
                  </div>
                  {fieldErrors.visitorType ? (
                    <p id="visitor-type-error" className="text-sm text-destructive" role="alert">{fieldErrors.visitorType}</p>
                  ) : null}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">{copy.firstName} *</Label>
                      <Input
                        id="firstName"
                        required
                        value={form.firstName}
                        onChange={(e) => {
                          setForm({ ...form, firstName: e.target.value })
                          setFieldErrors((prev) => ({ ...prev, firstName: "" }))
                        }}
                        aria-invalid={Boolean(fieldErrors.firstName)}
                        aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
                      />
                      {fieldErrors.firstName ? (
                        <p id="firstName-error" className="text-sm text-destructive" role="alert">{fieldErrors.firstName}</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">{copy.lastName} *</Label>
                      <Input
                        id="lastName"
                        required
                        value={form.lastName}
                        onChange={(e) => {
                          setForm({ ...form, lastName: e.target.value })
                          setFieldErrors((prev) => ({ ...prev, lastName: "" }))
                        }}
                        aria-invalid={Boolean(fieldErrors.lastName)}
                        aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
                      />
                      {fieldErrors.lastName ? (
                        <p id="lastName-error" className="text-sm text-destructive" role="alert">{fieldErrors.lastName}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">{copy.email}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      aria-describedby="email-hint"
                    />
                    <p id="email-hint" className="text-xs text-[#55625a]">{copy.emailHint}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">{copy.phone}</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>

                  {selectedVisitorType?.requires_company && (
                    <div className="space-y-2">
                      <Label htmlFor="company">{copy.company} *</Label>
                      {hasVendors ? (
                        <div className="relative">
                          <Input
                            id="company"
                            required
                            value={companySearch}
                            autoComplete="off"
                            onChange={async (e) => {
                              const val = e.target.value
                              setCompanySearch(val)
                              setForm({ ...form, company: val })
                              setFieldErrors((prev) => ({ ...prev, company: "" }))
                              setShowCompanyResults(true)

                              if (val.trim().length < 2) {
                                setCompanyResults([])
                                return
                              }

                              setIsSearchingCompany(true)
                              try {
                                const res = await fetch(
                                  `/api/vendors?active_only=true&q=${encodeURIComponent(val.trim())}&limit=10`
                                )
                                if (res.ok) {
                                  const { vendors } = await res.json()
                                  setCompanyResults(vendors || [])
                                }
                              } catch {
                                setCompanyResults([])
                              } finally {
                                setIsSearchingCompany(false)
                              }
                            }}
                            onFocus={() => {
                              if (companyResults.length > 0) setShowCompanyResults(true)
                            }}
                            onBlur={() => {
                              // Delay to allow click on results
                              setTimeout(() => setShowCompanyResults(false), 200)
                            }}
                            placeholder={copy.companyHint}
                            aria-invalid={Boolean(fieldErrors.company)}
                            aria-describedby={fieldErrors.company ? "company-error" : "company-hint"}
                          />
                          {showCompanyResults && companySearch.trim().length >= 2 && (
                            <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {isSearchingCompany ? (
                                <div className="p-3 text-sm text-muted-foreground text-center">
                                  Searching...
                                </div>
                              ) : companyResults.length > 0 ? (
                                <>
                                  {companyResults.map((vendor) => (
                                    <button
                                      key={vendor.id}
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer transition-colors"
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        setCompanySearch(vendor.name)
                                        setForm({ ...form, company: vendor.name })
                                        setShowCompanyResults(false)
                                      }}
                                    >
                                      {vendor.name}
                                    </button>
                                  ))}
                                </>
                              ) : (
                                <div className="p-3 text-sm text-muted-foreground text-center">
                                  {'No matching companies. You can type a custom name.'}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Input
                          id="company"
                          required={selectedVisitorType.requires_company}
                          value={form.company}
                          onChange={(e) => {
                            setForm({ ...form, company: e.target.value })
                            setFieldErrors((prev) => ({ ...prev, company: "" }))
                          }}
                          placeholder={copy.company}
                          aria-invalid={Boolean(fieldErrors.company)}
                          aria-describedby={fieldErrors.company ? "company-error" : undefined}
                        />
                      )}
                      {fieldErrors.company ? (
                        <p id="company-error" className="text-sm text-destructive" role="alert">{fieldErrors.company}</p>
                      ) : (
                        <p id="company-hint" className="text-xs text-[#55625a]">{copy.companyHint}</p>
                      )}
                    </div>
                  )}

                  {selectedVisitorType?.requires_host && (
                    <div className="space-y-2">
                      <Label htmlFor="host">{copy.host} *</Label>
                      <Select
                        value={form.hostId}
                        onValueChange={(value) => {
                          setForm({ ...form, hostId: value })
                          setFieldErrors((prev) => ({ ...prev, host: "" }))
                        }}
                      >
                        <SelectTrigger aria-invalid={Boolean(fieldErrors.host)} aria-describedby={fieldErrors.host ? "host-error" : "host-hint"}>
                          <SelectValue placeholder={copy.hostSearch} />
                        </SelectTrigger>
                        <SelectContent>
                          {hosts.map((host) => (
                            <SelectItem key={host.id} value={host.id}>
                              {host.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.host ? (
                        <p id="host-error" className="text-sm text-destructive" role="alert">{fieldErrors.host}</p>
                      ) : (
                        <p id="host-hint" className="text-xs text-[#55625a]">{copy.hostHint}</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="purpose">{copy.purpose}</Label>
                    <Textarea
                      id="purpose"
                      value={form.purpose}
                      onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                      rows={3}
                    />
                  </div>

                  {isOutsideGeofence && (
                    <div className="rounded-xl border border-[#fff3df] bg-[#fff3df] p-4">
                      <p className="font-medium text-[#8a4500]">{copy.geofenceVisitor}</p>
                      {receptionistUser && (
                        <div className="mt-2 space-y-2 text-sm text-[#8a4500]">
                          {staffFenceDetail ? <p>{staffFenceDetail}</p> : null}
                          <Button type="button" variant="outline" className="min-h-12" onClick={() => void allowSignInAnyway()}>
                            {copy.geofenceOverride}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

                  {hostsError && selectedVisitorType?.requires_host && (
                    <p className="text-sm text-destructive">{hostsError}</p>
                  )}

                  <Button type="submit" className="w-full" size="lg" disabled={isLoading || visitorBlockedByGeofence || Boolean(hostsError && selectedVisitorType?.requires_host)}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {selectedVisitorType?.requires_training ? copy.nextTraining : copy.completeSignIn}
                      </>
                    ) : selectedVisitorType?.requires_training ? (
                      <>
                        <PlayCircle className="w-4 h-4 mr-2" />
                        {copy.nextTraining}
                      </>
                    ) : typeRequiresPhoto(selectedVisitorType) ? (
                      copy.nextPhoto
                    ) : (
                      copy.completeSignIn
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

                    {isOutsideGeofence && (
                      <div className="rounded-xl border border-[#fff3df] bg-[#fff3df] p-4">
                        <p className="font-medium text-[#8a4500]">{copy.geofenceVisitor}</p>
                        {receptionistUser && (
                          <div className="mt-2 space-y-2 text-sm text-[#8a4500]">
                            {staffFenceDetail ? <p>{staffFenceDetail}</p> : null}
                            <Button type="button" variant="outline" className="min-h-12" onClick={() => void allowSignInAnyway()}>
                              {copy.geofenceOverride}
                            </Button>
                          </div>
                        )}
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
                        disabled={!selectedBooking || isLoading || visitorBlockedByGeofence}
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
                <CardDescription className="text-xs sm:text-sm">Enter your badge number or the email you used when signing in</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignOut} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signOutIdentifier">Badge number or email</Label>
                    <Input
                      id="signOutIdentifier"
                      type="text"
                      required
                      value={signOutIdentifier}
                      onChange={(e) => setSignOutIdentifier(e.target.value)}
                      placeholder="V04821 or name@example.com"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoComplete="off"
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
                    <CardDescription className="text-xs sm:text-sm">Sign in with your {branding.companyName} credentials</CardDescription>
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
                      placeholder={`you@${branding.companyName?.toLowerCase().replace(/[\s.-]+/g, "") || "talusag"}.com`}
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
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
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
                  {locations.length === 0 ? (
                    <p className="text-sm text-[#8a4500]">{copy.noSitesStaff}</p>
                  ) : (
                    <KioskResolvedSite
                      label={copy.chooseSite}
                      siteName={currentLocation?.name ?? null}
                      distanceText={
                        selectedLocationDistance !== null
                          ? formatDistance(selectedLocationDistance, "from your location")
                          : null
                      }
                      pendingText={copy.checkingLocation}
                    />
                  )}

                  {isOutsideGeofence && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">
                        You are too far from {currentLocation?.name || "this location"}.
                        Move within {geofenceRadius ? formatDistance(geofenceRadius, "") : "range"} to sign in.
                      </p>
                    </div>
                  )}

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" className="w-full" size="lg" disabled={isLoading || isOutsideGeofence}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>

                  {microsoftSsoEnabled && (
                    <>
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
                    </>
                  )}
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
              {copy.back}
            </Button>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-start sm:items-center gap-3 mb-2">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg sm:text-2xl">
                      {selectedVisitorType.training_title || copy.trainingTitle}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {copy.trainingHelp}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4 sm:space-y-6">
                <div className="relative">
                  {selectedVisitorType.training_video_url ? (
                    <>
                      <TrainingPlayer
                        url={selectedVisitorType.training_video_url}
                        title={selectedVisitorType.training_title || copy.trainingTitle}
                        autoPlay={videoStarted}
                        unmuteLabel={copy.tapToUnmute}
                        onPlaybackReady={(controls) => {
                          trainingPlaybackRef.current = controls
                        }}
                        onDuration={setVideoSeconds}
                        onPlayingChange={(playing) => {
                          videoPlayingRef.current = playing
                        }}
                        onEnded={(seconds) => {
                          videoPlayingRef.current = false
                          setVideoSeconds(seconds)
                          setTrainingWatched(true)
                          setVideoProgress(100)
                        }}
                      />
                      {!videoStarted ? (
                        <div
                          className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-lg bg-foreground/60 cursor-pointer"
                          onClick={() => void startVideoProgress()}
                        >
                          <div className="w-20 h-20 rounded-full bg-background flex items-center justify-center mb-4 hover:scale-110 transition-transform">
                            <PlayCircle className="w-12 h-12 text-primary" />
                          </div>
                          <p className="text-background font-medium text-lg">{copy.tapToStart}</p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="aspect-video w-full flex flex-col items-center justify-center text-muted-foreground rounded-lg bg-muted">
                      <PlayCircle className="w-16 h-16 mb-4 opacity-50" />
                      <p>{copy.trainingTitle}</p>
                      <p className="text-sm">{copy.geofenceVisitor}</p>
                    </div>
                  )}
                </div>

                {videoStarted && !trainingWatched && (
                  <p className="text-sm text-muted-foreground">
                    {copy.trainingHelp}
                  </p>
                )}

                {trainingWatched && (
                  <div className="rounded-lg border border-[#dce6df] bg-[#e2f4e9] p-4">
                    <label htmlFor="acknowledge" className="flex min-h-12 cursor-pointer items-start gap-3">
                      <Checkbox
                        id="acknowledge"
                        checked={trainingAcknowledged}
                        onCheckedChange={(checked) => setTrainingAcknowledged(checked === true)}
                        className="mt-1"
                      />
                      <span className="text-sm leading-relaxed">{copy.trainingAck}</span>
                    </label>
                  </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  onClick={proceedToPhoto}
                  className="w-full"
                  size="lg"
                  disabled={!trainingWatched || !trainingAcknowledged || isLoading}
                >
                  {isLoading ? (
                    copy.continue
                  ) : typeRequiresPhoto(selectedVisitorType) ? (
                    <>
                      <Camera className="w-4 h-4 mr-2" />
                      {copy.nextPhoto}
                    </>
                  ) : (
                    copy.completeSignIn
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "cleared" && selectedVisitorType && (
          <div className="max-w-3xl mx-auto space-y-4">
            <Button variant="ghost" className="bg-transparent" onClick={() => setMode("sign-in")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Card className="border-2 border-[#00854c]">
              <CardContent className="p-8 space-y-3">
                <p className="inline-flex items-center gap-2 rounded-full bg-[#e2f4e9] px-3 py-1 text-sm font-semibold text-[#00703f]">
                  <Shield className="w-4 h-4" />
                  Safety training done
                </p>
                <h2 className="text-3xl font-bold">You are cleared, {form.firstName || "visitor"}</h2>
                <p className="text-lg">{clearanceMessage || "You did the safety video. You are cleared."}</p>
                <p className="text-muted-foreground">You watched the safety video from your training link. No video and no code today.</p>
              </CardContent>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" className="h-14" onClick={() => setMode("training")}>
                Watch it anyway
              </Button>
              <Button className="h-14 flex-1 bg-[#00854c] hover:bg-[#00703f]" onClick={() => proceedToPhoto()}>
                Next: photo
              </Button>
            </div>
          </div>
        )}

        {mode === "code" && selectedVisitorType && (
          <div className="max-w-3xl mx-auto space-y-4">
            <Button variant="ghost" className="bg-transparent" onClick={() => setMode("sign-in")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardContent className="p-8 space-y-4">
                  <p className="inline-flex items-center gap-2 rounded-full bg-[#e2f4e9] px-3 py-1 text-sm font-semibold text-[#00703f]">
                    Training on file
                  </p>
                  <h2 className="text-3xl font-bold">Type the 6 digit code</h2>
                  <p className="text-muted-foreground">
                    Welcome back. This email finished safety training before. To skip the video, type the code we sent to{" "}
                    <b className="text-foreground">{maskedEmail || form.email}</b>. It works for 30 minutes.
                  </p>
                  {clearanceMessage ? <p className="text-sm">{clearanceMessage}</p> : null}
                  <div className="flex gap-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={index}
                        className="flex h-16 w-12 items-center justify-center rounded-xl border-2 border-[#7b8b7f] font-mono text-3xl font-bold"
                      >
                        {codeDigits[index] || ""}
                      </div>
                    ))}
                  </div>
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      className="h-14"
                      onClick={() => void requestTrainingCode(form.email, selectedVisitorType.id)}
                    >
                      Send again
                    </Button>
                    <Button variant="outline" className="h-14" onClick={() => setMode("training")}>
                      Watch the video instead
                    </Button>
                    <Button
                      className="h-14 bg-[#00854c] hover:bg-[#00703f]"
                      disabled={codeDigits.length !== 6 || isLoading}
                      onClick={() => void verifyKioskCode()}
                    >
                      Continue
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="grid grid-cols-3 gap-3 p-5">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key) =>
                    key ? (
                      <Button
                        key={key}
                        variant="outline"
                        className="h-24 text-3xl"
                        onClick={() => {
                          if (key === "⌫") setCodeDigits((value) => value.slice(0, -1))
                          else setCodeDigits((value) => (value.length < 6 ? value + key : value))
                        }}
                      >
                        {key}
                      </Button>
                    ) : (
                      <span key="blank" />
                    ),
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {mode === "nda" && ndaInfo && (
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {ndaInfo.title}
                </CardTitle>
                <CardDescription>
                  Please read the agreement, then sign below to continue your sign-in.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <a
                  href={ndaInfo.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                >
                  <span className="flex items-center gap-3">
                    <FileText className="w-5 h-5 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="block text-sm font-medium">Read the agreement</span>
                      <span className="block text-xs text-muted-foreground">
                        {`Version ${ndaInfo.version} • Opens the PDF`}
                      </span>
                    </span>
                  </span>
                  <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground" />
                </a>

                <div className="flex items-start gap-3 rounded-lg border p-4">
                  <Checkbox
                    id="nda-agree"
                    checked={ndaAgreed}
                    onCheckedChange={(checked) => setNdaAgreed(checked === true)}
                    className="mt-1"
                  />
                  <label htmlFor="nda-agree" className="text-sm leading-relaxed cursor-pointer">
                    I have read and agree to the terms of this non-disclosure agreement.
                  </label>
                </div>

                <SignaturePad ref={ndaSignatureRef} onChange={setNdaHasInk} ariaLabel="Your signature" />

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-3">
                  <Button variant="outline" size="lg" onClick={() => setMode("sign-in")} className="flex-1">
                    Back
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={!ndaAgreed || !ndaHasInk || isLoading}
                    onClick={() => {
                      const drawn = ndaSignatureRef.current?.toDataUrl() ?? null
                      if (!drawn) {
                        setError("Please sign in the box above.")
                        return
                      }
                      setError(null)
                      setNdaSignature(drawn)
                      goToPhotoCapture()
                    }}
                  >
                    {!ndaAgreed ? "Please Agree to Continue" : !ndaHasInk ? "Please Sign to Continue" : "Continue"}
                  </Button>
                </div>
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
                    <CardTitle className="text-lg sm:text-2xl">{copy.photoTitle}</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {typeRequiresPhoto(selectedVisitorType) ? copy.photoRequired : copy.photoHelp}
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
                      <p className="mt-2 text-sm font-medium text-[#00703f]">{copy.askReception}</p>
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
                      {!cameraReady && (
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
                        {isLoading ? copy.completeSignIn : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {copy.completeSignIn}
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      {typeRequiresPhoto(selectedVisitorType) ? (
                        cameraIssue ? (
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
                            {copy.askReception}
                          </Button>
                        ) : receptionistUser ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setPhotoStaffOverride(true)
                              setCapturedPhoto(null)
                              stopCamera()
                              completeSignIn()
                            }}
                            className="flex-1 bg-transparent"
                            disabled={isLoading}
                          >
                            {copy.skipPhotoStaff}
                          </Button>
                        ) : (
                          <p className="flex-1 text-sm text-[#55625a]">{copy.photoStaffHelp}</p>
                        )
                      ) : (
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
                          {copy.skipPhoto}
                        </Button>
                      )}
                      <Button
                        onClick={capturePhoto}
                        className="flex-1"
                        disabled={!cameraReady || isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {copy.continue}
                          </>
                        ) : (
                          <>
                            <Camera className="w-4 h-4 mr-2" />
                            {copy.takePhoto}
                          </>
                        )}
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

                <h2 className="text-xl sm:text-2xl font-bold mb-2">{successData.type === "in" ? copy.signedInTitle : copy.signedOutTitle}</h2>
                <p className="text-base sm:text-lg text-muted-foreground mb-4 sm:mb-6">{successData.name}</p>

                {successData.type === "in" && (
                  <div className="bg-secondary rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">{copy.badgeNumber}</p>
                    <p className="text-2xl sm:text-3xl font-mono font-bold text-foreground">{successData.badge}</p>
                  </div>
                )}

                {successData.type === "in" && successData.signInId && (
                  <div className="mb-4 sm:mb-6">
                    <div className="bg-white rounded-lg p-3 inline-block mx-auto">
                      <QRCode
                        value={`${typeof window !== "undefined" ? window.location.origin : ""}/badge/${successData.signInId}`}
                        size={140}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Scan for your digital badge
                    </p>
                  </div>
                )}

                {successData.type === "in" ? (
                  <p className="mb-2 text-sm font-medium text-[#00703f]">
                    {hostArrivalMessage({
                      signedIn: true,
                      hostName: successData.hostName,
                      hostNotified: successData.hostNotified,
                      copy,
                    }) || copy.hostNotTold}
                  </p>
                ) : null}
                <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">
                  {successData.type === "in"
                    ? `${copy.collectBadge} ${copy.rememberSignOut}`
                    : fill(copy.thanksVisit, { company: branding.companyName })}
                </p>

                <div className="flex flex-col gap-2">
                  {successData.type === "in" && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full"
                      onClick={() =>
                        printVisitorBadge({
                          visitorName: successData.name,
                          visitorEmail: successData.email,
                          visitorCompany: successData.company,
                          visitorType: successData.visitorType,
                          badgeNumber: successData.badge,
                          locationName: successData.locationName,
                          photoUrl: successData.photoUrl,
                        })
                      }
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Print Badge
                    </Button>
                  )}
                  <Button onClick={handleReset} size="lg" className="w-full">
                    {copy.done}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
