"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
    ArrowLeft,
    ArrowRight,
    Camera,
    Check,
    CheckCircle2,
    ChevronRight,
    Loader2,
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
    training_title: string | null
    training_video_url: string | null
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

type Step = "type" | "details" | "host" | "training" | "photo" | "done"

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
    const [step, setStep] = useState<Step>(visitorTypes.length > 0 ? "type" : "details")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<Result | null>(null)

    const selectedType = useMemo(() => visitorTypes.find((t) => t.id === typeId) ?? null, [visitorTypes, typeId])

    const reset = useCallback(() => {
        setTypeId(null)
        setDetails(emptyDetails)
        setHostId(null)
        setPhotoDataUrl(null)
        setTrainingDone(false)
        setError(null)
        setResult(null)
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
        list.push("photo")
        return list
    }, [visitorTypes.length, selectedType])

    function goNext() {
        setError(null)
        const index = steps.indexOf(step)
        const next = steps[index + 1]
        if (next) setStep(next)
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
                            goNext()
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
                                <Input
                                    id={id}
                                    value={details.company}
                                    onChange={(e) => setDetails((p) => ({ ...p, company: e.target.value }))}
                                    autoComplete="organization"
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
                            nextLabel="Continue"
                            nextType="submit"
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
