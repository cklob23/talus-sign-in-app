"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Printer, Copy, Check, ArrowLeft, Download } from "lucide-react"

/** Screen-only controls above the poster sheet; hidden when printing. */
export function PosterToolbar({
    locationId,
    locationName,
    checkinUrl,
}: {
    locationId: string
    locationName: string
    checkinUrl: string
}) {
    const [copied, setCopied] = useState(false)

    async function copy() {
        await navigator.clipboard.writeText(checkinUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="poster-no-print mx-auto mb-6 flex w-[210mm] max-w-[95vw] flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" asChild>
                    <a href="/admin/settings">
                        <ArrowLeft className="mr-1.5 h-4 w-4" />
                        Settings
                    </a>
                </Button>
                <p className="text-sm text-muted-foreground">
                    Sign-in poster for <span className="font-medium text-foreground">{locationName}</span>
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void copy()}>
                    {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                    {copied ? "Copied" : "Copy link"}
                </Button>
                {/* A plain link, so the browser handles the download and the file can be
            forwarded to site supervisors to print locally. */}
                <Button variant="outline" size="sm" asChild>
                    <a href={`/api/admin/qr-poster/${locationId}`} download>
                        <Download className="mr-1.5 h-4 w-4" />
                        Download PDF
                    </a>
                </Button>
                <Button size="sm" onClick={() => window.print()}>
                    <Printer className="mr-1.5 h-4 w-4" />
                    Print poster
                </Button>
            </div>
        </div>
    )
}
