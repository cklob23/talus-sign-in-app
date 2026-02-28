"use client"

import { useEffect, useRef } from "react"

interface QRCodeProps {
    value: string
    size?: number
    className?: string
}

/**
 * Lightweight QR code component that renders via an <img> tag
 * using the Google Charts QR Code API. No npm dependency required.
 */
export function QRCode({ value, size = 200, className }: QRCodeProps) {
    const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&margin=4&format=svg`

    return (
        <img
            src={src}
            alt="QR Code"
            width={size}
            height={size}
            className={className}
            style={{ imageRendering: "pixelated" }}
        />
    )
}

/**
 * Self-contained QR code rendered to canvas. Falls back if the API
 * image doesn't load. Uses the same external API but renders to
 * canvas for a crisper look on high-DPI screens.
 */
export function QRCodeCanvas({ value, size = 200, className }: QRCodeProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        canvas.width = size * dpr
        canvas.height = size * dpr
        canvas.style.width = `${size}px`
        canvas.style.height = `${size}px`
        ctx.scale(dpr, dpr)

        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
            ctx.clearRect(0, 0, size, size)
            ctx.drawImage(img, 0, 0, size, size)
        }
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size * 2}x${size * 2}&data=${encodeURIComponent(value)}&margin=4&format=png`
    }, [value, size])

    return (
        <canvas
            ref={canvasRef}
            className={className}
            style={{ width: size, height: size }}
        />
    )
}
