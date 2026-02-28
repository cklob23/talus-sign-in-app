"use client"

import { useRef, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MapPin, Clock, Building2, User, Download, Share2 } from "lucide-react"

const TALUS_GREEN = "#4d8b31"

interface DigitalBadgeClientProps {
    signInId: string
    visitorName: string
    visitorEmail: string | null
    photoUrl: string | null
    initials: string
    company: string | null
    visitorTypeName: string | null
    visitorTypeColor: string | null
    locationName: string | null
    locationAddress: string | null
    hostName: string | null
    hostDepartment: string | null
    badgeNumber: string
    signInTime: string
    signOutTime: string | null
    purpose: string | null
}

export function DigitalBadgeClient({
    signInId,
    visitorName,
    visitorEmail,
    photoUrl,
    initials,
    company,
    visitorTypeName,
    visitorTypeColor,
    locationName,
    locationAddress,
    hostName,
    hostDepartment,
    badgeNumber,
    signInTime,
    signOutTime,
    purpose,
}: DigitalBadgeClientProps) {
    const badgeRef = useRef<HTMLDivElement>(null)
    const signInDate = new Date(signInTime)
    const isActive = !signOutTime

    const saveBadgeAsImage = useCallback(async () => {
        if (!badgeRef.current) return

        try {
            // Dynamically import html2canvas-style approach using canvas
            const canvas = document.createElement("canvas")
            const scale = 3 // High-res
            const badge = badgeRef.current
            const rect = badge.getBoundingClientRect()

            canvas.width = rect.width * scale
            canvas.height = rect.height * scale
            const ctx = canvas.getContext("2d")
            if (!ctx) return

            ctx.scale(scale, scale)

            // Draw white background
            ctx.fillStyle = "#ffffff"
            ctx.fillRect(0, 0, rect.width, rect.height)

            // Draw top accent bar
            ctx.fillStyle = TALUS_GREEN
            ctx.fillRect(0, 0, rect.width, 8)

            // Draw badge content using simple canvas operations
            const centerX = rect.width / 2
            let y = 40

            // Status badge
            ctx.fillStyle = isActive ? "#16a34a" : "#9ca3af"
            const statusText = isActive ? "ACTIVE" : "SIGNED OUT"
            ctx.font = "bold 11px Arial"
            const statusWidth = ctx.measureText(statusText).width + 16
            const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
                ctx.beginPath()
                ctx.moveTo(x + r, y)
                ctx.lineTo(x + w - r, y)
                ctx.quadraticCurveTo(x + w, y, x + w, y + r)
                ctx.lineTo(x + w, y + h - r)
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
                ctx.lineTo(x + r, y + h)
                ctx.quadraticCurveTo(x, y + h, x, y + h - r)
                ctx.lineTo(x, y + r)
                ctx.quadraticCurveTo(x, y, x + r, y)
                ctx.closePath()
            }
            roundRect(centerX - statusWidth / 2, y, statusWidth, 22, 11)
            ctx.fill()
            ctx.fillStyle = "#ffffff"
            ctx.textAlign = "center"
            ctx.fillText(statusText, centerX, y + 15)
            y += 40

            // Photo circle
            const photoSize = 80
            if (photoUrl) {
                const img = new Image()
                img.crossOrigin = "anonymous"
                await new Promise<void>((resolve) => {
                    img.onload = () => {
                        ctx.save()
                        ctx.beginPath()
                        ctx.arc(centerX, y + photoSize / 2, photoSize / 2, 0, Math.PI * 2)
                        ctx.closePath()
                        ctx.clip()
                        ctx.drawImage(img, centerX - photoSize / 2, y, photoSize, photoSize)
                        ctx.restore()
                        // Green border
                        ctx.strokeStyle = TALUS_GREEN
                        ctx.lineWidth = 3
                        ctx.beginPath()
                        ctx.arc(centerX, y + photoSize / 2, photoSize / 2 + 1, 0, Math.PI * 2)
                        ctx.stroke()
                        resolve()
                    }
                    img.onerror = () => resolve()
                    img.src = photoUrl
                })
            } else {
                // Initials circle
                ctx.fillStyle = TALUS_GREEN
                ctx.beginPath()
                ctx.arc(centerX, y + photoSize / 2, photoSize / 2, 0, Math.PI * 2)
                ctx.fill()
                ctx.fillStyle = "#ffffff"
                ctx.font = "bold 28px Arial"
                ctx.textAlign = "center"
                ctx.fillText(initials, centerX, y + photoSize / 2 + 10)
            }
            y += photoSize + 16

            // Name
            ctx.fillStyle = "#111827"
            ctx.font = "bold 20px Arial"
            ctx.textAlign = "center"
            ctx.fillText(visitorName, centerX, y)
            y += 20

            // Company
            if (company) {
                ctx.fillStyle = "#6b7280"
                ctx.font = "14px Arial"
                ctx.fillText(company, centerX, y)
                y += 18
            }

            // Visitor type badge
            if (visitorTypeName) {
                const typeColor = visitorTypeColor || "#6b7280"
                ctx.strokeStyle = typeColor
                ctx.lineWidth = 1
                ctx.fillStyle = typeColor
                ctx.font = "bold 11px Arial"
                const typeWidth = ctx.measureText(visitorTypeName.toUpperCase()).width + 16
                roundRect(centerX - typeWidth / 2, y, typeWidth, 22, 11)
                ctx.stroke()
                ctx.fillStyle = typeColor
                ctx.textAlign = "center"
                ctx.fillText(visitorTypeName.toUpperCase(), centerX, y + 15)
                y += 36
            } else {
                y += 12
            }

            // Details section
            ctx.textAlign = "left"
            const detailX = 32

            if (locationName) {
                ctx.fillStyle = "#111827"
                ctx.font = "600 13px Arial"
                ctx.fillText(locationName, detailX + 20, y)
                y += 16
                if (locationAddress) {
                    ctx.fillStyle = "#9ca3af"
                    ctx.font = "11px Arial"
                    ctx.fillText(locationAddress, detailX + 20, y)
                    y += 18
                }
            }

            // Sign-in time
            ctx.fillStyle = "#111827"
            ctx.font = "600 13px Arial"
            ctx.fillText(
                signInDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
                detailX + 20,
                y
            )
            y += 16
            ctx.fillStyle = "#9ca3af"
            ctx.font = "11px Arial"
            let timeText = `Signed in at ${signInDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
            if (signOutTime) {
                timeText += ` - Signed out at ${new Date(signOutTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
            }
            ctx.fillText(timeText, detailX + 20, y)
            y += 24

            // Footer
            ctx.fillStyle = "#e5e7eb"
            ctx.fillRect(24, y, rect.width - 48, 1)
            y += 16
            ctx.fillStyle = "#9ca3af"
            ctx.font = "11px Arial"
            ctx.textAlign = "center"
            ctx.fillText("Digital Visitor Badge", centerX, y)
            y += 20
            ctx.fillStyle = TALUS_GREEN
            ctx.font = "bold 18px Courier New"
            ctx.fillText(badgeNumber, centerX, y)

            // Convert to blob
            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), "image/png")
            })
            if (!blob) return

            const file = new File([blob], `visitor-badge-${badgeNumber}.png`, { type: "image/png" })

            // On mobile, use Web Share API with file — this triggers "Save to Photos" on iOS/Android
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ files: [file] })
                    return
                } catch {
                    // User cancelled or share failed — fall through to download
                }
            }

            // Fallback for desktop: trigger download
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `visitor-badge-${badgeNumber}.png`
            a.click()
            URL.revokeObjectURL(url)
        } catch {
            alert("Unable to save badge image. Try using the Share button instead.")
        }
    }, [visitorName, photoUrl, initials, company, visitorTypeName, visitorTypeColor, locationName, locationAddress, signInTime, signOutTime, badgeNumber, isActive])

    const shareBadge = useCallback(async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Visitor Badge - ${visitorName}`,
                    text: `${visitorName} - Badge ${badgeNumber}`,
                    url: window.location.href,
                })
            } catch {
                // User cancelled
            }
        } else {
            // Fallback: copy to clipboard
            await navigator.clipboard.writeText(window.location.href)
            alert("Badge link copied to clipboard!")
        }
    }, [visitorName, badgeNumber])

    return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-4">
                <div ref={badgeRef}>
                    <Card className="overflow-hidden border-0 shadow-xl">
                        {/* Top accent bar - always Talus green */}
                        <div className="h-2" style={{ background: TALUS_GREEN }} />

                        <CardContent className="p-6">
                            {/* Status */}
                            <div className="flex justify-between items-center mb-5">
                                <Badge
                                    variant={isActive ? "default" : "secondary"}
                                    className={isActive ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                                >
                                    {isActive ? "Active" : "Signed Out"}
                                </Badge>
                                <span className="text-xs text-muted-foreground font-mono">
                                    {badgeNumber}
                                </span>
                            </div>

                            {/* Photo + Name */}
                            <div className="flex flex-col items-center text-center mb-6">
                                {photoUrl ? (
                                    <img
                                        src={photoUrl}
                                        alt={visitorName}
                                        className="w-24 h-24 rounded-full object-cover mb-3 border-4 border-gray-400"
                                        crossOrigin="anonymous"
                                    />
                                ) : (
                                    <div
                                        className="w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3"
                                        style={{ background: TALUS_GREEN }}
                                    >
                                        {initials}
                                    </div>
                                )}
                                <h1 className="text-xl font-bold text-foreground">{visitorName}</h1>
                                {visitorEmail && (
                                    <p className="text-xs text-muted-foreground mt-0.5 break-all">{visitorEmail}</p>
                                )}
                                {company && (
                                    <p className="text-sm text-muted-foreground mt-0.5">{company}</p>
                                )}
                                {/* Visitor type badge uses visitor type color */}
                                {visitorTypeName && (
                                    <Badge
                                        variant="outline"
                                        className="mt-2 text-xs"
                                        style={{
                                            borderColor: visitorTypeColor || "#6b7280",
                                            color: visitorTypeColor || "#6b7280",
                                        }}
                                    >
                                        {visitorTypeName}
                                    </Badge>
                                )}
                            </div>

                            {/* Details */}
                            <div className="space-y-3 text-sm">
                                {locationName && (
                                    <div className="flex items-start gap-3">
                                        <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                        <div>
                                            <p className="font-medium text-foreground">{locationName}</p>
                                            {locationAddress && (
                                                <p className="text-xs text-muted-foreground">{locationAddress}</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center gap-3">
                                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <p className="font-medium text-foreground">
                                            {signInDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {"Signed in at "}
                                            {signInDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                            {signOutTime && (
                                                <>
                                                    {" \u00B7 Signed out at "}
                                                    {new Date(signOutTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                                </>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {hostName && (
                                    <div className="flex items-center gap-3">
                                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <div>
                                            <p className="font-medium text-foreground">{hostName}</p>
                                            {hostDepartment && (
                                                <p className="text-xs text-muted-foreground">{hostDepartment}</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {purpose && (
                                    <div className="flex items-center gap-3">
                                        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <p className="font-medium text-foreground">{purpose}</p>
                                    </div>
                                )}
                            </div>

                            {/* Badge ID footer */}
                            <div className="mt-6 pt-4 border-t text-center">
                                <p className="text-xs text-muted-foreground">Digital Visitor Badge</p>
                                <p className="text-lg font-mono font-bold mt-1" style={{ color: TALUS_GREEN }}>
                                    {badgeNumber}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-3">
                    <Button
                        onClick={saveBadgeAsImage}
                        variant="outline"
                        className="gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Save to Photos
                    </Button>
                    <Button
                        onClick={shareBadge}
                        variant="outline"
                        className="gap-2"
                    >
                        <Share2 className="w-4 h-4" />
                        Share
                    </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                    Save your badge or share the link to access it later.
                </p>
            </div>
        </div>
    )
}
