"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { BrandedQrCode, useQrDownloads } from "@/components/branded-qr-code"
import { QrCode, Copy, Check, Printer, Download, RefreshCw, Loader2, Ban, Plus, AlertCircle } from "lucide-react"

interface LocationOption {
    id: string
    name: string
}

interface QrCodeRecord {
    id: string
    locationId: string
    token: string
    url: string
    createdAt: string
    svg: string
}

type PendingAction = { type: "regenerate" | "deactivate"; location: LocationOption } | null

export function QrCodeSettings({ locations }: { locations: LocationOption[] }) {
    const supabase = createClient()
    const [enabled, setEnabled] = useState(false)
    const [savingToggle, setSavingToggle] = useState(false)
    const [codes, setCodes] = useState<Record<string, QrCodeRecord>>({})
    const [loading, setLoading] = useState(true)
    const [busyLocationId, setBusyLocationId] = useState<string | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [pending, setPending] = useState<PendingAction>(null)
    const [error, setError] = useState<string | null>(null)

    const loadCodes = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/qr-codes")
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Could not load QR codes")
            const byLocation: Record<string, QrCodeRecord> = {}
            for (const code of json.codes as QrCodeRecord[]) byLocation[code.locationId] = code
            setCodes(byLocation)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load QR codes")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadCodes()
    }, [loadCodes])

    // The enable flag is global, so it lives on the settings row with no location.
    useEffect(() => {
        async function loadToggle() {
            const { data } = await supabase
                .from("settings")
                .select("value")
                .eq("key", "qr_checkin_enabled")
                .is("location_id", null)
                .maybeSingle()
            setEnabled(data?.value === true || data?.value === "true")
        }
        void loadToggle()
    }, [supabase])

    async function saveToggle(next: boolean) {
        setEnabled(next)
        setSavingToggle(true)
        const { data: existing } = await supabase
            .from("settings")
            .select("id")
            .eq("key", "qr_checkin_enabled")
            .is("location_id", null)
            .maybeSingle()

        if (existing) {
            await supabase.from("settings").update({ value: next }).eq("id", existing.id)
        } else {
            await supabase.from("settings").insert({ key: "qr_checkin_enabled", value: next, location_id: null })
        }
        setSavingToggle(false)
    }

    async function generate(location: LocationOption) {
        setBusyLocationId(location.id)
        setError(null)
        try {
            const res = await fetch("/api/admin/qr-codes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locationId: location.id }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Could not generate QR code")
            setCodes((prev) => ({ ...prev, [location.id]: json.code as QrCodeRecord }))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not generate QR code")
        } finally {
            setBusyLocationId(null)
        }
    }

    async function deactivate(location: LocationOption) {
        setBusyLocationId(location.id)
        setError(null)
        try {
            const res = await fetch("/api/admin/qr-codes", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locationId: location.id, action: "deactivate" }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error ?? "Could not deactivate QR code")
            setCodes((prev) => {
                const next = { ...prev }
                delete next[location.id]
                return next
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not deactivate QR code")
        } finally {
            setBusyLocationId(null)
        }
    }

    async function copyLink(code: QrCodeRecord) {
        await navigator.clipboard.writeText(code.url)
        setCopiedId(code.id)
        setTimeout(() => setCopiedId((current) => (current === code.id ? null : current)), 2000)
    }

    function confirmPending() {
        const action = pending
        setPending(null)
        if (!action) return
        if (action.type === "regenerate") void generate(action.location)
        else void deactivate(action.location)
    }

    return (
        <Card>
            <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <QrCode className="w-5 h-5" />
                    Visitor QR Check-In
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                    Give each location a QR code visitors scan to sign in from their own phone. Print the poster for your lobby.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-6">
                <div className="flex items-center justify-between gap-4 py-2">
                    <div className="space-y-0.5">
                        <Label htmlFor="qr_checkin_enabled">Enable QR check-in</Label>
                        <p className="text-xs text-muted-foreground">
                            When off, scanning a poster shows a notice instead of the sign-in form.
                        </p>
                    </div>
                    <Switch
                        id="qr_checkin_enabled"
                        checked={enabled}
                        disabled={savingToggle}
                        onCheckedChange={(checked) => void saveToggle(checked)}
                    />
                </div>

                {error ? (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                ) : null}

                <div className="space-y-3">
                    {loading ? (
                        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading QR codes...
                        </div>
                    ) : locations.length === 0 ? (
                        <p className="py-6 text-sm text-muted-foreground">Add a location before creating QR codes.</p>
                    ) : (
                        locations.map((location) => (
                            <LocationQrRow
                                key={location.id}
                                location={location}
                                code={codes[location.id]}
                                busy={busyLocationId === location.id}
                                copied={codes[location.id] ? copiedId === codes[location.id].id : false}
                                onGenerate={() => void generate(location)}
                                onRegenerate={() => setPending({ type: "regenerate", location })}
                                onDeactivate={() => setPending({ type: "deactivate", location })}
                                onCopy={() => void copyLink(codes[location.id])}
                            />
                        ))
                    )}
                </div>
            </CardContent>

            <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pending?.type === "regenerate" ? "Regenerate this QR code?" : "Deactivate this QR code?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pending?.type === "regenerate"
                                ? `The current code for ${pending?.location.name} will stop working immediately. Any posters already printed must be replaced.`
                                : `Visitors will no longer be able to check in by scanning the ${pending?.location.name} poster.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmPending}>
                            {pending?.type === "regenerate" ? "Regenerate" : "Deactivate"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}

function LocationQrRow({
    location,
    code,
    busy,
    copied,
    onGenerate,
    onRegenerate,
    onDeactivate,
    onCopy,
}: {
    location: LocationOption
    code?: QrCodeRecord
    busy: boolean
    copied: boolean
    onGenerate: () => void
    onRegenerate: () => void
    onDeactivate: () => void
    onCopy: () => void
}) {
    const slug = location.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const { downloadSvg, downloadPng } = useQrDownloads(code?.svg ?? "", `talus-checkin-${slug}`)

    return (
        <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
            {code ? (
                <BrandedQrCode svg={code.svg} className="mx-auto h-24 w-24 shrink-0 sm:mx-0 [&_svg]:h-full [&_svg]:w-full" />
            ) : (
                <div className="mx-auto flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground sm:mx-0">
                    <QrCode className="h-8 w-8" />
                </div>
            )}

            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{location.name}</span>
                    {code ? (
                        <Badge variant="secondary" className="gap-1">
                            <Check className="h-3 w-3" />
                            Active
                        </Badge>
                    ) : (
                        <Badge variant="outline">No code</Badge>
                    )}
                </div>

                {code ? (
                    <p className="truncate font-mono text-xs text-muted-foreground" title={code.url}>
                        {code.url}
                    </p>
                ) : (
                    <p className="text-xs text-muted-foreground">Generate a code to let visitors sign in from their phone.</p>
                )}

                <div className="flex flex-wrap gap-2">
                    {code ? (
                        <>
                            <Button size="sm" variant="outline" onClick={onCopy}>
                                {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                                {copied ? "Copied" : "Copy link"}
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                                <a href={`/qr-poster/${location.id}`} target="_blank" rel="noopener noreferrer">
                                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                                    Print poster
                                </a>
                            </Button>
                            <Button size="sm" variant="outline" onClick={downloadSvg}>
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                SVG
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void downloadPng()}>
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                PNG
                            </Button>
                            <Button size="sm" variant="outline" onClick={onRegenerate} disabled={busy}>
                                {busy ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Regenerate
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={onDeactivate} disabled={busy}>
                                <Ban className="mr-1.5 h-3.5 w-3.5" />
                                Deactivate
                            </Button>
                        </>
                    ) : (
                        <Button size="sm" onClick={onGenerate} disabled={busy}>
                            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                            Generate QR code
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
