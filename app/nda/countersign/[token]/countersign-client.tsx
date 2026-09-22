"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad"
import { AlertTriangle, CheckCircle2, ExternalLink, FileSignature, Loader2 } from "lucide-react"

interface CountersignContext {
    status: string
    visitorName: string
    visitorCompany: string | null
    locationName: string | null
    ndaTitle: string | null
    ndaVersion: number | null
    expired: boolean
    documentUrl: string | null
    signerName?: string | null
    signedAt?: string | null
}

type Phase = "loading" | "ready" | "unavailable" | "submitting" | "done"

/**
 * Public, token-gated screen where a Talus executive reviews the visitor-signed
 * NDA and countersigns it. No session — the URL token is the credential.
 */
export function CountersignClient({ token }: { token: string }) {
    const [phase, setPhase] = useState<Phase>("loading")
    const [context, setContext] = useState<CountersignContext | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)

    const [signerName, setSignerName] = useState("")
    const [signerTitle, setSignerTitle] = useState("")
    const [hasInk, setHasInk] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [sharepointUrl, setSharepointUrl] = useState<string | null>(null)

    const padRef = useRef<SignaturePadHandle>(null)

    useEffect(() => {
        let cancelled = false
            ; (async () => {
                try {
                    const res = await fetch(`/api/nda/countersign/${token}`)
                    const json = await res.json()
                    if (cancelled) return
                    if (!res.ok) {
                        setLoadError(json.error || "This link is not valid.")
                        setPhase("unavailable")
                        return
                    }
                    setContext(json)
                    if (json.status !== "pending" || json.expired) {
                        setPhase("unavailable")
                    } else {
                        setPhase("ready")
                    }
                } catch {
                    if (!cancelled) {
                        setLoadError("Could not load this countersigning request.")
                        setPhase("unavailable")
                    }
                }
            })()
        return () => {
            cancelled = true
        }
    }, [token])

    async function submit() {
        setSubmitError(null)
        if (!signerName.trim()) {
            setSubmitError("Please enter your name.")
            return
        }
        const signatureDataUrl = padRef.current?.toDataUrl() ?? null
        if (!signatureDataUrl) {
            setSubmitError("Please add your signature.")
            return
        }

        setPhase("submitting")
        try {
            const res = await fetch(`/api/nda/countersign/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signerName: signerName.trim(), signerTitle: signerTitle.trim(), signatureDataUrl }),
            })
            const json = await res.json()
            if (!res.ok) {
                setSubmitError(json.error || "Could not complete the countersignature.")
                setPhase("ready")
                return
            }
            setSharepointUrl(json.sharepointUrl ?? null)
            setPhase("done")
        } catch {
            setSubmitError("Could not complete the countersignature. Please try again.")
            setPhase("ready")
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
            <div className="w-full max-w-2xl">
                {phase === "loading" && (
                    <Card>
                        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </CardContent>
                    </Card>
                )}

                {phase === "unavailable" && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {context?.status === "signed" ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                ) : (
                                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                                )}
                                {context?.status === "signed"
                                    ? "Already countersigned"
                                    : context?.expired
                                        ? "Link expired"
                                        : "Link unavailable"}
                            </CardTitle>
                            <CardDescription>
                                {context?.status === "signed"
                                    ? `This NDA was countersigned${context.signerName ? ` by ${context.signerName}` : ""} and is fully executed. No further action is needed.`
                                    : loadError || "This countersigning link is no longer valid."}
                            </CardDescription>
                        </CardHeader>
                    </Card>
                )}

                {(phase === "ready" || phase === "submitting") && context && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileSignature className="h-5 w-5" />
                                Countersign {context.ndaTitle || "NDA"}
                            </CardTitle>
                            <CardDescription>
                                {context.visitorName}
                                {context.visitorCompany ? ` (${context.visitorCompany})` : ""} has signed
                                {context.ndaVersion ? ` version ${context.ndaVersion} of` : ""} this agreement
                                {context.locationName ? ` at ${context.locationName}` : ""}. Review the signed document, then countersign
                                below as the Talus representative.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-5">
                            {context.documentUrl && (
                                <a
                                    href={context.documentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm font-medium hover:bg-accent"
                                >
                                    <span className="flex items-center gap-2">
                                        <FileSignature className="h-4 w-4" />
                                        Review the visitor-signed NDA
                                    </span>
                                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                </a>
                            )}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="signer-name">Your name</Label>
                                    <Input
                                        id="signer-name"
                                        value={signerName}
                                        onChange={(e) => setSignerName(e.target.value)}
                                        placeholder="Full name"
                                        autoComplete="name"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="signer-title">Your title</Label>
                                    <Input
                                        id="signer-title"
                                        value={signerTitle}
                                        onChange={(e) => setSignerTitle(e.target.value)}
                                        placeholder="e.g. General Counsel"
                                        autoComplete="organization-title"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label>Signature</Label>
                                <SignaturePad ref={padRef} onChange={setHasInk} ariaLabel="Talus representative signature" />
                            </div>

                            {submitError && (
                                <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <p>{submitError}</p>
                                </div>
                            )}

                            <Button onClick={submit} disabled={phase === "submitting" || !signerName.trim() || !hasInk} size="lg">
                                {phase === "submitting" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Countersign &amp; finalize
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {phase === "done" && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                NDA fully executed
                            </CardTitle>
                            <CardDescription>
                                Thank you. The agreement is now countersigned and complete. A copy has been emailed to everyone involved.
                                {sharepointUrl ? " It has also been archived to SharePoint." : ""}
                            </CardDescription>
                        </CardHeader>
                        {sharepointUrl && (
                            <CardContent>
                                <a
                                    href={sharepointUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    View the archived document
                                </a>
                            </CardContent>
                        )}
                    </Card>
                )}
            </div>
        </main>
    )
}
