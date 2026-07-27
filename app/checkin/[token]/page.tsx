import type { Metadata } from "next"
import { getAdminClient } from "@/lib/supabase/server"
import { getBrandingSettings } from "@/lib/branding"
import { resolveCheckinToken } from "@/lib/checkin-token"
import { CheckinFlow } from "./checkin-flow"
import { CheckinShell } from "./checkin-shell"

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

    const { location } = resolved
    const admin = getAdminClient()

    // Only this location's types and hosts are exposed to the public page.
    const [{ data: visitorTypes }, { data: hosts }] = await Promise.all([
        admin
            .from("visitor_types")
            .select("id, name, badge_color, requires_host, requires_company, requires_training, training_title, training_video_url")
            .eq("location_id", location.id)
            .order("name"),
        admin
            .from("hosts")
            .select("id, name, department")
            .eq("location_id", location.id)
            .eq("is_active", true)
            .order("name"),
    ])

    return (
        <CheckinShell companyName={branding.companyName} logo={branding.companyLogo} locationName={location.name}>
            <CheckinFlow
                token={token}
                locationName={location.name}
                visitorTypes={visitorTypes ?? []}
                hosts={hosts ?? []}
            />
        </CheckinShell>
    )
}
