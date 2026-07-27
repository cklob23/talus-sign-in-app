"use client"

import { useCallback, useMemo } from "react"

interface BrandedQrCodeProps {
    /**
     * Pre-rendered SVG markup from `buildQrSvg`. The SVG is built on the server so
     * the `qrcode` matrix generator never ships to the browser.
     */
    svg: string
    /** Base filename (without extension) used for downloads. */
    filename?: string
    className?: string
}

/**
 * Renders a server-generated QR SVG and exposes download helpers.
 *
 * The SVG is inlined rather than used as an <img src> so it scales without
 * resampling and prints at the printer's native resolution.
 */
export function useQrDownloads(svg: string, filename = "qr-code") {
    const downloadSvg = useCallback(() => {
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
        triggerDownload(URL.createObjectURL(blob), `${filename}.svg`)
    }, [svg, filename])

    const downloadPng = useCallback(
        async (pixels = 2048) => {
            // Rasterise at a deliberately high resolution so the PNG is still sharp
            // if someone drops it into a document and scales it up.
            const image = new Image()
            image.crossOrigin = "anonymous"
            const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }))
            try {
                await new Promise<void>((resolve, reject) => {
                    image.onload = () => resolve()
                    image.onerror = () => reject(new Error("Could not rasterise QR code"))
                    image.src = url
                })
                const canvas = document.createElement("canvas")
                canvas.width = pixels
                canvas.height = pixels
                const ctx = canvas.getContext("2d")
                if (!ctx) throw new Error("Canvas unavailable")
                ctx.imageSmoothingEnabled = false
                ctx.fillStyle = "#ffffff"
                ctx.fillRect(0, 0, pixels, pixels)
                ctx.drawImage(image, 0, 0, pixels, pixels)
                const dataUrl = canvas.toDataURL("image/png")
                triggerDownload(dataUrl, `${filename}.png`)
            } finally {
                URL.revokeObjectURL(url)
            }
        },
        [svg, filename],
    )

    return { downloadSvg, downloadPng }
}

function triggerDownload(href: string, filename: string) {
    const link = document.createElement("a")
    link.href = href
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    if (href.startsWith("blob:")) URL.revokeObjectURL(href)
}

export function BrandedQrCode({ svg, filename = "qr-code", className }: BrandedQrCodeProps) {
    // Memoised so React does not re-parse the markup on unrelated re-renders.
    const markup = useMemo(() => ({ __html: svg }), [svg])

    return (
        <div
            className={className}
            role="img"
            aria-label="Visitor check-in QR code"
            // The markup is generated server-side by our own builder from a fixed
            // template, never from user input, so there is nothing to sanitise.
            dangerouslySetInnerHTML={markup}
            data-filename={filename}
        />
    )
}
