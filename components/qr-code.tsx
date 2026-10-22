"use client"

import { useMemo } from "react"
import { buildQrSvg } from "@/lib/qr-code"

interface QRCodeProps {
    value: string
    size?: number
    className?: string
}

/**
 * QR code rendered locally as inline SVG.
 *
 * This used to be an <img> pointing at api.qrserver.com. On the kiosk that
 * third-party request can be blocked or slow, which left the "Scan for your
 * digital badge" box blank (QA P2). Generating the matrix in the browser with
 * the same `qrcode` package the posters use removes the network dependency.
 * The SVG only contains module rectangles, never the encoded text, so
 * injecting it is safe.
 */
export function QRCode({ value, size = 200, className }: QRCodeProps) {
    const svg = useMemo(() => {
        if (!value) return null
        try {
            return buildQrSvg({ text: value, size, logo: false })
        } catch {
            return null
        }
    }, [value, size])

    if (!svg) {
        return (
            <div
                role="img"
                aria-label="QR code unavailable"
                className={className}
                style={{ width: size, height: size }}
            />
        )
    }

    return (
        <div
            role="img"
            aria-label="QR code"
            className={className}
            style={{ width: size, height: size, lineHeight: 0 }}
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    )
}

/** Kept for existing imports; renders the same local SVG. */
export const QRCodeCanvas = QRCode
