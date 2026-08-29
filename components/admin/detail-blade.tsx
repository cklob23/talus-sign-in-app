"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

/**
 * Universal right-hand "blade" for the admin portal.
 *
 * A single slide-out panel used across every list page (users, locations,
 * vendors, roles, hosts, evacuations, bookings, audit log, NDAs, visitors,
 * history) so object details look and behave consistently. Compose the body
 * from the exported <DetailBladeSection> / <DetailBladeField> helpers.
 */

export interface DetailBladeProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Primary title, e.g. the person or object name. */
    title: React.ReactNode
    /** Secondary line under the title, e.g. email or a category. */
    subtitle?: React.ReactNode
    /** Small eyebrow label above the title, e.g. "User", "Location". */
    eyebrow?: React.ReactNode
    /** Optional avatar image URL (falls back to initials from `title`). */
    avatarUrl?: string | null
    /** Explicit avatar fallback text; defaults to initials derived from title. */
    avatarFallback?: string
    /** Hide the avatar entirely (for non-person objects). */
    hideAvatar?: boolean
    /** Status badge(s) rendered near the header. */
    status?: React.ReactNode
    /** Body content — typically DetailBladeSection blocks. */
    children?: React.ReactNode
    /** Sticky footer, typically action buttons. */
    footer?: React.ReactNode
    /** Show a loading skeleton in place of the body. */
    loading?: boolean
    className?: string
}

function initialsFrom(value: React.ReactNode): string {
    if (typeof value !== "string") return "?"
    const parts = value.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function DetailBlade({
    open,
    onOpenChange,
    title,
    subtitle,
    eyebrow,
    avatarUrl,
    avatarFallback,
    hideAvatar = false,
    status,
    children,
    footer,
    loading = false,
    className,
}: DetailBladeProps) {
    const [photoExpanded, setPhotoExpanded] = React.useState(false)
    const hasPhoto = Boolean(avatarUrl)
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                // Override the primitive's narrow default so the detail panel has room.
                className={cn("w-full gap-0 p-0 sm:max-w-md lg:max-w-lg", className)}
            >
                {/* Header */}
                <div className="flex shrink-0 flex-col gap-3 border-b bg-muted/30 p-5 pr-12">
                    {eyebrow ? (
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</span>
                    ) : null}
                    <div className="flex items-start gap-3">
                        {!hideAvatar ? (
                            hasPhoto ? (
                                <button
                                    type="button"
                                    onClick={() => setPhotoExpanded(true)}
                                    className="shrink-0 rounded-full ring-offset-background transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    aria-label="View photo full size"
                                >
                                    <Avatar className="h-20 w-20">
                                        <AvatarImage src={avatarUrl || "/placeholder.svg"} alt="" />
                                        <AvatarFallback className="text-lg">{avatarFallback || initialsFrom(title)}</AvatarFallback>
                                    </Avatar>
                                </button>
                            ) : (
                                <Avatar className="h-20 w-20 shrink-0">
                                    <AvatarFallback className="text-lg">{avatarFallback || initialsFrom(title)}</AvatarFallback>
                                </Avatar>
                            )
                        ) : null}
                        <div className="min-w-0 flex-1">
                            <SheetTitle className="text-pretty text-lg font-semibold leading-tight">{title}</SheetTitle>
                            {subtitle ? (
                                <SheetDescription className="mt-0.5 truncate text-sm text-muted-foreground">
                                    {subtitle}
                                </SheetDescription>
                            ) : (
                                <SheetDescription className="sr-only">Details panel</SheetDescription>
                            )}
                            {status ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{status}</div> : null}
                        </div>
                    </div>
                </div>

                {/* Body */}
                <ScrollArea className="min-h-0 flex-1">
                    <div className="flex flex-col gap-6 p-5">
                        {loading ? (
                            <div className="flex flex-col gap-4">
                                <Skeleton className="h-4 w-1/3" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-4 w-1/3" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : (
                            children
                        )}
                    </div>
                </ScrollArea>

                {/* Footer */}
                {footer ? <div className="shrink-0 border-t bg-muted/30 p-4">{footer}</div> : null}
            </SheetContent>

            {hasPhoto ? (
                <Dialog open={photoExpanded} onOpenChange={setPhotoExpanded}>
                    <DialogContent className="max-w-lg overflow-hidden p-0">
                        <DialogTitle className="sr-only">
                            {typeof title === "string" ? `${title} photo` : "Photo"}
                        </DialogTitle>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={avatarUrl || "/placeholder.svg"}
                            alt={typeof title === "string" ? title : "Profile photo"}
                            className="h-auto max-h-[80vh] w-full object-contain"
                        />
                    </DialogContent>
                </Dialog>
            ) : null}
        </Sheet>
    )
}

/** A titled group of fields within the blade body. */
export function DetailBladeSection({
    title,
    action,
    children,
    className,
}: {
    title?: React.ReactNode
    action?: React.ReactNode
    children: React.ReactNode
    className?: string
}) {
    return (
        <section className={cn("flex flex-col gap-3", className)}>
            {title || action ? (
                <div className="flex items-center justify-between">
                    {title ? (
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
                    ) : (
                        <span />
                    )}
                    {action}
                </div>
            ) : null}
            <div className="flex flex-col gap-3">{children}</div>
        </section>
    )
}

/**
 * A single label/value row. Renders nothing when the value is empty, unless
 * `showEmpty` is set (so absent directory data doesn't clutter the panel).
 */
export function DetailBladeField({
    label,
    value,
    showEmpty = false,
    className,
}: {
    label: React.ReactNode
    value: React.ReactNode
    showEmpty?: boolean
    className?: string
}) {
    const isEmpty = value === null || value === undefined || value === ""
    if (isEmpty && !showEmpty) return null
    return (
        <div className={cn("flex flex-col gap-0.5", className)}>
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm text-foreground">{isEmpty ? <span className="text-muted-foreground">—</span> : value}</span>
        </div>
    )
}

export { Separator as DetailBladeSeparator }
