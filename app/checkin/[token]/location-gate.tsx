"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, MapPin, MapPinOff, Navigation, RefreshCw } from "lucide-react"
import {
    evaluateGeofence,
    formatMeters,
    type DeviceCoords,
    type GeofenceVerdict,
} from "@/lib/checkin-geofence"

/** Coordinates and radius the page passes down for the client-side pre-check. */
export interface CheckinGeofence {
    latitude: number
    longitude: number
    auto_signin_radius_meters: number | null
}

export type GateStatus =
    | { state: "checking" }
    | { state: "unsupported" }
    | { state: "denied" }
    | { state: "error"; message: string }
    | { state: "verified"; coords: DeviceCoords; verdict: Extract<GeofenceVerdict, { ok: true }> }
    | { state: "rejected"; coords: DeviceCoords; verdict: Extract<GeofenceVerdict, { ok: false }> }

/** How long to keep refining the fix before deciding with what we have. */
const SETTLE_MS = 12_000
/** Stop early once the fix is this good and we've seen a few readings. */
const GOOD_ENOUGH_METERS = 25

/**
 * Watches the device position and evaluates it against the site's fence.
 *
 * The first reading from a phone is usually a coarse Wi-Fi fix that sharpens
 * over a few seconds, so we keep the best reading for up to SETTLE_MS. If the
 * device is clearly inside the fence we resolve immediately; if it is outside
 * we wait for the fix to settle before saying so, to avoid false rejections.
 */
export function useLocationGate(geofence: CheckinGeofence | null) {
    const [status, setStatus] = useState<GateStatus>(() => (geofence ? { state: "checking" } : { state: "unsupported" }))
    const [attempt, setAttempt] = useState(0)

    const retry = useCallback(() => {
        setStatus({ state: "checking" })
        setAttempt((n) => n + 1)
    }, [])

    useEffect(() => {
        if (!geofence) return
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setStatus({ state: "unsupported" })
            return
        }

        let best: DeviceCoords | null = null
        let readings = 0
        let finished = false
        let watchId: number | null = null

        const finish = (result: GateStatus) => {
            if (finished) return
            finished = true
            if (watchId !== null) navigator.geolocation.clearWatch(watchId)
            window.clearTimeout(timer)
            setStatus(result)
        }

        const decide = () => {
            if (!best) {
                finish({ state: "error", message: "We could not determine your location." })
                return
            }
            const verdict = evaluateGeofence(geofence, best)
            if (verdict.ok) finish({ state: "verified", coords: best, verdict })
            else finish({ state: "rejected", coords: best, verdict })
        }

        const timer = window.setTimeout(decide, SETTLE_MS)

        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords
                readings += 1
                if (!best || accuracy < best.accuracy) {
                    best = { lat: latitude, lng: longitude, accuracy }
                }
                const verdict = evaluateGeofence(geofence, best)
                // Inside the fence: no reason to make the visitor wait.
                if (verdict.ok) {
                    finish({ state: "verified", coords: best, verdict })
                    return
                }
                // Outside but with a sharp, stable fix: the answer will not change.
                if (best.accuracy <= GOOD_ENOUGH_METERS && readings >= 3) decide()
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) finish({ state: "denied" })
                else if (err.code === err.POSITION_UNAVAILABLE) finish({ state: "error", message: "Your location is currently unavailable." })
                else finish({ state: "error", message: "Finding your location took too long." })
            },
            { enableHighAccuracy: true, timeout: SETTLE_MS, maximumAge: 0 },
        )

        return () => {
            finished = true
            if (watchId !== null) navigator.geolocation.clearWatch(watchId)
            window.clearTimeout(timer)
        }
        // `attempt` re-runs the effect when the visitor taps "Try again".
    }, [geofence, attempt])

    return { status, retry }
}

/**
 * Full-panel state shown while the fence is being checked or has failed.
 * Rendered in place of the sign-in form so nobody fills it in for nothing.
 */
export function LocationGatePanel({
    status,
    locationName,
    onRetry,
}: {
    status: Exclude<GateStatus, { state: "verified" }>
    locationName: string
    onRetry: () => void
}) {
    if (status.state === "checking") {
        return (
            <GateFrame
                icon={<Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />}
                title="Confirming you're on site"
                body={`Checking that you are at ${locationName}. This usually takes a few seconds.`}
            />
        )
    }

    if (status.state === "denied") {
        return (
            <GateFrame
                icon={<MapPinOff className="h-10 w-10 text-destructive" aria-hidden="true" />}
                title="Location access needed"
                body={`To sign in at ${locationName} we need to confirm you are here. Allow location access for this site in your browser settings, then try again.`}
                action={<RetryButton onClick={onRetry} />}
            />
        )
    }

    if (status.state === "unsupported") {
        return (
            <GateFrame
                icon={<MapPinOff className="h-10 w-10 text-destructive" aria-hidden="true" />}
                title="Location not available"
                body="Your browser cannot share your location. Please ask reception to sign you in."
            />
        )
    }

    if (status.state === "error") {
        return (
            <GateFrame
                icon={<Navigation className="h-10 w-10 text-muted-foreground" aria-hidden="true" />}
                title="Couldn't find your location"
                body={`${status.message} Move outdoors or near a window and try again.`}
                action={<RetryButton onClick={onRetry} />}
            />
        )
    }

    // Rejected: outside the fence or unusably inaccurate.
    const { verdict } = status
    const body =
        verdict.reason === "poor_accuracy"
            ? `We could not get an accurate enough fix on your location to confirm you are at ${locationName}. Move outdoors or near a window and try again.`
            : verdict.distance !== null
                ? `You appear to be about ${formatMeters(verdict.distance)} from ${locationName}. You need to be on site to sign in. If you are here, try again once your phone has a better signal, or ask reception.`
                : `You need to be at ${locationName} to sign in.`

    return (
        <GateFrame
            icon={<MapPin className="h-10 w-10 text-destructive" aria-hidden="true" />}
            title="You're not at this site"
            body={body}
            action={<RetryButton onClick={onRetry} />}
        />
    )
}

function GateFrame({
    icon,
    title,
    body,
    action,
}: {
    icon: React.ReactNode
    title: string
    body: string
    action?: React.ReactNode
}) {
    return (
        <section
            className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
            role="status"
            aria-live="polite"
        >
            {icon}
            <div className="space-y-2">
                <h1 className="text-xl font-semibold text-balance">{title}</h1>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">{body}</p>
            </div>
            {action}
        </section>
    )
}

function RetryButton({ onClick }: { onClick: () => void }) {
    return (
        <Button size="lg" variant="outline" onClick={onClick} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
        </Button>
    )
}
