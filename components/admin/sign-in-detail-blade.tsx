"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LogOut, Printer } from "lucide-react"
import {
    DetailBlade,
    DetailBladeSection,
    DetailBladeField,
} from "@/components/admin/detail-blade"
import { printVisitorBadge } from "@/lib/print-badge"
import { formatDateTime as formatDateTimeTz, formatDuration as formatDurationUtil } from "@/lib/timezone"
import type { SignIn, EmployeeSignIn, Profile, Location } from "@/types/database"

interface EmployeeSignInWithJoins extends Omit<EmployeeSignIn, "profile" | "location"> {
    profile: Profile | null
    location: Location | null
}

/** Discriminated record: a visitor sign-in or an employee sign-in. */
export type SignInRecord =
    | { kind: "visitor"; data: SignIn }
    | { kind: "employee"; data: EmployeeSignInWithJoins }

interface SignInDetailBladeProps {
    record: SignInRecord | null
    open: boolean
    onOpenChange: (open: boolean) => void
    /** IANA timezone for formatting timestamps. */
    timezone: string
    /** Enable the Sign out action (Current Visitors only). */
    canSignOut?: boolean
    /** Enable the Reprint badge action (visitor records only). */
    canReprint?: boolean
    onSignOut?: (record: SignInRecord) => void
}

function visitorInitials(v: SignIn["visitor"]): string {
    const a = v?.first_name?.[0] ?? ""
    const b = v?.last_name?.[0] ?? ""
    return (a + b).toUpperCase() || "?"
}

function employeeInitials(name: string | null | undefined): string {
    if (!name) return "?"
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "?"
    )
}

export function SignInDetailBlade({
    record,
    open,
    onOpenChange,
    timezone,
    canSignOut = false,
    canReprint = false,
    onSignOut,
}: SignInDetailBladeProps) {
    const fmt = (d: string | null | undefined) => (d ? formatDateTimeTz(d, timezone) : null)

    const onSite = record ? record.data.sign_out_time === null : false

    const header = useMemo(() => {
        if (!record) return { title: "", subtitle: undefined as string | undefined, avatarUrl: null as string | null, fallback: "?" }
        if (record.kind === "visitor") {
            const v = record.data.visitor
            return {
                title: `${v?.first_name ?? ""} ${v?.last_name ?? ""}`.trim() || "Unknown visitor",
                subtitle: v?.company || v?.email || undefined,
                avatarUrl: v?.photo_url ?? null,
                fallback: visitorInitials(v),
            }
        }
        const p = record.data.profile
        return {
            title: p?.full_name || "Unknown employee",
            subtitle: p?.email || undefined,
            avatarUrl: p?.avatar_url ?? null,
            fallback: employeeInitials(p?.full_name),
        }
    }, [record])

    const duration = record ? formatDurationUtil(record.data.sign_in_time, record.data.sign_out_time) : ""

    const status = record ? (
        <>
            <Badge variant={onSite ? "default" : "secondary"}>{onSite ? "On-site" : "Signed out"}</Badge>
            {record.kind === "visitor" && record.data.visitor_type ? (
                <Badge
                    variant="outline"
                    style={{
                        borderColor: record.data.visitor_type.badge_color,
                        color: record.data.visitor_type.badge_color,
                    }}
                >
                    {record.data.visitor_type.name}
                </Badge>
            ) : null}
            {record.kind === "employee" && record.data.auto_signed_in ? (
                <Badge variant="secondary">Auto sign-in</Badge>
            ) : null}
        </>
    ) : null

    function handleReprint() {
        if (!record || record.kind !== "visitor") return
        const s = record.data
        printVisitorBadge({
            visitorName: `${s.visitor?.first_name || ""} ${s.visitor?.last_name || ""}`.trim(),
            visitorEmail: s.visitor?.email || undefined,
            visitorCompany: s.visitor?.company || undefined,
            visitorType: s.visitor_type?.name || undefined,
            badgeNumber: s.badge_number || "N/A",
            locationName: s.location?.name || undefined,
            photoUrl: s.visitor?.photo_url || undefined,
        })
    }

    const showReprint = canReprint && record?.kind === "visitor"
    const footer =
        record && (canSignOut || showReprint) ? (
            <div className="flex items-center justify-end gap-2">
                {showReprint ? (
                    <Button variant="outline" size="sm" onClick={handleReprint}>
                        <Printer className="mr-2 h-4 w-4" />
                        Reprint badge
                    </Button>
                ) : null}
                {canSignOut && onSite ? (
                    <Button size="sm" onClick={() => onSignOut?.(record)}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign out
                    </Button>
                ) : null}
            </div>
        ) : null

    return (
        <DetailBlade
            open={open}
            onOpenChange={onOpenChange}
            eyebrow={record?.kind === "employee" ? "Employee" : "Visitor"}
            title={header.title}
            subtitle={header.subtitle}
            avatarUrl={header.avatarUrl}
            avatarFallback={header.fallback}
            status={status}
            footer={footer}
        >
            {record ? (
                <>
                    <DetailBladeSection title="Visit">
                        <DetailBladeField label="Location" value={record.data.location?.name} showEmpty />
                        <DetailBladeField label="Signed in" value={fmt(record.data.sign_in_time)} showEmpty />
                        <DetailBladeField
                            label="Signed out"
                            value={fmt(record.data.sign_out_time) ?? (onSite ? "Still on-site" : null)}
                            showEmpty
                        />
                        <DetailBladeField label="Duration" value={duration} showEmpty />
                    </DetailBladeSection>

                    {record.kind === "visitor" ? (
                        <>
                            <DetailBladeSection title="Visitor">
                                <DetailBladeField label="Company" value={record.data.visitor?.company} />
                                <DetailBladeField label="Email" value={record.data.visitor?.email} />
                                <DetailBladeField label="Phone" value={record.data.visitor?.phone} />
                            </DetailBladeSection>
                            <DetailBladeSection title="Check-in">
                                <DetailBladeField label="Host" value={record.data.host?.name} showEmpty />
                                <DetailBladeField
                                    label="Badge number"
                                    value={record.data.badge_number ? <span className="font-mono">{record.data.badge_number}</span> : null}
                                    showEmpty
                                />
                                <DetailBladeField label="Purpose" value={record.data.purpose} />
                                <DetailBladeField label="Notes" value={record.data.notes} />
                            </DetailBladeSection>
                        </>
                    ) : (
                        <DetailBladeSection title="Employee">
                            <DetailBladeField label="Role" value={record.data.profile?.role ? <span className="capitalize">{record.data.profile.role}</span> : null} />
                            <DetailBladeField label="Department" value={record.data.profile?.department} />
                            <DetailBladeField label="Sign-in method" value={record.data.auto_signed_in ? "Automatic" : "Manual"} showEmpty />
                        </DetailBladeSection>
                    )}
                </>
            ) : null}
        </DetailBlade>
    )
}
