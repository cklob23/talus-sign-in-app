import type { Metadata } from "next"
import { getAdminClient } from "@/lib/supabase/server"
import { getBrandingSettings } from "@/lib/branding"
import { resolveCheckinToken } from "@/lib/checkin-token"
import { shouldEnforceGeofence } from "@/lib/checkin-geofence"
import { CheckinFlow } from "./checkin-flow"
import { CheckinShell } from "./checkin-shell"
import { isNdaFeatureEnabled } from "@/lib/nda-flag"
import { listActiveHosts, QR_HOST_SELECT } from "@/lib/active-hosts"

export const dynamic = "force-dynamic"

// Public URL that must never appear in search results.
export const metadata: Metadata = {
    title: "Visitor Sign In",
    robots: { index: false, follow: false },
}

export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const [resolved, branding] = await Promise.all([resolveCheckinToken(token), getBrandingSettings()])

    if (!resolved.ok) {
        return (
            <CheckinShell companyName={branding.companyName} logo={branding.companyLogo}>
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                    <h1 className="text-xl font-semibold text-balance">
                        {resolved.kind === "disabled" ? "Self sign-in unavailable" : "QR code not recognised"}
                    </h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">{resolved.reason}</p>
                </div>
            </CheckinShell>
        )
    }

    const { location, geofenceRequired } = resolved
    const admin = getAdminClient()

    // Only the numbers needed for the on-device pre-check are sent to the browser.
    // The server makes the real decision when the form is submitted.
    const geofence =
        shouldEnforceGeofence(location, geofenceRequired)
            ? {
                latitude: location.latitude,
                longitude: location.longitude,
                auto_signin_radius_meters: location.auto_signin_radius_meters,
                geofence_enabled: location.geofence_enabled,
            }
            : null

    // Visitor types and hosts are global: the admin UI manages them as one
    // flat list. hosts.location_id is not a filter (P1-6).
    const [{ data: visitorTypes }, hostsResult] = await Promise.all([
        admin
            .from("visitor_types")
            .select(
                "id, name, badge_color, requires_host, requires_company, requires_training, requires_nda, training_title, training_video_url",
            )
            .order("name"),
        listActiveHosts(admin, QR_HOST_SELECT),
    ])

    if (!hostsResult.ok) {
        return (
            <CheckinShell companyName={branding.companyName} logo={branding.companyLogo} locationName={location.name}>
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                    <h1 className="text-xl font-semibold text-balance">Could not load hosts</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">{hostsResult.error}</p>
                </div>
            </CheckinShell>
        )
    }

    return (
        <CheckinShell companyName={branding.companyName} logo={branding.companyLogo} locationName={location.name}>
            <CheckinFlow
                token={token}
                locationName={location.name}
                visitorTypes={visitorTypes ?? []}
                hosts={hostsResult.hosts}
                geofence={geofence}
                ndaEnabled={isNdaFeatureEnabled()}
            />
        </CheckinShell>
    )
}
