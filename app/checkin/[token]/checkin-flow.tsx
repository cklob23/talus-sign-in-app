"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { CompanyAutocomplete } from "@/components/company-autocomplete"
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad"
import { LocationGatePanel, useLocationGate, type CheckinGeofence } from "./location-gate"
import type { DeviceCoords } from "@/lib/checkin-geofence"
import { resolveFreshDeviceCoords } from "@/lib/fresh-device-coords"
import {
    IDLE_RESET_NOTICE,
    shouldIdleReset,
    type WatchProgress,
} from "@/lib/checkin-idle"
import { TrainingPlayer } from "@/components/training-player"
import { fill, visitorCopy, type VisitorLang } from "@/lib/visitor-i18n"
import { typeRequiresPhoto } from "@/lib/requires-photo"
import {
    ArrowLeft,
    ArrowRight,
    ArrowUpRight,
    Camera,
    Check,
    CheckCircle2,
    ChevronRight,
    FileText,
    Loader2,
    LogOut,
    Search,
    ShieldCheck,
    Trash2,
    UserRound,
} from "lucide-react"

/** How often the idle check runs. The limit itself lives in lib/checkin-idle. */
const IDLE_CHECK_INTERVAL_MS = 15_000

export interface CheckinVisitorType {
    id: string
    name: string
    badge_color: string | null
    requires_host: boolean
    requires_company: boolean
    requires_training: boolean
    requires_nda: boolean
    requires_photo?: boolean
    training_title: string | null
    training_video_url: string | null
}

/** What the server says about the NDA for this visitor type and person. */
interface NdaInfo {
    ndaDocumentId: string
    title: string
    version: number
    documentUrl: string
}

export interface CheckinHost {
    id: string
    name: string
    department: string | null
}

interface Details {
    firstName: string
    lastName: string
    email: string
    phone: string
    company: string
}

const emptyDetails: Details = { firstName: "", lastName: "", email: "", phone: "", company: "" }

type Step = "type" | "details" | "host" | "training" | "nda" | "photo" | "done"

interface Result {
    badgeNumber: string
    visitorName: string
    signInId: string
}

