"use client"

import React from "react"

import { hasFeature, getTierName, getRequiredTier, isAddon, type TierFeatures } from "@/lib/tier"
import { Button } from "@/components/ui/button"
import { Lock } from "lucide-react"
import Link from "next/link"

interface TierGateProps {
    feature: keyof TierFeatures
    label: string
    children: React.ReactNode
}

/**
 * Wraps page content and shows an upgrade notice if the feature
 * is not available on the current tier.
 */
export function TierGate({ feature, label, children }: TierGateProps) {
    if (hasFeature(feature)) {
        return <>{children}</>
    }

    const required = getRequiredTier(feature)
    const isAddonFeature = isAddon(feature)

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
            <div className="rounded-full bg-muted p-4">
                <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold">{label}</h2>
            <p className="text-muted-foreground max-w-md">
                {isAddonFeature ? (
                    <>This feature is a paid add-on. Contact your account administrator to enable it.</>
                ) : (
                    <>This feature requires the <strong>{required.charAt(0).toUpperCase() + required.slice(1)}</strong> plan. You are currently on the <strong>{getTierName()}</strong> plan.</>
                )}
            </p>
            <Link href="/admin/settings">
                <Button variant="outline" className="bg-transparent">View Settings</Button>
            </Link>
        </div>
    )
}
