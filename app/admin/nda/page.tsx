"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    AlertTriangle,
    Download,
    FileSignature,
    FileText,
    Loader2,
    RefreshCw,
    Search,
    Upload,
} from "lucide-react"
import { logAudit } from "@/lib/audit-log"
import { formatDateTime } from "@/lib/timezone"
import { useTimezone } from "@/contexts/timezone-context"
import type { Location, NdaAcknowledgement, NdaDocument } from "@/types/database"

/** Turns a value into a CSV cell, quoting so commas and quotes cannot break columns. */
function csvCell(value: unknown): string {
    const text = value == null ? "" : String(value)
    return `"${text.replace(/"/g, '""')}"`
}

export default function NdaAdminPage() {
    const { timezone } = useTimezone()

    const [locations, setLocations] = useState<Location[]>([])
    const [documents, setDocuments] = useState<NdaDocument[]>([])
    const [records, setRecords] = useState<NdaAcknowledgement[]>([])

    const [ndaEnabled, setNdaEnabled] = useState(false)
    const [validityMonths, setValidityMonths] = useState("12")
    const [savingSettings, setSavingSettings] = useState(false)
    const [settingsNotice, setSettingsNotice] = useState<string | null>(null)

    const [uploadTitle, setUploadTitle] = useState("Non-Disclosure Agreement")
    const [uploadScope, setUploadScope] = useState("all")
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [filterLocation, setFilterLocation] = useState("all")
    const [search, setSearch] = useState("")
    const [fromDate, setFromDate] = useState("")
    const [toDate, setToDate] = useState("")

    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const loadSettingsAndDocuments = useCallback(async () => {
        const supabase = createClient()
        const [{ data: locs }, { data: settingRows }, docsRes] = await Promise.all([
            supabase.from("locations").select("*").order("name"),
            supabase.from("settings").select("key, value").in("key", ["nda_enabled", "nda_validity_months"]).is("location_id", null),
            fetch("/api/admin/nda"),
        ])

        setLocations((locs as Location[]) ?? [])

        for (const row of settingRows ?? []) {
            if (row.key === "nda_enabled") setNdaEnabled(row.value === true)
            if (row.key === "nda_validity_months") setValidityMonths(String(row.value ?? 12))
        }

        const docsJson = await docsRes.json()
        if (docsRes.ok) setDocuments(docsJson.documents ?? [])
        else setError(docsJson.error || "Could not load NDA versions")
    }, [])

    const loadRecords = useCallback(async () => {
        const params = new URLSearchParams()
        if (filterLocation !== "all") params.set("locationId", filterLocation)
        if (search.trim()) params.set("search", search.trim())
        if (fromDate) params.set("from", fromDate)
        if (toDate) params.set("to", toDate)

        const res = await fetch(`/api/admin/nda/acknowledgements?${params.toString()}`)
        const json = await res.json()
        if (res.ok) setRecords(json.acknowledgements ?? [])
        else setError(json.error || "Could not load signed NDAs")
    }, [filterLocation, search, fromDate, toDate])

    useEffect(() => {
        ; (async () => {
            setIsLoading(true)
            await Promise.all([loadSettingsAndDocuments(), loadRecords()])
            setIsLoading(false)
        })()
        // Records reload separately when filters change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadSettingsAndDocuments])

    // Debounce so typing in the search box does not fire a request per keystroke.
    useEffect(() => {
        const id = setTimeout(() => {
            loadRecords()
        }, 300)
        return () => clearTimeout(id)
    }, [loadRecords])

    async function saveSettings() {
        setSavingSettings(true)
        setSettingsNotice(null)
        const supabase = createClient()

        const months = Number(validityMonths)
        const entries: { key: string; value: boolean | number }[] = [
            { key: "nda_enabled", value: ndaEnabled },
            { key: "nda_validity_months", value: Number.isFinite(months) && months >= 0 ? months : 12 },
        ]

        for (const entry of entries) {
            const { data: existing } = await supabase
                .from("settings")
                .select("id")
                .eq("key", entry.key)
                .is("location_id", null)
                .maybeSingle()

            if (existing) {
                await supabase.from("settings").update({ value: entry.value }).eq("key", entry.key).is("location_id", null)
            } else {
                await supabase.from("settings").insert({ key: entry.key, value: entry.value, location_id: null })
            }
        }

        await logAudit({
            action: "settings.updated",
            entityType: "settings",
            description: `NDA enforcement ${ndaEnabled ? "enabled" : "disabled"}`,
            metadata: { nda_enabled: ndaEnabled, nda_validity_months: entries[1].value },
        })

        setSavingSettings(false)
        setSettingsNotice("NDA settings saved.")
        setTimeout(() => setSettingsNotice(null), 3000)
    }

    async function handleUpload() {
        if (!uploadFile) return
        setUploading(true)
        setError(null)

        const body = new FormData()
        body.set("file", uploadFile)
        body.set("title", uploadTitle)
        body.set("locationId", uploadScope)

        const res = await fetch("/api/admin/nda", { method: "POST", body })
        const json = await res.json()

        if (!res.ok) {
            setError(json.error || "Upload failed")
        } else {
            setUploadFile(null)
            if (fileInputRef.current) fileInputRef.current.value = ""
            await loadSettingsAndDocuments()
        }
        setUploading(false)
    }

    /** Opens a stored PDF through a short-lived signed URL. */
    async function openDocument(query: string) {
        setError(null)
        const res = await fetch(`/api/admin/nda/download?${query}`)
        const json = await res.json()
        if (!res.ok || !json.url) {
            setError(json.error || "Could not open the document")
            return
        }
        window.open(json.url, "_blank", "noopener,noreferrer")
    }

    function exportCsv() {
        const header = ["Visitor", "Company", "Email", "Visitor Type", "Host", "Location", "NDA Version", "Signed At", "Expires At"]
        const rows = records.map((r) =>
            [
                r.visitor_name,
                r.visitor_company,
                r.visitor_email,
                r.visitor_type_name,
                r.host_name,
                r.locations?.name,
                r.nda_documents ? `v${r.nda_documents.version}` : "",
                r.signed_at ? formatDateTime(r.signed_at, timezone) : "",
                r.expires_at ? formatDateTime(r.expires_at, timezone) : "Does not expire",
            ]
                .map(csvCell)
                .join(","),
        )

        const blob = new Blob([[header.map(csvCell).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `signed-ndas-${new Date().toISOString().slice(0, 10)}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    const currentGlobal = documents.find((d) => d.is_current && d.location_id === null)

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">NDA Agreements</h1>
                <p className="text-sm text-muted-foreground">
                    Upload the agreement visitors sign at check-in and review every signed record.
                </p>
            </div>

            {error && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}

            {/* Enforcement */}
            <Card>
                <CardHeader>
                    <CardTitle>Enforcement</CardTitle>
                    <CardDescription>
                        Visitors are only asked to sign when this is on, their visitor type requires an NDA, and a current
                        document exists.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <Label htmlFor="nda-enabled">Require NDA signatures</Label>
                            <p className="text-xs text-muted-foreground">Applies to the kiosk and QR check-in flows</p>
                        </div>
                        <Switch id="nda-enabled" checked={ndaEnabled} onCheckedChange={setNdaEnabled} />
                    </div>

                    {ndaEnabled && !currentGlobal && (
                        <div className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <p className="text-sm text-amber-700 dark:text-amber-500">
                                Enforcement is on but no company-wide NDA has been uploaded. Visitors will not be asked to sign until
                                you upload one below.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="validity">Signature valid for (months)</Label>
                        <Input
                            id="validity"
                            type="number"
                            min={0}
                            max={120}
                            value={validityMonths}
                            onChange={(e) => setValidityMonths(e.target.value)}
                            className="max-w-40"
                        />
                        <p className="text-xs text-muted-foreground">
                            Returning visitors re-sign once this lapses. Use 0 to require a signature on every visit. Uploading a new
                            version always requires everyone to re-sign.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button onClick={saveSettings} disabled={savingSettings}>
                            {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save settings
                        </Button>
                        {settingsNotice && <p className="text-sm text-muted-foreground">{settingsNotice}</p>}
                    </div>
                </CardContent>
            </Card>

            {/* Upload */}
            <Card>
                <CardHeader>
                    <CardTitle>Upload a new version</CardTitle>
                    <CardDescription>
                        Each upload is stored as a new version. Earlier versions are kept so existing signatures stay tied to the
                        exact text that was signed.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="nda-title">Title</Label>
                            <Input id="nda-title" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="nda-scope">Applies to</Label>
                            <Select value={uploadScope} onValueChange={setUploadScope}>
                                <SelectTrigger id="nda-scope">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All locations (company-wide)</SelectItem>
                                    {locations.map((loc) => (
                                        <SelectItem key={loc.id} value={loc.id}>
                                            {loc.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="nda-file">PDF file</Label>
                        <Input
                            id="nda-file"
                            ref={fileInputRef}
                            type="file"
                            accept="application/pdf"
                            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                        />
                        <p className="text-xs text-muted-foreground">PDF only, up to 10MB.</p>
                    </div>

                    <Button onClick={handleUpload} disabled={!uploadFile || uploading} className="self-start">
                        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Upload NDA
                    </Button>
                </CardContent>
            </Card>

            {/* Versions */}
            <Card>
                <CardHeader>
                    <CardTitle>Versions</CardTitle>
                    <CardDescription>{`${documents.length} version${documents.length === 1 ? "" : "s"} on file`}</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">No NDA uploaded yet.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Title</TableHead>
                                        <TableHead>Version</TableHead>
                                        <TableHead>Applies to</TableHead>
                                        <TableHead>Uploaded</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Document</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {documents.map((doc) => (
                                        <TableRow key={doc.id}>
                                            <TableCell className="font-medium">{doc.title}</TableCell>
                                            <TableCell>{`v${doc.version}`}</TableCell>
                                            <TableCell>{doc.locations?.name ?? "All locations"}</TableCell>
                                            <TableCell>{formatDateTime(doc.created_at, timezone)}</TableCell>
                                            <TableCell>
                                                {doc.is_current ? (
                                                    <Badge>Current</Badge>
                                                ) : (
                                                    <Badge variant="secondary">Superseded</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" onClick={() => openDocument(`documentId=${doc.id}`)}>
                                                    <Download className="mr-2 h-4 w-4" />
                                                    View
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Signed records */}
            <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
                    <div>
                        <CardTitle>Signed NDAs</CardTitle>
                        <CardDescription>{`${records.length} record${records.length === 1 ? "" : "s"}`}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => loadRecords()}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportCsv} disabled={records.length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            Export CSV
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Name or company"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                                aria-label="Search signed NDAs"
                            />
                        </div>
                        <Select value={filterLocation} onValueChange={setFilterLocation}>
                            <SelectTrigger aria-label="Filter by location">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All locations</SelectItem>
                                {locations.map((loc) => (
                                    <SelectItem key={loc.id} value={loc.id}>
                                        {loc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="Signed from" />
                        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="Signed until" />
                    </div>

                    {records.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center">
                            <FileSignature className="h-8 w-8 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">No signed NDAs match these filters.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Visitor</TableHead>
                                        <TableHead>Company</TableHead>
                                        <TableHead>Visitor type</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Version</TableHead>
                                        <TableHead>Signed</TableHead>
                                        <TableHead>Expires</TableHead>
                                        <TableHead className="text-right">Signed PDF</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {records.map((rec) => {
                                        const expired = rec.expires_at ? new Date(rec.expires_at) < new Date() : false
                                        return (
                                            <TableRow key={rec.id}>
                                                <TableCell>
                                                    <span className="font-medium">{rec.visitor_name}</span>
                                                    {rec.visitor_email && (
                                                        <span className="block text-xs text-muted-foreground">{rec.visitor_email}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>{rec.visitor_company || "—"}</TableCell>
                                                <TableCell>{rec.visitor_type_name || "—"}</TableCell>
                                                <TableCell>{rec.locations?.name || "—"}</TableCell>
                                                <TableCell>{rec.nda_documents ? `v${rec.nda_documents.version}` : "—"}</TableCell>
                                                <TableCell>{formatDateTime(rec.signed_at, timezone)}</TableCell>
                                                <TableCell>
                                                    {rec.expires_at ? (
                                                        <span className={expired ? "text-destructive" : undefined}>
                                                            {formatDateTime(rec.expires_at, timezone)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">Does not expire</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {rec.signed_pdf_storage_path ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => openDocument(`acknowledgementId=${rec.id}`)}
                                                        >
                                                            <Download className="mr-2 h-4 w-4" />
                                                            View
                                                        </Button>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">Unavailable</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