export function CheckinFlow({
    token,
    locationName,
    visitorTypes,
    hosts,
    geofence,
    ndaEnabled = false,
    lang = "en",
}: {
    token: string
    locationName: string
    visitorTypes: CheckinVisitorType[]
    hosts: CheckinHost[]
    /** Null when the site has no coordinates or the admin turned enforcement off. */
    geofence: CheckinGeofence | null
    /** Server-passed NDA_ENABLED. Off skips the NDA step and keeps training order. */
    ndaEnabled?: boolean
    lang?: VisitorLang
}) {
    const copy = visitorCopy(lang)
    // Runs as soon as the page opens so a visitor who is not on site finds out
    // before typing anything. The server re-checks the same coordinates.
    const gate = useLocationGate(geofence)
    const coords: DeviceCoords | null = gate.status.state === "verified" ? gate.status.coords : null

    const [typeId, setTypeId] = useState<string | null>(null)
    const [details, setDetails] = useState<Details>(emptyDetails)
    const [hostId, setHostId] = useState<string | null>(null)
    const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
    /** The video played through to the end (seeking ahead does not count). */
    const [videoEnded, setVideoEnded] = useState(false)
    /** The visitor ticked "I have watched and understood". Only possible after the video ends. */
    const [trainingAcknowledged, setTrainingAcknowledged] = useState(false)
    const [videoSeconds, setVideoSeconds] = useState<number | null>(null)
    /** Signed ticket from training-start; the server needs it to accept the sign-in. */
    const [trainingTicket, setTrainingTicket] = useState<{ typeId: string; ticket: string } | null>(null)
    const [startingTraining, setStartingTraining] = useState(false)
    const [skipKind, setSkipKind] = useState<"link" | "code" | null>(null)
    const [clearanceMessage, setClearanceMessage] = useState<string | null>(null)
    const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
    const [codeDigits, setCodeDigits] = useState("")
    const [codeProof, setCodeProof] = useState<string | null>(null)
    const [idleNotice, setIdleNotice] = useState<string | null>(null)
    const watchProgressRef = useRef<WatchProgress>({ maxWatched: 0 })
    const videoPlayingRef = useRef(false)
    const submittingRef = useRef(false)
    const lastActivityRef = useRef(Date.now())
    /** Null until the server has been asked; null also means "not required". */
    const [ndaInfo, setNdaInfo] = useState<NdaInfo | null>(null)
    const [ndaAgreed, setNdaAgreed] = useState(false)
    const [ndaHasInk, setNdaHasInk] = useState(false)
    /** Captured when leaving the NDA step, because the canvas unmounts with it. */
    const [ndaSignature, setNdaSignature] = useState<string | null>(null)
    const [checkingNda, setCheckingNda] = useState(false)
    const signatureRef = useRef<SignaturePadHandle>(null)
    const [step, setStep] = useState<Step>(visitorTypes.length > 0 ? "type" : "details")
    const [submitting, setSubmitting] = useState(false)
    const [checkingLocation, setCheckingLocation] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<Result | null>(null)
    /** Scanning the poster can mean either arriving or leaving. */
    const [mode, setMode] = useState<"signin" | "signout">("signin")
    /** Host already told this visitor started training, to avoid duplicate emails. */
    const trainingNotifiedRef = useRef<string | null>(null)
    const trainingIdempotencyKeyRef = useRef<string | null>(null)
    const signInIdempotencyKeyRef = useRef<string | null>(null)

    const selectedType = useMemo(() => visitorTypes.find((t) => t.id === typeId) ?? null, [visitorTypes, typeId])

    const reset = useCallback(() => {
        setTypeId(null)
        setDetails(emptyDetails)
        setHostId(null)
        setPhotoDataUrl(null)
        resetTrainingProgress()
        setTrainingTicket(null)
        setNdaInfo(null)
        setNdaAgreed(false)
        setNdaHasInk(false)
        setNdaSignature(null)
        setError(null)
        setResult(null)
        setMode("signin")
        // A new visitor session must be able to notify the same host again.
        trainingNotifiedRef.current = null
        trainingIdempotencyKeyRef.current = null
        signInIdempotencyKeyRef.current = null
        setStep(visitorTypes.length > 0 ? "type" : "details")
    }, [visitorTypes.length])

    function resetTrainingProgress() {
        setVideoEnded(false)
        setTrainingAcknowledged(false)
        setVideoSeconds(null)
        watchProgressRef.current = { maxWatched: 0 }
        videoPlayingRef.current = false
    }

    // Idle reset. Never fires while the training video is playing or a request
    // is in flight, and never on the success screen. When it does fire the
    // visitor is told why, instead of silently landing back on step 1.
    useEffect(() => {
        if (step === "done") return
        lastActivityRef.current = Date.now()
        const bump = () => {
            lastActivityRef.current = Date.now()
        }
        const events = ["pointerdown", "keydown", "focusin", "touchstart"] as const
        events.forEach((event) => window.addEventListener(event, bump, { passive: true }))
        const timer = window.setInterval(() => {
            if (
                shouldIdleReset({
                    now: Date.now(),
                    lastActivityAt: lastActivityRef.current,
                    mediaPlaying: videoPlayingRef.current,
                    busy: submittingRef.current,
                    done: false,
                })
            ) {
                reset()
                setIdleNotice(IDLE_RESET_NOTICE)
            }
        }, IDLE_CHECK_INTERVAL_MS)
        return () => {
            window.clearInterval(timer)
            events.forEach((event) => window.removeEventListener(event, bump))
        }
    }, [step, reset])

    /** Ordered steps for the current selection, used for the progress indicator. */
    const steps = useMemo(() => {
        const list: Step[] = []
        if (visitorTypes.length > 0) list.push("type")
        list.push("details")
        if (selectedType?.requires_host) list.push("host")
        if (selectedType?.requires_training && selectedType.training_video_url) list.push("training")
        // Only shown once the server has confirmed a signature is actually needed:
        // enforcement may be off, no NDA uploaded, or this person may have signed
        // the current version recently.
        if (ndaEnabled && ndaInfo) list.push("nda")
        if (typeRequiresPhoto(selectedType)) list.push("photo")
        return list
    }, [visitorTypes.length, selectedType, ndaInfo, ndaEnabled])

    /**
     * Runs when the visitor reaches the training video.
     *
     * Fetches the signed training ticket the server needs at sign-in, and tells
     * the host the visitor has started training (once per host, so going back
     * and forward through the step does not send a second email). A failure is
     * shown on the training step with a retry, never swallowed.
     */
    async function startTraining(opts: { forceNewTicket?: boolean } = {}) {
        if (!typeId) return
        const haveTicket = !opts.forceNewTicket && trainingTicket?.typeId === typeId
        const notifyHost = !!hostId && trainingNotifiedRef.current !== hostId
        if (haveTicket && !notifyHost) return
        if (notifyHost) trainingNotifiedRef.current = hostId
        if (!trainingIdempotencyKeyRef.current) {
            trainingIdempotencyKeyRef.current = crypto.randomUUID()
        }
        setStartingTraining(true)
        try {
            const res = await fetch(`/api/checkin/${token}/training-start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    hostId,
                    visitorTypeId: typeId,
                    firstName: details.firstName,
                    lastName: details.lastName,
                    company: details.company,
                    idempotencyKey: trainingIdempotencyKeyRef.current,
                    notifyHost,
                }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || typeof json.ticket !== "string") {
                if (notifyHost) trainingNotifiedRef.current = null
                throw new Error(json.error ?? "Could not start the training. Please try again.")
            }
            // Keep the earliest ticket for this type: it is the one that proves
            // how long the visitor has been on the training step.
            if (!haveTicket) setTrainingTicket({ typeId, ticket: json.ticket })
        } catch (err) {
            if (notifyHost) trainingNotifiedRef.current = null
            setError(
                err instanceof Error && err.message !== "Failed to fetch"
                    ? err.message
                    : "Could not start the training. Check your connection and try again.",
            )
        } finally {
            setStartingTraining(false)
        }
    }

    /**
     * Asks the server whether this visitor must sign, then advances.
     *
     * Runs when leaving the details step because the email entered there is what
     * identifies a returning visitor who signed the current NDA recently.
     */
    async function lookupClearance(): Promise<"link" | "code" | null> {
        if (!details.email || !typeId || !selectedType?.requires_training) {
            setSkipKind(null)
            return null
        }
        try {
            const res = await fetch("/api/kiosk/training-status", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-checkin-token": token },
                body: JSON.stringify({ email: details.email, visitor_type_id: typeId }),
            })
            if (!res.ok) return null
            const json = await res.json()
            if (json.skipKind === "link" || json.skipKind === "code") {
                setSkipKind(json.skipKind)
                setClearanceMessage(typeof json.message === "string" ? json.message : null)
                setMaskedEmail(typeof json.maskedEmail === "string" ? json.maskedEmail : null)
                if (json.skipKind === "code") {
                    void fetch("/api/kiosk/training-code", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-checkin-token": token },
                        body: JSON.stringify({ email: details.email, visitor_type_id: typeId }),
                    })
                }
                return json.skipKind
            }
            setSkipKind(null)
            return null
        } catch {
            setSkipKind(null)
            return null
        }
    }

    async function continueFromDetails() {
        setError(null)
        const kind = await lookupClearance()

        if (!ndaEnabled || !selectedType?.requires_nda) {
            setNdaInfo(null)
            advanceFrom("details", false, kind)
            return
        }

        setCheckingNda(true)
        try {
            const res = await fetch(`/api/checkin/${token}/nda`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ visitorTypeId: typeId, email: details.email }),
            })
            const json = await res.json()
            // A failed lookup must not strand the visitor: the server re-checks and
            // blocks the final submit if a signature is genuinely required.
            const info = res.ok && json.required ? (json as NdaInfo) : null
            setNdaInfo(info)
            advanceFrom("details", info !== null, kind)
            return
        } catch {
            setNdaInfo(null)
        } finally {
            setCheckingNda(false)
        }
        advanceFrom("details", false, kind)
    }

    /**
     * Advances from an explicit step rather than the `step` state.
     *
     * `steps` is recomputed from state that has only just been set, so this
     * rebuilds the ordering locally with the freshly resolved NDA requirement
     * instead of reading a stale memo.
     */
    function advanceFrom(from: Step, ndaRequired: boolean, kind: "link" | "code" | null = skipKind) {
        const list: Step[] = []
        if (visitorTypes.length > 0) list.push("type")
        list.push("details")
        if (selectedType?.requires_host) list.push("host")
        if (selectedType?.requires_training && selectedType.training_video_url) list.push("training")
        if (ndaEnabled && ndaRequired) list.push("nda")
        list.push("photo")
        const next = list[list.indexOf(from) + 1]
        if (next === "training" && kind !== "link" && kind !== "code") void startTraining()
        if (next) setStep(next)
    }

    function goNext() {
        setError(null)
        const index = steps.indexOf(step)
        const next = steps[index + 1]
        if (!next) return
        setStep(next)
        if (next === "training" && skipKind !== "link" && skipKind !== "code") void startTraining()
    }

    function goBack() {
        setError(null)
        const index = steps.indexOf(step)
        const previous = steps[index - 1]
        if (previous) setStep(previous)
    }

    const trainingInFlow = steps.includes("training")

    async function submit() {
        if (submittingRef.current) return
        submittingRef.current = true
        setSubmitting(true)
        setError(null)
        if (!signInIdempotencyKeyRef.current) {
            signInIdempotencyKeyRef.current = crypto.randomUUID()
        }
        try {
            let postCoords = coords
            if (geofence) {
                setCheckingLocation(true)
                const resolved = await resolveFreshDeviceCoords({ action: "signin", fallback: coords })
                setCheckingLocation(false)
                if (!resolved.ok) {
                    setError(copy.staleLocation)
                    return
                }
                postCoords = resolved.coords
            }
            const res = await fetch(`/api/checkin/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    firstName: details.firstName,
                    lastName: details.lastName,
                    email: details.email,
                    phone: details.phone,
                    company: details.company,
                    visitorTypeId: typeId,
                    hostId,
                    photoDataUrl,
                    ndaDocumentId: ndaInfo?.ndaDocumentId ?? null,
                    ndaSignatureDataUrl: ndaInfo ? ndaSignature : null,
                    coords: postCoords,
                    idempotencyKey: signInIdempotencyKeyRef.current,
                    training: trainingInFlow
                        ? {
                            ticket: trainingTicket?.typeId === typeId ? trainingTicket.ticket : null,
                            acknowledged: videoEnded && trainingAcknowledged,
                            videoSeconds,
                            via: skipKind,
                            codeToken: codeProof,
                            prior: skipKind === "link" || (skipKind === "code" && !!codeProof),
                        }
                        : undefined,
                }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                const code = typeof json.code === "string" ? json.code : ""
                if (code.startsWith("training_")) {
                    // Send the visitor back to the video with the reason, rather
                    // than leaving them on a step they cannot fix from.
                    if (code !== "training_not_acknowledged") {
                        resetTrainingProgress()
                        if (code !== "training_too_early") setTrainingTicket(null)
                    }
                    signInIdempotencyKeyRef.current = null
                    setStep("training")
                    setError(json.error ?? "Please complete the safety training.")
                    if (code === "training_ticket_expired" || code === "training_ticket_invalid" || code === "training_ticket_missing") {
                        // Host was already told about this visit; only a new ticket is needed.
                        trainingNotifiedRef.current = hostId
                        void startTraining({ forceNewTicket: true })
                    }
                    return
                }
                throw new Error(json.error ?? "Could not complete sign-in")
            }
            setResult({ badgeNumber: json.badgeNumber, visitorName: json.visitorName, signInId: json.signInId })
            setStep("done")
        } catch (err) {
            setError(
                err instanceof Error && err.message !== "Failed to fetch"
                    ? err.message
                    : "Could not reach the server. Check your connection and tap Sign in again.",
            )
        } finally {
            submittingRef.current = false
            setSubmitting(false)
            setCheckingLocation(false)
        }
    }

    // Nothing else renders until the device is confirmed on site.
    if (geofence && gate.status.state !== "verified") {
        return <LocationGatePanel status={gate.status} locationName={locationName} onRetry={gate.retry} />
    }

    if (step === "done" && result) {
        const hostName = hosts.find((host) => host.id === hostId)?.name || null
        return (
            <SuccessPanel
                result={result}
                locationName={locationName}
                onDone={reset}
                hostName={hostName}
                copy={copy}
            />
        )
    }

    if (mode === "signout") {
        return (
            <SignOutPanel
                token={token}
                locationName={locationName}
                coords={coords}
                requireCoords={!!geofence}
                staleMessage={copy.staleLocation}
                checkingLabel={copy.checkingLocation}
                retryLabel={copy.retry}
                onCancel={reset}
            />
        )
    }

    const stepIndex = steps.indexOf(step)

    return (
        <div className="flex flex-1 flex-col gap-5">
            <StepProgress total={steps.length} current={stepIndex} />

            {step === "type" ? (
                <StepPanel title={copy.whyHere} subtitle={copy.whyHereHelp}>
                    {idleNotice ? (
                        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                            {idleNotice}
                        </p>
                    ) : null}
                    <div className="flex flex-col gap-2">
                        {visitorTypes.map((type) => (
                            <button
                                key={type.id}
                                type="button"
                                onClick={() => {
                                    if (type.id !== typeId) {
                                        resetTrainingProgress()
                                        setTrainingTicket(null)
                                    }
                                    setIdleNotice(null)
                                    setTypeId(type.id)
                                    setHostId(null)
                                    setStep("details")
                                }}
                                className="flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent active:bg-accent"
                            >
                                <span className="flex items-center gap-3">
                                    <span
                                        aria-hidden="true"
                                        className="h-9 w-1.5 shrink-0 rounded-full"
                                        style={{ backgroundColor: type.badge_color ?? "var(--color-primary)" }}
                                    />
                                    <span>
                                        <span className="block font-medium">{type.name}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {[
                                                type.requires_host ? copy.host : null,
                                                type.requires_company ? copy.company : null,
                                                type.requires_training ? copy.safety : null,
                                            ]
                                                .filter(Boolean)
                                                .join(" • ") || "No extra steps"}
                                        </span>
                                    </span>
                                </span>
                                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                            </button>
                        ))}
                    </div>
                </StepPanel>
            ) : null}

            {step === "details" ? (
                <StepPanel title={copy.yourDetails} subtitle={locationName}>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault()
                            void continueFromDetails()
                        }}
                    >
                        <div className="grid grid-cols-2 gap-3">
                            <Field id="first-name" label={copy.firstName} required>
                                {(id) => (
                                    <Input
                                        id={id}
                                        value={details.firstName}
                                        onChange={(e) => setDetails((p) => ({ ...p, firstName: e.target.value }))}
                                        autoComplete="given-name"
                                        required
                                    />
                                )}
                            </Field>
                            <Field id="last-name" label={copy.lastName} required>
                                {(id) => (
                                    <Input
                                        id={id}
                                        value={details.lastName}
                                        onChange={(e) => setDetails((p) => ({ ...p, lastName: e.target.value }))}
                                        autoComplete="family-name"
                                        required
                                    />
                                )}
                            </Field>
                        </div>
                        <Field id="company" label={copy.company} required={selectedType?.requires_company ?? false}>
                            {(id) => (
                                <CompanyAutocomplete
                                    id={id}
                                    value={details.company}
                                    onChange={(company) => setDetails((p) => ({ ...p, company }))}
                                    required={selectedType?.requires_company ?? false}
                                />
                            )}
                        </Field>
                        <Field id="email" label={copy.email} hint={copy.emailHint}>
                            {(id) => (
                                <Input
                                    id={id}
                                    type="email"
                                    inputMode="email"
                                    aria-describedby="email-hint"
                                    value={details.email}
                                    onChange={(e) => setDetails((p) => ({ ...p, email: e.target.value }))}
                                    autoComplete="email"
                                />
                            )}
                        </Field>
                        <Field id="phone" label={copy.phone}>
                            {(id) => (
                                <Input
                                    id={id}
                                    type="tel"
                                    inputMode="tel"
                                    value={details.phone}
                                    onChange={(e) => setDetails((p) => ({ ...p, phone: e.target.value }))}
                                    autoComplete="tel"
                                />
                            )}
                        </Field>
                        <NavRow
                            onBack={stepIndex > 0 ? goBack : undefined}
                            nextLabel={checkingNda ? copy.continue : copy.continue}
                            nextType="submit"
                            nextDisabled={checkingNda}
                            nextIcon={checkingNda ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : undefined}
                            error={error}
                        />
                    </form>
                </StepPanel>
            ) : null}

            {step === "host" ? (
                <HostStep
                    hosts={hosts}
                    hostId={hostId}
                    onSelect={(id) => {
                        setHostId(id)
                        setError(null)
                    }}
                    onBack={goBack}
                    onNext={() => {
                        if (!hostId) {
                            setError(copy.hostRequired)
                            return
                        }
                        goNext()
                    }}
                    error={error}
                    copy={copy}
                />
            ) : null}

            {step === "training" && selectedType?.training_video_url ? (
                skipKind === "link" ? (
                    <StepPanel title="You are cleared" subtitle={clearanceMessage || "You did the safety video. You are cleared."}>
                        <p className="text-sm text-muted-foreground">
                            You watched the safety video from your training link. No video and no code today.
                        </p>
                        {hosts.find((host) => host.id === hostId)?.name ? (
                            <p className="text-sm text-[#00703f]">{fill(copy.hostTold, { host: hosts.find((host) => host.id === hostId)!.name })}</p>
                        ) : null}
                        <NavRow onBack={goBack} nextLabel={copy.continue} onNext={goNext} error={error} />
                    </StepPanel>
                ) : skipKind === "code" && !codeProof ? (
                    <StepPanel title="Type the 6 digit code" subtitle={`We sent a code to ${maskedEmail || details.email}. It lasts 30 minutes.`}>
                        <p className="text-sm text-muted-foreground">{clearanceMessage}</p>
                        <Input
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={codeDigits}
                            onChange={(event) => setCodeDigits(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
                        />
                        {error ? <p className="text-sm text-destructive">{error}</p> : null}
                        <div className="flex flex-col gap-2">
                            <Button
                                className="h-12 bg-[#00854c] hover:bg-[#00703f]"
                                disabled={codeDigits.length !== 6}
                                onClick={async () => {
                                    setError(null)
                                    const res = await fetch("/api/kiosk/training-code/verify", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json", "x-checkin-token": token },
                                        body: JSON.stringify({
                                            email: details.email,
                                            visitor_type_id: typeId,
                                            code: codeDigits,
                                        }),
                                    })
                                    const json = await res.json().catch(() => ({}))
                                    if (!res.ok || typeof json.proof !== "string") {
                                        setError(json.error || "That code is not right.")
                                        return
                                    }
                                    setCodeProof(json.proof)
                                    goNext()
                                }}
                            >
                                Continue
                            </Button>
                            <Button variant="outline" className="h-12" onClick={() => {
                                setSkipKind(null)
                                void startTraining()
                            }}>
                                Watch the video instead
                            </Button>
                        </div>
                    </StepPanel>
                ) : (
                <StepPanel
                    title={selectedType.training_title ?? "Safety training"}
                    subtitle="Please watch the full video before continuing."
                >
                    {trainingTicket?.typeId !== typeId ? (
                        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border bg-card p-4 text-center text-sm">
                            {startingTraining || !error ? (
                                <>
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                                    <span>Preparing your training...</span>
                                </>
                            ) : (
                                <Button type="button" variant="outline" onClick={() => void startTraining()}>
                                    Try again
                                </Button>
                            )}
                        </div>
                    ) : (
                    <TrainingPlayer
                        url={selectedType.training_video_url}
                        title={selectedType.training_title ?? "Safety training"}
                        onDuration={setVideoSeconds}
                        onPlayingChange={(playing) => {
                            videoPlayingRef.current = playing
                            lastActivityRef.current = Date.now()
                        }}
                        onEnded={(seconds) => {
                            videoPlayingRef.current = false
                            lastActivityRef.current = Date.now()
                            setVideoSeconds(seconds)
                            setVideoEnded(true)
                            setError(null)
                        }}
                    />
                    )}
                    {hosts.find((host) => host.id === hostId)?.name ? (
                        <p className="text-sm font-medium text-[#00703f]">
                            {fill(copy.hostTold, { host: hosts.find((host) => host.id === hostId)!.name })}
                        </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                        {videoEnded ? "Video complete." : copy.trainingHelp}
                    </p>
                    <label
                        className={`flex items-start gap-3 rounded-lg border bg-card p-3 text-sm ${videoEnded ? "" : "opacity-60"}`}
                    >
                        <input
                            type="checkbox"
                            checked={trainingAcknowledged}
                            disabled={!videoEnded}
                            onChange={(e) => setTrainingAcknowledged(videoEnded && e.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-primary"
                        />
                        <span>{copy.trainingAck}</span>
                    </label>
                    <NavRow
                        onBack={goBack}
                        nextLabel={startingTraining ? "Preparing..." : "Continue"}
                        nextDisabled={!videoEnded || !trainingAcknowledged || trainingTicket?.typeId !== typeId || startingTraining}
                        onNext={goNext}
                        error={error}
                    />
                </StepPanel>
                )
            ) : null}

            {step === "nda" && ndaInfo ? (
                <StepPanel title={ndaInfo.title} subtitle="Please read the agreement, then sign below to continue.">
                    <a
                        href={ndaInfo.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                    >
                        <span className="flex items-center gap-3">
                            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                            <span>
                                <span className="block text-sm font-medium">Read the agreement</span>
                                <span className="block text-xs text-muted-foreground">{`Version ${ndaInfo.version} • Opens the PDF`}</span>
                            </span>
                        </span>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </a>

                    <label className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm">
                        <input
                            type="checkbox"
                            checked={ndaAgreed}
                            onChange={(e) => setNdaAgreed(e.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span className="leading-relaxed">
                            I have read and agree to the terms of this non-disclosure agreement.
                        </span>
                    </label>

                    <SignaturePad ref={signatureRef} onChange={setNdaHasInk} ariaLabel="Your signature" />

                    <NavRow
                        onBack={goBack}
                        nextLabel="Continue"
                        nextDisabled={!ndaAgreed || !ndaHasInk}
                        onNext={() => {
                            const drawn = signatureRef.current?.toDataUrl() ?? null
                            if (!drawn) {
                                setError("Please sign in the box above.")
                                return
                            }
                            setNdaSignature(drawn)
                            goNext()
                        }}
                        error={error}
                    />
                </StepPanel>
            ) : null}

            {step === "photo" ? (
                <StepPanel
                    title={copy.photoTitle}
                    subtitle={typeRequiresPhoto(selectedType) ? copy.photoRequired : copy.photoOptional}
                >
                    <PhotoPicker value={photoDataUrl} onChange={setPhotoDataUrl} copy={copy} />
                    <NavRow
                        onBack={goBack}
                        nextLabel={
                            checkingLocation
                                ? copy.checkingLocation
                                : error === copy.staleLocation
                                    ? copy.retry
                                    : copy.completeSignIn
                        }
                        nextDisabled={submitting || checkingLocation || (typeRequiresPhoto(selectedType) && !photoDataUrl)}
                        nextIcon={submitting || checkingLocation ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : undefined}
                        onNext={() => void submit()}
                        error={error}
                    />
                </StepPanel>
            ) : null}

            {/* Visitors who are leaving scan the same poster, so surface sign-out on
          the entry step — whichever step that happens to be for this location. */}
            {stepIndex === 0 ? (
                <div className="mt-auto border-t pt-4 text-center">
                    <p className="text-sm text-muted-foreground">{copy.alreadyHere}</p>
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-2 min-h-12 w-full gap-2"
                        onClick={() => {
                            setError(null)
                            setMode("signout")
                        }}
                    >
                        <LogOut className="h-4 w-4" />
                        {fill(copy.signOutOf, { site: locationName })}
                    </Button>
                </div>
            ) : null}
        </div>
    )
}

function StepProgress({ total, current }: { total: number; current: number }) {
    return (
        <div className="flex items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current + 1} aria-label={`Step ${current + 1} of ${total}`}>
            {Array.from({ length: total }, (_, index) => (
                <span
                    key={index}
                    className={`h-1.5 flex-1 rounded-full ${index <= current ? "bg-primary" : "bg-border"}`}
                />
            ))}
        </div>
    )
}

function StepPanel({
    title,
    subtitle,
    children,
}: {
    title: string
    subtitle?: string
    children: React.ReactNode
}) {
    return (
        <section className="flex flex-col gap-4">
            <div className="space-y-1">
                <h1 className="text-xl font-semibold text-balance">{title}</h1>
                {subtitle ? <p className="text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
            </div>
            {children}
        </section>
    )
}

/**
 * Labelled form row. The control is supplied as a render function so the field
 * owns the id and the label/input association is always correct.
 */
function Field({
    id,
    label,
    hint,
    required,
    children,
}: {
    id: string
    label: string
    hint?: string
    required?: boolean
    children: (controlId: string) => React.ReactNode
}) {
    const hintId = hint ? `${id}-hint` : undefined
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>
                {label}
                {required ? <span className="ml-0.5 text-destructive">*</span> : null}
            </Label>
            {children(id)}
            {hint ? (
                <p id={hintId} className="text-xs text-muted-foreground">
                    {hint}
                </p>
            ) : null}
        </div>
    )
}

function NavRow({
    onBack,
    onNext,
    nextLabel,
    nextDisabled,
    nextType = "button",
    nextIcon,
    error,
}: {
    onBack?: () => void
    onNext?: () => void
    nextLabel: string
    nextDisabled?: boolean
    nextType?: "button" | "submit"
    nextIcon?: React.ReactNode
    error?: string | null
}) {
    return (
        <div className="space-y-3 pt-1">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex gap-3">
                {onBack ? (
                    <Button type="button" variant="outline" size="lg" onClick={onBack} className="min-h-12 min-w-12 shrink-0">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Back</span>
                    </Button>
                ) : null}
                <Button type={nextType} size="lg" className="min-h-12 flex-1" disabled={nextDisabled} onClick={onNext}>
                    {nextLabel}
                    {nextIcon ?? <ArrowRight className="ml-1.5 h-4 w-4" />}
                </Button>
            </div>
        </div>
    )
}

function HostStep({
    hosts,
    hostId,
    onSelect,
    onBack,
    onNext,
    error,
    copy,
}: {
    hosts: CheckinHost[]
    hostId: string | null
    onSelect: (id: string) => void
    onBack: () => void
    onNext: () => void
    error: string | null
    copy: ReturnType<typeof visitorCopy>
}) {
    const [query, setQuery] = useState("")
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return hosts
        return hosts.filter((h) => h.name.toLowerCase().includes(q))
    }, [hosts, query])

    return (
        <StepPanel title={copy.host} subtitle={copy.hostHint}>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={copy.hostSearch}
                    className="min-h-12 pl-9"
                    aria-label={copy.hostSearch}
                />
            </div>

            <div className="flex max-h-[45svh] flex-col gap-2 overflow-y-auto">
                {filtered.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{copy.noHosts}</p>
                ) : (
                    filtered.map((host) => {
                        const selected = host.id === hostId
                        return (
                            <button
                                key={host.id}
                                type="button"
                                onClick={() => onSelect(host.id)}
                                aria-pressed={selected}
                                className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/10" : "bg-card hover:bg-accent"}
                                    }`}
                            >
                                <span className="flex items-center gap-3">
                                    <UserRound className="h-5 w-5 shrink-0 text-muted-foreground" />
                                    <span>
                                        <span className="block font-medium">{host.name}</span>
                                    </span>
                                </span>
                                {selected ? <Check className="h-5 w-5 shrink-0 text-primary" /> : null}
                            </button>
                        )
                    })
                )}
            </div>

            <NavRow onBack={onBack} onNext={onNext} nextLabel={copy.continue} error={error} />
        </StepPanel>
    )
}

function PhotoPicker({ value, onChange, copy }: { value: string | null; onChange: (v: string | null) => void; copy: ReturnType<typeof visitorCopy> }) {
    const inputRef = useRef<HTMLInputElement>(null)

    function handleFile(file: File) {
        // A file input with `capture` is the most reliable camera path on iOS and
        // Android; getUserMedia is blocked in many in-app browsers.
        const reader = new FileReader()
        reader.onload = () => onChange(typeof reader.result === "string" ? reader.result : null)
        reader.readAsDataURL(file)
    }

    return (
        <div className="flex flex-col items-center gap-3">
            <Card className="w-full">
                <CardContent className="flex flex-col items-center gap-3 p-4">
                    {value ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
                        <img src={value} alt="Your photo" className="h-40 w-40 rounded-full object-cover" />
                    ) : (
                        <div className="flex h-40 w-40 items-center justify-center rounded-full border-2 border-dashed text-muted-foreground">
                            <Camera className="h-10 w-10" />
                        </div>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        capture="user"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleFile(file)
                            e.target.value = ""
                        }}
                    />
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" className="min-h-12" onClick={() => inputRef.current?.click()}>
                            <Camera className="mr-1.5 h-4 w-4" />
                            {value ? copy.takePhoto : copy.takePhoto}
                        </Button>
                        {value ? (
                            <Button type="button" variant="ghost" onClick={() => onChange(null)}>
                                <Trash2 className="mr-1.5 h-4 w-4" />
                                Remove
                            </Button>
                        ) : null}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function SuccessPanel({
    result,
    locationName,
    onDone,
    hostName,
    copy,
}: {
    result: Result
    locationName: string
    onDone: () => void
    hostName: string | null
    copy: ReturnType<typeof visitorCopy>
}) {
    return (
        <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <CheckCircle2 className="h-16 w-16 text-[#00854c]" aria-hidden="true" />
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-balance">{copy.signedInTitle}</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    {locationName}, {result.visitorName}.
                </p>
            </div>

            <Card className="w-full">
                <CardContent className="space-y-1 p-5">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{copy.badgeNumber}</p>
                    <p className="font-mono text-3xl font-bold">{result.badgeNumber}</p>
                </CardContent>
            </Card>

            <div className="flex items-start gap-2 rounded-lg border bg-card p-3 text-left text-sm leading-relaxed">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#00703f]" />
                <span>
                    {hostName ? fill(copy.hostTold, { host: hostName }) : copy.hostNotTold} {copy.rememberSignOut}
                </span>
            </div>

            <div className="flex w-full flex-col gap-2">
                <Button size="lg" className="min-h-12" asChild>
                    <a href={`/badge/${result.signInId}`}>{copy.collectBadge}</a>
                </Button>
                <Button size="lg" variant="ghost" className="min-h-12" onClick={onDone}>
                    {copy.done}
                </Button>
            </div>
        </section>
    )
}

/**
 * Sign-out flow for a visitor who scanned the poster on their way out.
 *
 * They identify themselves with a badge number or email; the server matches
 * only against visits still active at this location.
 */
function SignOutPanel({
    token,
    locationName,
    coords,
    requireCoords,
    staleMessage,
    checkingLabel,
    retryLabel,
    onCancel,
}: {
    token: string
    locationName: string
    coords: DeviceCoords | null
    requireCoords: boolean
    staleMessage: string
    checkingLabel: string
    retryLabel: string
    onCancel: () => void
}) {
    const [identifier, setIdentifier] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [checkingLocation, setCheckingLocation] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState<{ visitorName: string; badgeNumber: string | null } | null>(null)

    // "V12345" (or a legacy "V-1234") is a badge number; anything else is an email.
    const looksLikeBadge = /^v[\s-]*\d{4,5}$/i.test(identifier.trim())

    async function submit() {
        const value = identifier.trim()
        if (!value) {
            setError("Enter your badge number or email")
            return
        }
        setSubmitting(true)
        setError(null)
        try {
            let postCoords = coords
            if (requireCoords) {
                setCheckingLocation(true)
                const resolved = await resolveFreshDeviceCoords({ action: "signout", fallback: coords })
                setCheckingLocation(false)
                if (!resolved.ok) {
                    setError(staleMessage)
                    return
                }
                postCoords = resolved.coords
            }
            const res = await fetch(`/api/checkin/${token}/signout`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(looksLikeBadge ? { badgeNumber: value.replace(/\s+/g, "") } : { email: value }),
                    coords: postCoords,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Could not complete sign-out")
            setDone({ visitorName: json.visitorName, badgeNumber: json.badgeNumber })
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not complete sign-out")
        } finally {
            setSubmitting(false)
            setCheckingLocation(false)
        }
    }

    if (done) {
        return (
            <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
                <CheckCircle2 className="h-16 w-16 text-primary" aria-hidden="true" />
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-balance">You&apos;re signed out</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Thanks for visiting {locationName}, {done.visitorName}. Travel safely.
                    </p>
                </div>
                {done.badgeNumber ? (
                    <Card className="w-full">
                        <CardContent className="space-y-1 p-5">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Badge returned</p>
                            <p className="font-mono text-2xl font-bold">{done.badgeNumber}</p>
                        </CardContent>
                    </Card>
                ) : null}
                <Button size="lg" variant="outline" className="w-full" onClick={onCancel}>
                    Done
                </Button>
            </section>
        )
    }

    return (
        <StepPanel title="Sign out" subtitle={`Leaving ${locationName}. Enter your badge number or email.`}>
            <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                    event.preventDefault()
                    void submit()
                }}
            >
                <Field id="signout-id" label="Badge number or email" hint="For example V04821, or the email you signed in with.">
                    {(id) => (
                        <Input
                            id={id}
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            // Badge numbers are short and alphanumeric; email needs a normal keyboard.
                            inputMode={looksLikeBadge ? "text" : "email"}
                            autoCapitalize="characters"
                            autoComplete="off"
                            aria-describedby="signout-id-hint"
                            placeholder="V04821"
                        />
                    )}
                </Field>

                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}

                <div className="flex flex-col gap-2">
                    <Button type="submit" size="lg" disabled={submitting || checkingLocation} className="gap-2">
                        {submitting || checkingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                        {checkingLocation ? checkingLabel : error === staleMessage ? retryLabel : "Sign out"}
                    </Button>
                    <Button type="button" size="lg" variant="ghost" onClick={onCancel} disabled={submitting || checkingLocation}>
                        Cancel
                    </Button>
                </div>
            </form>
        </StepPanel>
    )
}
