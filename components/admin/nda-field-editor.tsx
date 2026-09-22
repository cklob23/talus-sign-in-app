"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, X } from "lucide-react"
import {
    NDA_FIELD_TYPES,
    ROLE_COLORS,
    type NdaFieldKind,
    type NdaFieldPosition,
    type NdaFieldRole,
} from "@/lib/nda-fields"
import type { NdaDocument } from "@/types/database"

interface PageSize {
    width: number
    height: number
}

function uid(): string {
    return Math.random().toString(36).slice(2, 10)
}

/**
 * Admin editor for placing signature/name/date fields directly on an NDA PDF.
 *
 * The PDF is rendered page-by-page with pdf.js onto canvases; draggable boxes
 * float over each page. Positions are stored as top-left fractions of the page
 * so they map cleanly onto pdf-lib's coordinates when a visitor or executive
 * signs, regardless of the on-screen render scale.
 */
export function NdaFieldEditor({
    document: ndaDoc,
    open,
    onOpenChange,
    onSaved,
}: {
    document: NdaDocument | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved: (positions: NdaFieldPosition[]) => void
}) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pageSizes, setPageSizes] = useState<PageSize[]>([])
    const [positions, setPositions] = useState<NdaFieldPosition[]>([])
    const [activePage, setActivePage] = useState(0)
    const [saving, setSaving] = useState(false)

    const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
    const pagesPanelRef = useRef<HTMLDivElement | null>(null)

    // (Re)load whenever the dialog opens for a document. Canvas refs must exist
    // before rendering, so we seed the page count first via a light metadata pass.
    useEffect(() => {
        if (!open || !ndaDoc) return
        setPositions(ndaDoc.field_positions ?? [])
        setActivePage(0)
        // Two-phase: first read numPages to mount the canvases, then render into them.
        let cancelled = false
            ; (async () => {
                setLoading(true)
                setError(null)
                try {
                    const res = await fetch(`/api/admin/nda/download?documentId=${ndaDoc.id}`)
                    const json = await res.json()
                    if (!res.ok || !json.url) throw new Error(json.error || "Could not open the document")
                    const pdfRes = await fetch(json.url)
                    if (!pdfRes.ok) throw new Error("Could not download the PDF for preview")
                    const data = new Uint8Array(await pdfRes.arrayBuffer())
                    const pdfjs = await import("pdfjs-dist")
                    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
                    const pdf = await pdfjs.getDocument({ data }).promise
                    if (cancelled) return
                    // Mount canvases for this page count.
                    // Render as wide as the pages panel allows (minus padding), so the
                    // document is legible while placing fields.
                    const panelWidth = pagesPanelRef.current?.clientWidth ?? 0
                    const targetWidth = Math.max(720, Math.min(1100, panelWidth - 48))
                    setPageSizes(Array.from({ length: pdf.numPages }, () => ({ width: targetWidth, height: targetWidth * 1.29 })))

                    const dpr = Math.min(window.devicePixelRatio || 1, 2)
                    const sizes: PageSize[] = []
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i)
                        const base = page.getViewport({ scale: 1 })
                        const scale = targetWidth / base.width
                        const viewport = page.getViewport({ scale })
                        sizes.push({ width: viewport.width, height: viewport.height })
                        // Wait a tick so the canvas for this page is in the DOM.
                        await new Promise((r) => requestAnimationFrame(r))
                        if (cancelled) return
                        const canvas = canvasRefs.current[i - 1]
                        if (canvas) {
                            const ctx = canvas.getContext("2d")
                            canvas.width = Math.floor(viewport.width * dpr)
                            canvas.height = Math.floor(viewport.height * dpr)
                            canvas.style.width = `${viewport.width}px`
                            canvas.style.height = `${viewport.height}px`
                            if (ctx) {
                                ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
                                await page.render({ canvasContext: ctx, viewport }).promise
                            }
                        }
                    }
                    if (!cancelled) setPageSizes(sizes)
                } catch (e) {
                    if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render the PDF")
                } finally {
                    if (!cancelled) setLoading(false)
                }
            })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, ndaDoc?.id])

    function addField(role: NdaFieldRole, kind: NdaFieldKind) {
        const def = NDA_FIELD_TYPES.find((t) => t.role === role && t.kind === kind)
        if (!def) return
        const page = Math.min(activePage, Math.max(0, pageSizes.length - 1))
        setPositions((prev) => [
            ...prev,
            {
                id: uid(),
                role,
                kind,
                page,
                xPct: 0.1,
                yPct: 0.1,
                wPct: def.defaultWPct,
                hPct: def.defaultHPct,
            },
        ])
    }

    function updateField(id: string, patch: Partial<NdaFieldPosition>) {
        setPositions((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
    }

    function removeField(id: string) {
        setPositions((prev) => prev.filter((f) => f.id !== id))
    }

    async function save() {
        if (!ndaDoc) return
        setSaving(true)
        setError(null)
        try {
            const res = await fetch("/api/admin/nda/fields", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentId: ndaDoc.id, positions }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || "Could not save")
            onSaved(json.positions ?? positions)
            onOpenChange(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save field positions")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[94vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw] xl:max-w-[1400px]">
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle>Place signature fields</DialogTitle>
                    <DialogDescription>
                        Drag a field onto the exact spot it should print. Visitor fields fill at check-in; Talus fields fill when an
                        executive countersigns.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-h-0 flex-1">
                    {/* Palette */}
                    <aside className="flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r p-3">
                        {(["visitor", "company"] as NdaFieldRole[]).map((role) => (
                            <div key={role} className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="inline-block h-3 w-3 rounded-sm"
                                        style={{ backgroundColor: ROLE_COLORS[role].border }}
                                    />
                                    <span className="text-sm font-semibold">{ROLE_COLORS[role].label} fields</span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    {NDA_FIELD_TYPES.filter((t) => t.role === role).map((t) => (
                                        <Button
                                            key={`${t.role}-${t.kind}`}
                                            variant="outline"
                                            size="sm"
                                            className="justify-start"
                                            onClick={() => addField(t.role, t.kind)}
                                            disabled={loading || pageSizes.length === 0}
                                        >
                                            <Plus className="mr-2 h-3.5 w-3.5" />
                                            {t.shortLabel}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div className="mt-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                            New fields drop onto page {Math.min(activePage, Math.max(0, pageSizes.length - 1)) + 1}. Click a page to
                            target it, then add a field.
                        </div>
                    </aside>

                    {/* Pages */}
                    <div ref={pagesPanelRef} className="min-h-0 flex-1 overflow-auto bg-muted/40 p-6">
                        {loading && (
                            <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Rendering the document…
                            </div>
                        )}
                        {error && !loading && (
                            <div className="mx-auto max-w-md rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                                {error}
                            </div>
                        )}
                        <div className="mx-auto flex w-max flex-col gap-6">
                            {pageSizes.map((size, pageIndex) => (
                                <div
                                    key={pageIndex}
                                    className="relative shadow-sm ring-1 ring-border"
                                    style={{ width: size.width, height: size.height, cursor: "pointer" }}
                                    onMouseDown={() => setActivePage(pageIndex)}
                                    role="presentation"
                                >
                                    <canvas
                                        ref={(el) => {
                                            canvasRefs.current[pageIndex] = el
                                        }}
                                        className="block bg-white"
                                    />
                                    {activePage === pageIndex && (
                                        <div className="pointer-events-none absolute right-2 top-2 rounded bg-foreground/80 px-2 py-0.5 text-[11px] font-medium text-background">
                                            Page {pageIndex + 1}
                                        </div>
                                    )}
                                    {positions
                                        .filter((f) => f.page === pageIndex)
                                        .map((f) => (
                                            <FieldBox
                                                key={f.id}
                                                field={f}
                                                pageWidth={size.width}
                                                pageHeight={size.height}
                                                onChange={(patch) => updateField(f.id, patch)}
                                                onRemove={() => removeField(f.id)}
                                            />
                                        ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter className="border-t px-6 py-4">
                    <div className="mr-auto text-sm text-muted-foreground">
                        {positions.length} field{positions.length === 1 ? "" : "s"} placed
                    </div>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={saving || loading}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save placement
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * A single draggable, resizable field box overlaid on a page. All geometry is
 * kept in the parent as percentages; this component converts pointer deltas
 * against the page box and clamps to stay on the page.
 */
function FieldBox({
    field,
    pageWidth,
    pageHeight,
    onChange,
    onRemove,
}: {
    field: NdaFieldPosition
    pageWidth: number
    pageHeight: number
    onChange: (patch: Partial<NdaFieldPosition>) => void
    onRemove: () => void
}) {
    const color = ROLE_COLORS[field.role]
    const def = NDA_FIELD_TYPES.find((t) => t.role === field.role && t.kind === field.kind)

    const drag = useRef<{ mode: "move" | "resize"; startX: number; startY: number; orig: NdaFieldPosition } | null>(null)

    const onPointerDown = (mode: "move" | "resize") => (e: React.PointerEvent) => {
        e.stopPropagation()
        e.preventDefault()
            ; (e.target as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...field } }
    }

    const onPointerMove = (e: React.PointerEvent) => {
        if (!drag.current) return
        const dxPct = (e.clientX - drag.current.startX) / pageWidth
        const dyPct = (e.clientY - drag.current.startY) / pageHeight
        const o = drag.current.orig
        if (drag.current.mode === "move") {
            onChange({
                xPct: clamp(o.xPct + dxPct, 0, 1 - o.wPct),
                yPct: clamp(o.yPct + dyPct, 0, 1 - o.hPct),
            })
        } else {
            onChange({
                wPct: clamp(o.wPct + dxPct, 0.03, 1 - o.xPct),
                hPct: clamp(o.hPct + dyPct, 0.012, 1 - o.yPct),
            })
        }
    }

    const onPointerUp = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).hasPointerCapture?.(e.pointerId)) {
            ; (e.target as HTMLElement).releasePointerCapture(e.pointerId)
        }
        drag.current = null
    }

    return (
        <div
            className="group absolute flex items-center justify-center rounded-sm text-[11px] font-medium"
            style={{
                left: `${field.xPct * 100}%`,
                top: `${field.yPct * 100}%`,
                width: `${field.wPct * 100}%`,
                height: `${field.hPct * 100}%`,
                border: `1.5px solid ${color.border}`,
                backgroundColor: color.bg,
                color: color.text,
                cursor: "move",
                touchAction: "none",
            }}
            onPointerDown={onPointerDown("move")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
        >
            <span className="pointer-events-none select-none truncate px-1">{def?.shortLabel ?? field.kind}</span>

            <button
                type="button"
                className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation()
                    onRemove()
                }}
                aria-label="Remove field"
            >
                <X className="h-2.5 w-2.5" />
            </button>

            <span
                className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-white"
                style={{ backgroundColor: color.border, touchAction: "none" }}
                onPointerDown={onPointerDown("resize")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            />
        </div>
    )
}

function clamp(n: number, min: number, max: number): number {
    return Math.min(Math.max(n, min), max)
}
