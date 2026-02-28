import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * Generates a calendar event (.ics) file for the visitor badge.
 * When opened on iOS, it triggers "Add to Calendar" which keeps the badge
 * info accessible. On Android it works similarly.
 * 
 * True Apple Wallet (.pkpass) requires Apple Developer certificates for signing.
 * True Google Wallet requires a Google Cloud service account.
 * This ICS approach is the best universal "Add to Wallet" alternative that
 * works across all devices without additional setup.
 */

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: signIn, error } = await supabase
        .from("sign_ins")
        .select(`
      id,
      badge_number,
      sign_in_time,
      sign_out_time,
      purpose,
      visitor:visitors(first_name, last_name, company, email),
      location:locations(name, address),
      visitor_type:visitor_types(name),
      host:hosts(name)
    `)
        .eq("id", id)
        .single()

    if (error || !signIn) {
        return NextResponse.json({ error: "Badge not found" }, { status: 404 })
    }

    const visitorRaw = signIn.visitor as unknown
    const visitor = (Array.isArray(visitorRaw) ? visitorRaw[0] : visitorRaw) as { first_name: string; last_name: string; company?: string; email?: string } | null

    const locationRaw = signIn.location as unknown
    const location = (Array.isArray(locationRaw) ? locationRaw[0] : locationRaw) as { name: string; address?: string } | null

    const visitorTypeRaw = signIn.visitor_type as unknown
    const visitorType = (Array.isArray(visitorTypeRaw) ? visitorTypeRaw[0] : visitorTypeRaw) as { name: string } | null

    const hostRaw = signIn.host as unknown
    const host = (Array.isArray(hostRaw) ? hostRaw[0] : hostRaw) as { name: string } | null

    const visitorName = visitor ? `${visitor.first_name} ${visitor.last_name}` : "Visitor"
    const badgeUrl = `${request.nextUrl.origin}/badge/${id}`

    // Format dates for ICS (YYYYMMDDTHHMMSSZ)
    const formatICSDate = (date: Date) => {
        return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
    }

    const startDate = new Date(signIn.sign_in_time)
    const endDate = signIn.sign_out_time
        ? new Date(signIn.sign_out_time)
        : new Date(startDate.getTime() + 8 * 60 * 60 * 1000) // Default 8hr visit

    const description = [
        `Visitor Badge: ${signIn.badge_number}`,
        `Name: ${visitorName}`,
        visitor?.company ? `Company: ${visitor.company}` : "",
        visitorType ? `Type: ${visitorType.name}` : "",
        host ? `Host: ${host.name}` : "",
        signIn.purpose ? `Purpose: ${signIn.purpose}` : "",
        "",
        `Digital Badge: ${badgeUrl}`,
    ].filter(Boolean).join("\\n")

    const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TalusAg//Visitor Badge//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:badge-${signIn.badge_number}-${id}@talusag`,
        `DTSTART:${formatICSDate(startDate)}`,
        `DTEND:${formatICSDate(endDate)}`,
        `SUMMARY:Visitor Badge - ${visitorName} (${signIn.badge_number})`,
        `DESCRIPTION:${description}`,
        location?.name ? `LOCATION:${location.name}${location.address ? `, ${location.address}` : ""}` : "",
        `URL:${badgeUrl}`,
        `STATUS:${signIn.sign_out_time ? "CANCELLED" : "CONFIRMED"}`,
        "BEGIN:VALARM",
        "TRIGGER:-PT0M",
        "ACTION:DISPLAY",
        `DESCRIPTION:Visitor Badge ${signIn.badge_number} - ${visitorName}`,
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ].filter(Boolean).join("\r\n")

    return new NextResponse(ics, {
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `attachment; filename="visitor-badge-${signIn.badge_number}.ics"`,
        },
    })
}
