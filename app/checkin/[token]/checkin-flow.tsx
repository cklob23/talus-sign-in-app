"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { CompanyAutocomplete } from "@/components/company-autocomplete"
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad"
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

/** Reset the flow after this much inactivity so a shared phone never leaks PII. */
const INACTIVITY_MS = 10 * 60 * 1000

export interface CheckinVisitorType {
    id: string
    name: string
    badge_color: string | null
    requires_host: boolean
    requires_company: boolean
    requires_training: boolean
    requires_nda: boolean
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
}: {
    token: string
    locationName: string
    visitorTypes: CheckinVisitorType[]
    hosts: CheckinHost[]
}) {
    const [typeId, setTypeId] = useState<string | null>(null)
    const [details, setDetails] = useState<Details>(emptyDetails)
    const [hostId, setHostId] = useState<string | null>(null)
    const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
    const [trainingDone, setTrainingDone] = useState(false)
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
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<Result | null>(null)
    /** Scanning the poster can mean either arriving or leaving. */
    const [mode, setMode] = useState<"signin" | "signout">("signin")
    /** Host already told this visitor started training, to avoid duplicate emails. */
    const trainingNotifiedRef = useRef<string | null>(null)

    const selectedType = useMemo(() => visitorTypes.find((t) => t.id === typeId) ?? null, [visitorTypes, typeId])

    const reset = useCallback(() => {
        setTypeId(null)
        setDetails(emptyDetails)
        setHostId(null)
        setPhotoDataUrl(null)
        setTrainingDone(false)
        setNdaInfo(null)
        setNdaAgreed(false)
        setNdaHasInk(false)
        setNdaSignature(null)
        setError(null)
        setResult(null)
        setMode("signin")
        // A new visitor session must be able to notify the same host again.
        trainingNotifiedRef.current = null
        setStep(visitorTypes.length > 0 ? "type" : "details")
    }, [visitorTypes.length])

    // Idle reset. Skipped on the success screen so a visitor can read their badge
    // number without it disappearing mid-glance.
    useEffect(() => {
        if (step === "done") return
        let timer = window.setTimeout(reset, INACTIVITY_MS)
        const bump = () => {
            window.clearTimeout(timer)
            timer = window.setTimeout(reset, INACTIVITY_MS)
        }
        const events = ["pointerdown", "keydown", "focusin"] as const
        events.forEach((event) => window.addEventListener(event, bump))
        return () => {
            window.clearTimeout(timer)
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
        if (ndaInfo) list.push("nda")
        list.push("photo")
        return list
    }, [visitorTypes.length, selectedType, ndaInfo])

    /**
     * Tells the host the visitor has started training, matching the kiosk.
     *
     * Fire-and-forget and deduped per host: a failure here must not block the
     * visitor from starting training, and going back and forward through the
     * step must not send the host a second email.
     */
    function notifyTrainingStarted() {
        if (!hostId || trainingNotifiedRef.current === hostId) return
        // Marked synchronously so a double-tap cannot send twice.
        trainingNotifiedRef.current = hostId
        void fetch(`/api/checkin/${token}/notify-training`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                hostId,
                visitorTypeId: typeId,
                firstName: details.firstName,
                lastName: details.lastName,
                company: details.company,
            }),
        }).catch(() => {
            // Allow a retry if the request never reached the server.
            trainingNotifiedRef.current = null
        })
    }

    /**
     * Asks the server whether this visitor must sign, then advances.
     *
     * Runs when leaving the details step because the email entered there is what
     * identifies a returning visitor who signed the current NDA recently.
     */
    async function continueFromDetails() {
        setError(null)

        if (!selectedType?.requires_nda) {
            setNdaInfo(null)
            advanceFrom("details", false)
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
            advanceFrom("details", info !== null)
            return
        } catch {
            setNdaInfo(null)
        } finally {
            setCheckingNda(false)
        }
        advanceFrom("details", false)
    }

    /**
     * Advances from an explicit step rather than the `step` state.
     *
     * `steps` is recomputed from state that has only just been set, so this
     * rebuilds the ordering locally with the freshly resolved NDA requirement
     * instead of reading a stale memo.
     */
    function advanceFrom(from: Step, ndaRequired: boolean) {
        const list: Step[] = []
        if (visitorTypes.length > 0) list.push("type")
        list.push("details")
        if (selectedType?.requires_host) list.push("host")
        if (selectedType?.requires_training && selectedType.training_video_url) list.push("training")
        if (ndaRequired) list.push("nda")
        list.push("photo")
        const next = list[list.indexOf(from) + 1]
        if (next === "training") notifyTrainingStarted()
        if (next) setStep(next)
    }

    function goNext() {
        setError(null)
        const index = steps.indexOf(step)
        const next = steps[index + 1]
        if (!next) return
        if (next === "training") notifyTrainingStarted()
        setStep(next)
    }

    function goBack() {
        setError(null)
        const index = steps.indexOf(step)
        const previous = steps[index - 1]
        if (previous) setStep(previous)
    }

    async function submit() {
        setSubmitting(true)
        setError(null)
        try {
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
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Could not complete sign-in")
            setResult({ badgeNumber: json.badgeNumber, visitorName: json.visitorName, signInId: json.signInId })
            setStep("done")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not complete sign-in")
        } finally {
            setSubmitting(false)
        }
    }

    if (step === "done" && result) {
        return <SuccessPanel result={result} locationName={locationName} onDone={reset} />
    }

    if (mode === "signout") {
        return <SignOutPanel token={token} locationName={locationName} onCancel={reset} />
    }

    const stepIndex = steps.indexOf(step)

    return (
        <div className="flex flex-1 flex-col gap-5">
            <StepProgress total={steps.length} current={stepIndex} />

            {step === "type" ? (
                <StepPanel title="What brings you here?" subtitle="Choose the option that fits your visit.">
                    <div className="flex flex-col gap-2">
                        {visitorTypes.map((type) => (
                            <button
                                key={type.id}
                                type="button"
                                onClick={() => {
                                    setTypeId(type.id)
                                    setHostId(null)
                                    setTrainingDone(false)
                                    setStep("details")
                                }}
                                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent active:bg-accent"
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
                                                type.requires_host ? "Host required" : null,
                                                type.requires_company ? "Company required" : null,
                                                type.requires_training ? "Safety training" : null,
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
                <StepPanel title="Your details" subtitle={`Signing in at ${locationName}.`}>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault()
                            void continueFromDetails()
                        }}
                    >
                        <div className="grid grid-cols-2 gap-3">
                            <Field id="first-name" label="First name" required>
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
                            <Field id="last-name" label="Last name" required>
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
                        <Field id="company" label="Company" required={selectedType?.requires_company ?? false}>
                            {(id) => (
                                <CompanyAutocomplete
                                    id={id}
                                    value={details.company}
                                    onChange={(company) => setDetails((p) => ({ ...p, company }))}
                                    required={selectedType?.requires_company ?? false}
                                />
                            )}
                        </Field>
                        <Field id="email" label="Email" hint="So we can send you a copy of your visit record.">
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
                        <Field id="phone" label="Phone">
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
                            nextLabel={checkingNda ? "Checking..." : "Continue"}
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
                    onSelect={setHostId}
                    onBack={goBack}
                    onNext={() => {
                        if (!hostId) {
                            setError("Please choose who you are visiting.")
                            return
                        }
                        goNext()
                    }}
                    error={error}
                />
            ) : null}

            {step === "training" && selectedType?.training_video_url ? (
                <StepPanel
                    title={selectedType.training_title ?? "Safety training"}
                    subtitle="Please watch the full video before continuing."
                >
                    <div className="overflow-hidden rounded-lg border bg-black">
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions are baked into the source video */}
                        <video
                            src={selectedType.training_video_url}
                            controls
                            playsInline
                            className="aspect-video w-full"
                            onEnded={() => setTrainingDone(true)}
                        />
                    </div>
                    <label className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm">
                        <input
                            type="checkbox"
                            checked={trainingDone}
                            onChange={(e) => setTrainingDone(e.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-primary"
                        />
                        <span>I have watched and understood the safety training.</span>
                    </label>
                    <NavRow
                        onBack={goBack}
                        nextLabel="Continue"
                        nextDisabled={!trainingDone}
                        onNext={goNext}
                        error={error}
                    />
                </StepPanel>
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
                <StepPanel title="Add a photo" subtitle="Optional, but it helps your host recognise you.">
                    <PhotoPicker value={photoDataUrl} onChange={setPhotoDataUrl} />
                    <div className="rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
                        By signing in you confirm you will follow all site safety rules and sign out when you leave.
                    </div>
                    <NavRow
                        onBack={goBack}
                        nextLabel={submitting ? "Signing in..." : "Sign in"}
                        nextDisabled={submitting}
                        nextIcon={submitting ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : undefined}
                        onNext={() => void submit()}
                        error={error}
                    />
                </StepPanel>
            ) : null}

            {/* Visitors who are leaving scan the same poster, so surface sign-out on
          the entry step — whichever step that happens to be for this location. */}
            {stepIndex === 0 ? (
                <div className="mt-auto border-t pt-4 text-center">
                    <p className="text-sm text-muted-foreground">Already signed in and leaving?</p>
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-2 w-full gap-2"
                        onClick={() => {
                            setError(null)
                            setMode("signout")
                        }}
                    >
                        <LogOut className="h-4 w-4" />
                        {`Sign out of ${locationName}`}
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
                    <Button type="button" variant="outline" size="lg" onClick={onBack} className="shrink-0">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Back</span>
                    </Button>
                ) : null}
                <Button type={nextType} size="lg" className="flex-1" disabled={nextDisabled} onClick={onNext}>
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
}: {
    hosts: CheckinHost[]
    hostId: string | null
    onSelect: (id: string) => void
    onBack: () => void
    onNext: () => void
    error: string | null
}) {
    const [query, setQuery] = useState("")
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return hosts
        return hosts.filter((h) => h.name.toLowerCase().includes(q) || (h.department ?? "").toLowerCase().includes(q))
    }, [hosts, query])

    return (
        <StepPanel title="Who are you visiting?" subtitle="We will let them know you have arrived.">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or department"
                    className="pl-9"
                    aria-label="Search hosts"
                />
            </div>

            <div className="flex max-h-[45svh] flex-col gap-2 overflow-y-auto">
                {filtered.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No matching hosts.</p>
                ) : (
                    filtered.map((host) => {
                        const selected = host.id === hostId
                        return (
                            <button
                                key={host.id}
                                type="button"
                                onClick={() => onSelect(host.id)}
                                aria-pressed={selected}
                                className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/10" : "bg-card hover:bg-accent"
                                    }`}
                            >
                                <span className="flex items-center gap-3">
                                    <UserRound className="h-5 w-5 shrink-0 text-muted-foreground" />
                                    <span>
                                        <span className="block font-medium">{host.name}</span>
                                        {host.department ? (
                                            <span className="block text-xs text-muted-foreground">{host.department}</span>
                                        ) : null}
                                    </span>
                                </span>
                                {selected ? <Check className="h-5 w-5 shrink-0 text-primary" /> : null}
                            </button>
                        )
                    })
                )}
            </div>

            <NavRow onBack={onBack} onNext={onNext} nextLabel="Continue" error={error} />
        </StepPanel>
    )
}

function PhotoPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
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
                        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                            <Camera className="mr-1.5 h-4 w-4" />
                            {value ? "Retake" : "Take photo"}
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
}: {
    result: Result
    locationName: string
    onDone: () => void
}) {
    return (
        <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <CheckCircle2 className="h-16 w-16 text-primary" aria-hidden="true" />
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-balance">You&apos;re signed in</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Welcome to {locationName}, {result.visitorName}.
                </p>
            </div>

            <Card className="w-full">
                <CardContent className="space-y-1 p-5">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Your badge number</p>
                    <p className="font-mono text-3xl font-bold">{result.badgeNumber}</p>
                </CardContent>
            </Card>

            <div className="flex items-start gap-2 rounded-lg border bg-card p-3 text-left text-sm leading-relaxed">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Please remember to sign out when you leave the site.</span>
            </div>

            <div className="flex w-full flex-col gap-2">
                <Button size="lg" asChild>
                    <a href={`/badge/${result.signInId}`}>View my badge</a>
                </Button>
                <Button size="lg" variant="ghost" onClick={onDone}>
                    Sign in someone else
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
    onCancel,
}: {
    token: string
    locationName: string
    onCancel: () => void
}) {
    const [identifier, setIdentifier] = useState("")
    const [submitting, setSubmitting] = useState(false)
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
            const res = await fetch(`/api/checkin/${token}/signout`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    looksLikeBadge
                        ? { badgeNumber: value.replace(/\s+/g, "") }
                        : { email: value },
                ),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Could not complete sign-out")
            setDone({ visitorName: json.visitorName, badgeNumber: json.badgeNumber })
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not complete sign-out")
        } finally {
            setSubmitting(false)
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
                    <Button type="submit" size="lg" disabled={submitting} className="gap-2">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                        Sign out
                    </Button>
                    <Button type="button" size="lg" variant="ghost" onClick={onCancel} disabled={submitting}>
                        Cancel
                    </Button>
                </div>
            </form>
        </StepPanel>
    )
}
