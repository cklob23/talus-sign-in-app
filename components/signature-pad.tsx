"use client"

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react"
import { Button } from "@/components/ui/button"
import { Eraser } from "lucide-react"

export interface SignaturePadHandle {
    /** PNG data URL, or null when nothing has been drawn. */
    toDataUrl: () => string | null
    clear: () => void
}

/**
 * Freehand signature capture on a canvas.
 *
 * Hand-rolled rather than pulling in react-signature-canvas, which is only
 * published as a pre-release. Pointer events cover mouse, touch and stylus with
 * one code path.
 *
 * The stroke is drawn in opaque near-black on a transparent background so the
 * exported PNG stamps cleanly onto a white PDF page regardless of the theme the
 * visitor is using.
 */
export function SignaturePad({
    ref,
    onChange,
    ariaLabel = "Signature",
}: {
    ref?: Ref<SignaturePadHandle>
    onChange?: (hasInk: boolean) => void
    ariaLabel?: string
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawingRef = useRef(false)
    const hasInkRef = useRef(false)
    const lastRef = useRef<{ x: number; y: number } | null>(null)
    const [hasInk, setHasInk] = useState(false)

    /** Sizes the backing store to the CSS box so strokes are not blurry. */
    const resize = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        // Preserve any existing drawing across a resize (e.g. orientation change).
        const previous = hasInkRef.current ? canvas.toDataURL("image/png") : null

        canvas.width = Math.max(1, Math.round(rect.width * dpr))
        canvas.height = Math.max(1, Math.round(rect.height * dpr))

        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.scale(dpr, dpr)
        ctx.lineWidth = 2.2
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        ctx.strokeStyle = "#111118"

        if (previous) {
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
            img.src = previous
        }
    }, [])

    useEffect(() => {
        resize()
        window.addEventListener("resize", resize)
        return () => window.removeEventListener("resize", resize)
    }, [resize])

    function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
        const rect = event.currentTarget.getBoundingClientRect()
        return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    function startStroke(event: React.PointerEvent<HTMLCanvasElement>) {
        event.currentTarget.setPointerCapture(event.pointerId)
        drawingRef.current = true
        lastRef.current = pointFrom(event)
    }

    function extendStroke(event: React.PointerEvent<HTMLCanvasElement>) {
        if (!drawingRef.current) return
        // Prevents the page scrolling while signing on a touch screen.
        event.preventDefault()

        const ctx = canvasRef.current?.getContext("2d")
        const last = lastRef.current
        if (!ctx || !last) return

        const point = pointFrom(event)
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(point.x, point.y)
        ctx.stroke()
        lastRef.current = point

        if (!hasInkRef.current) {
            hasInkRef.current = true
            setHasInk(true)
            onChange?.(true)
        }
    }

    function endStroke() {
        drawingRef.current = false
        lastRef.current = null
    }

    const clear = useCallback(() => {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext("2d")
        if (!canvas || !ctx) return
        // Reset the transform before clearing so the DPR scale does not leave a
        // strip of old ink at the edges.
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.restore()
        hasInkRef.current = false
        setHasInk(false)
        onChange?.(false)
    }, [onChange])

    useImperativeHandle(
        ref,
        () => ({
            toDataUrl: () => (hasInkRef.current ? (canvasRef.current?.toDataURL("image/png") ?? null) : null),
            clear,
        }),
        [clear],
    )

    return (
        <div className="flex flex-col gap-2">
            <div className="relative overflow-hidden rounded-lg border-2 border-dashed bg-card">
                <canvas
                    ref={canvasRef}
                    onPointerDown={startStroke}
                    onPointerMove={extendStroke}
                    onPointerUp={endStroke}
                    onPointerLeave={endStroke}
                    onPointerCancel={endStroke}
                    className="h-40 w-full touch-none bg-background"
                    aria-label={ariaLabel}
                    role="img"
                />
                {!hasInk ? (
                    <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                        Sign here with your finger or mouse
                    </p>
                ) : null}
            </div>
            <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk} className="gap-1.5">
                    <Eraser className="h-3.5 w-3.5" />
                    Clear
                </Button>
            </div>
        </div>
    )
}
