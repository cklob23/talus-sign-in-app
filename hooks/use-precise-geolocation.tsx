"use client"

import { useCallback, useEffect, useState } from "react"
import type { Location as AppLocation } from "@/types/database"

interface Coords {
    lat: number
    lng: number
    accuracy: number
}

export interface PreciseGeolocationResult {
    userCoords: Coords | null
    nearestLocation: { location: AppLocation; distance: number } | null
    selectedLocationDistance: number | null
    calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number
    formatDistance: (meters: number, suffix?: string) => string
    geoError: string | null
    isDetectingLocation: boolean
    retryGeolocation: () => void
}

export function usePreciseGeolocation(
    locations: AppLocation[],
    useMiles: boolean,
    selectedLocation: string | null,
    /** If true, continuously refresh location every refreshIntervalMs */
    continuousMonitoring = false,
    /** Refresh interval in ms (default 2 minutes) */
    refreshIntervalMs = 2 * 60 * 1000
): PreciseGeolocationResult {
    const [userCoords, setUserCoords] = useState<Coords | null>(null)
    const [nearestLocation, setNearestLocation] = useState<{
        location: AppLocation
        distance: number
    } | null>(null)
    const [selectedLocationDistance, setSelectedLocationDistance] =
        useState<number | null>(null)
    const [geoError, setGeoError] = useState<string | null>(null)
    const [isDetectingLocation, setIsDetectingLocation] = useState(true)

    // ---------------------------------------------------
    // 1️⃣ Vincenty Formula (Highest Accuracy)
    // ---------------------------------------------------
    const calculateDistance = useCallback(
        (lat1: number, lon1: number, lat2: number, lon2: number): number => {
            const toRad = (deg: number) => (deg * Math.PI) / 180

            const a = 6378137
            const f = 1 / 298.257223563
            const b = (1 - f) * a

            const φ1 = toRad(lat1)
            const φ2 = toRad(lat2)
            const U1 = Math.atan((1 - f) * Math.tan(φ1))
            const U2 = Math.atan((1 - f) * Math.tan(φ2))
            const L = toRad(lon2 - lon1)

            let λ = L
            let λPrev
            let iterLimit = 100

            let sinσ = 0
            let cosσ = 0
            let σ = 0
            let sinα = 0
            let cosSqα = 0
            let cos2σm = 0

            do {
                const sinλ = Math.sin(λ)
                const cosλ = Math.cos(λ)

                sinσ = Math.sqrt(
                    (Math.cos(U2) * sinλ) ** 2 +
                    (Math.cos(U1) * Math.sin(U2) -
                        Math.sin(U1) * Math.cos(U2) * cosλ) **
                    2
                )

                if (sinσ === 0) return 0

                cosσ =
                    Math.sin(U1) * Math.sin(U2) +
                    Math.cos(U1) * Math.cos(U2) * cosλ

                σ = Math.atan2(sinσ, cosσ)

                sinα =
                    (Math.cos(U1) * Math.cos(U2) * sinλ) / sinσ

                cosSqα = 1 - sinα ** 2

                cos2σm =
                    cosSqα !== 0
                        ? cosσ -
                        (2 * Math.sin(U1) * Math.sin(U2)) /
                        cosSqα
                        : 0

                const C =
                    (f / 16) *
                    cosSqα *
                    (4 + f * (4 - 3 * cosSqα))

                λPrev = λ
                λ =
                    L +
                    (1 - C) *
                    f *
                    sinα *
                    (σ +
                        C *
                        sinσ *
                        (cos2σm +
                            C *
                            cosσ *
                            (-1 + 2 * cos2σm ** 2)))
            } while (
                Math.abs(λ - λPrev) > 1e-12 &&
                --iterLimit > 0
            )

            const uSq =
                (cosSqα * (a ** 2 - b ** 2)) / b ** 2

            const A =
                1 +
                (uSq / 16384) *
                (4096 +
                    uSq *
                    (-768 + uSq * (320 - 175 * uSq)))

            const B =
                (uSq / 1024) *
                (256 +
                    uSq *
                    (-128 + uSq * (74 - 47 * uSq)))

            const Δσ =
                B *
                sinσ *
                (cos2σm +
                    (B / 4) *
                    (cosσ *
                        (-1 + 2 * cos2σm ** 2) -
                        (B / 6) *
                        cos2σm *
                        (-3 + 4 * sinσ ** 2) *
                        (-3 + 4 * cos2σm ** 2)))

            const s = b * A * (σ - Δσ)

            return s // meters
        },
        []
    )

    // ---------------------------------------------------
    // 2️⃣ Format Distance
    // ---------------------------------------------------
    const formatDistance = useCallback(
        (meters: number, suffix = "away"): string => {
            if (useMiles) {
                const miles = meters / 1609.34
                if (miles < 0.1) {
                    const feet = Math.round(meters * 3.28084)
                    return `${feet}ft ${suffix}`
                }
                return `${miles.toFixed(2)}mi ${suffix}`
            }

            if (meters < 1000) {
                return `${Math.round(meters)}m ${suffix}`
            }

            return `${(meters / 1000).toFixed(2)}km ${suffix}`
        },
        [useMiles]
    )

    // ---------------------------------------------------
    // 3️⃣ Get High Precision Location (Best-Accuracy)
    // ---------------------------------------------------
    // Keep watching for the most accurate GPS reading. The browser often
    // starts with a coarse WiFi/cell fix (100-300m) then refines to GPS
    // (3-15m) over several seconds. We keep watching for up to 20s,
    // replacing coords each time a more accurate reading arrives.
    // A retry function is exposed so the user can re-trigger if needed.
    const [geoRetryCount, setGeoRetryCount] = useState(0)

    const retryGeolocation = useCallback(() => {
        setUserCoords(null)
        setGeoError(null)
        setIsDetectingLocation(true)
        setGeoRetryCount(c => c + 1)
    }, [])

    useEffect(() => {
        if (!navigator.geolocation) {
            setGeoError("Geolocation not supported")
            setIsDetectingLocation(false)
            return
        }

        let bestAccuracy = Infinity
        let done = false
        let readingCount = 0

        // Keep watching for up to 20s to get the best possible fix.
        // Indoor kiosks/tablets may need the full duration.
        const timer = setTimeout(() => {
            if (!done) {
                done = true
                navigator.geolocation.clearWatch(watchId)
                setIsDetectingLocation(false)
            }
        }, 20000)

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords
                readingCount++

                // Always accept if this reading is more accurate than our current best
                if (accuracy < bestAccuracy) {
                    bestAccuracy = accuracy
                    setUserCoords({ lat: latitude, lng: longitude, accuracy })
                }

                // Show the UI as ready after the first reading, but keep refining
                setIsDetectingLocation(false)

                // Only stop early if we get an excellent GPS fix (<=10m)
                // and we've had at least 3 readings to confirm stability
                if (accuracy <= 10 && readingCount >= 3 && !done) {
                    done = true
                    navigator.geolocation.clearWatch(watchId)
                    clearTimeout(timer)
                }
            },
            (err) => {
                if (!done) {
                    done = true
                    clearTimeout(timer)
                    setGeoError(err.message)
                    setIsDetectingLocation(false)
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 0,
            }
        )

        return () => {
            done = true
            navigator.geolocation.clearWatch(watchId)
            clearTimeout(timer)
        }
    }, [geoRetryCount])

    // ---------------------------------------------------
    // 3.5️⃣ Continuous Monitoring (periodic refresh)
    // ---------------------------------------------------
    // When continuousMonitoring is enabled, periodically re-fetch location
    // to detect if the user has moved outside the geofence
    useEffect(() => {
        if (!continuousMonitoring) return

        const intervalId = setInterval(() => {
            // Trigger a fresh geolocation check
            setGeoRetryCount(c => c + 1)
        }, refreshIntervalMs)

        return () => clearInterval(intervalId)
    }, [continuousMonitoring, refreshIntervalMs])

    // ---------------------------------------------------
    // 4️⃣ Find Nearest Location
    // ---------------------------------------------------
    useEffect(() => {
        if (!userCoords || locations.length === 0) return

        let nearest: { location: AppLocation; distance: number } | null =
            null

        for (const loc of locations) {
            if (loc.latitude && loc.longitude) {
                const distance = calculateDistance(
                    userCoords.lat,
                    userCoords.lng,
                    loc.latitude,
                    loc.longitude
                )

                if (!nearest || distance < nearest.distance) {
                    nearest = { location: loc, distance }
                }
            }
        }

        if (nearest) {
            setNearestLocation(nearest)
        }
    }, [userCoords, locations, calculateDistance])

    // ---------------------------------------------------
    // 5️⃣ Distance to Selected Location
    // ---------------------------------------------------
    useEffect(() => {
        if (!userCoords || !selectedLocation) {
            setSelectedLocationDistance(null)
            return
        }

        const selectedLoc = locations.find(
            (l) => l.id === selectedLocation
        )

        if (selectedLoc?.latitude && selectedLoc?.longitude) {
            const distance = calculateDistance(
                userCoords.lat,
                userCoords.lng,
                selectedLoc.latitude,
                selectedLoc.longitude
            )

            setSelectedLocationDistance(distance)
        }
        console.log("Recalculated distance to selected location...")
    }, [
        userCoords,
        selectedLocation,
        locations,
        calculateDistance,
    ])

    return {
        userCoords,
        nearestLocation,
        selectedLocationDistance,
        calculateDistance,
        formatDistance,
        geoError,
        isDetectingLocation,
        retryGeolocation,
    }
}
