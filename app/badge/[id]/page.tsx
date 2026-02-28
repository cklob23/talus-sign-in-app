import { createClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import { DigitalBadgeClient } from "./badge-client"

export const dynamic = "force-dynamic"

async function getSignInData(id: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
        .from("sign_ins")
        .select(`
      id,
      badge_number,
      sign_in_time,
      sign_out_time,
      photo_url,
      purpose,
      visitor:visitors(first_name, last_name, company, email, photo_url),
      location:locations(name, address),
      visitor_type:visitor_types(name, badge_color),
      host:hosts(name, department)
    `)
        .eq("id", id)
        .single()

    if (error || !data) return null
    return data
}

export default async function DigitalBadgePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const signIn = await getSignInData(id)

    if (!signIn) {
        notFound()
    }

    const visitorRaw = signIn.visitor as unknown
    const visitor = (Array.isArray(visitorRaw) ? visitorRaw[0] : visitorRaw) as { first_name: string; last_name: string; company?: string; email?: string; photo_url?: string } | null

    const locationRaw = signIn.location as unknown
    const location = (Array.isArray(locationRaw) ? locationRaw[0] : locationRaw) as { name: string; address?: string } | null

    const visitorTypeRaw = signIn.visitor_type as unknown
    const visitorType = (Array.isArray(visitorTypeRaw) ? visitorTypeRaw[0] : visitorTypeRaw) as { name: string; badge_color?: string } | null

    const hostRaw = signIn.host as unknown
    const host = (Array.isArray(hostRaw) ? hostRaw[0] : hostRaw) as { name: string; department?: string } | null

    const visitorName = visitor ? `${visitor.first_name} ${visitor.last_name}` : "Visitor"
    const photoUrl = visitor?.photo_url || signIn.photo_url
    const initials = visitorName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()

    return (
        <DigitalBadgeClient
            signInId={signIn.id}
            visitorName={visitorName}
            visitorEmail={visitor?.email || null}
            photoUrl={photoUrl || null}
            initials={initials}
            company={visitor?.company || null}
            visitorTypeName={visitorType?.name || null}
            visitorTypeColor={visitorType?.badge_color || null}
            locationName={location?.name || null}
            locationAddress={location?.address || null}
            hostName={host?.name || null}
            hostDepartment={host?.department || null}
            badgeNumber={signIn.badge_number}
            signInTime={signIn.sign_in_time}
            signOutTime={signIn.sign_out_time}
            purpose={signIn.purpose}
        />
    )
}
