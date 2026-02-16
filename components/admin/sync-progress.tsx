"use client"

import { Progress } from "@/components/ui/progress"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

export interface SyncProgressData {
    current: number
    total: number
    created: number
    updated: number
    skipped: number
    errors: string[]
    status: "running" | "completed" | "failed"
    label?: string
}

interface SyncProgressProps {
    progress: SyncProgressData
    compact?: boolean
}

export function SyncProgress({ progress, compact = false }: SyncProgressProps) {
    const { current, total, created, updated, skipped, errors, status, label } = progress
    const pct = total > 0 ? Math.round((current / total) * 100) : 0

    if (compact) {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                    {status === "running" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    ) : status === "completed" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                        <XCircle className="w-3.5 h-3.5 text-destructive" />
                    )}
                    <span className="text-muted-foreground">
                        {status === "running"
                            ? `${label || "Importing"} ${current} of ${total}...`
                            : status === "completed"
                                ? `Done: ${created} created, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}`
                                : `Failed with ${errors.length} error(s)`}
                    </span>
                </div>
                {status === "running" && <Progress value={pct} className="h-1.5" />}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
                {status === "running" ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                    <XCircle className="w-4 h-4 text-destructive" />
                )}
                <span className="text-sm font-medium">
                    {status === "running"
                        ? `${label || "Importing"} ${current} of ${total}...`
                        : status === "completed"
                            ? "Import Complete"
                            : "Import Failed"}
                </span>
                {status === "running" && (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{pct}%</span>
                )}
            </div>

            {/* Progress bar */}
            <Progress value={pct} className="h-2" />

            {/* Stats row */}
            <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-semibold tabular-nums">{created}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-muted-foreground">Updated</span>
                    <span className="font-semibold tabular-nums">{updated}</span>
                </div>
                {skipped > 0 && (
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-muted-foreground">Skipped</span>
                        <span className="font-semibold tabular-nums">{skipped}</span>
                    </div>
                )}
                {errors.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-destructive" />
                        <span className="text-muted-foreground">Errors</span>
                        <span className="font-semibold tabular-nums">{errors.length}</span>
                    </div>
                )}
            </div>

            {/* Error log */}
            {errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded border border-destructive/20 bg-destructive/5 p-2 space-y-1">
                    {errors.map((err, i) => (
                        <p key={i} className="text-xs text-destructive font-mono break-all">
                            {err}
                        </p>
                    ))}
                </div>
            )}
        </div>
    )
}
