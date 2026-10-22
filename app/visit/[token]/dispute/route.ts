import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { readVisitToken, visitUrlFromRequest } from "@/lib/visit-token"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { sendEmail } from "@/lib/email"
import { renderDisputeEmail } from "@/lib/training-mail"
import { resolveAppOrigin } from "@/lib/nda"
import { visitorFullName } from "@/lib/visit-page"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(`visit-dispute:${clientIp(request)}`, 8, 10 * 60 * 1000)
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 })
  }

  const { token } = await params
  const read = readVisitToken(token)
  if (!read.ok) {
    return NextResponse.json(
      { error: read.reason === "expired" ? "This visit link has expired." : "This visit link is not valid." },
      { status: read.reason === "expired" ? 410 : 404 },
    )
  }

  const admin = getAdminClient()
  const { data: signIn } = await admin
    .from("sign_ins")
    .select(
      "id, visitor_id, host_id, location_id, badge_number, visitor:visitors(first_name, last_name, email, company), host:hosts(name, email), location:locations(name)",
    )
    .eq("id", read.payload.signInId)
    .maybeSingle()
  if (!signIn) {
    return NextResponse.json({ error: "Visit not found." }, { status: 404 })
  }

  const visitor = unwrap(signIn.visitor)
  const host = unwrap(signIn.host)
  const location = unwrap(signIn.location)
  const visitorName = visitorFullName(visitor?.first_name, visitor?.last_name)
  const hostName = host?.name || "A host"

  await admin.from("audit_logs").insert({
    user_id: null,
    action: "visitor.not_my_visitor",
    entity_type: "visitor",
    entity_id: signIn.visitor_id,
    description: `${hostName} marked ${visitorName} as not their visitor`,
    metadata: {
      sign_in_id: signIn.id,
      host_id: signIn.host_id,
      location_id: signIn.location_id,
      badge_number: signIn.badge_number,
      visitor_email: visitor?.email || null,
    },
    ip_address: clientIp(request),
    user_agent: request.headers.get("user-agent"),
  })

  const recipients = await resolveReceptionRecipients(admin, signIn.location_id)
  const visitUrl = visitUrlFromRequest(request, signIn.id, signIn.host_id) || ""
  if (recipients.length > 0) {
    const mail = renderDisputeEmail({
      visitorName,
      hostName,
      siteName: location?.name || "",
      company: visitor?.company || null,
      badgeNumber: signIn.badge_number,
      visitUrl,
      appOrigin: resolveAppOrigin(request),
    })
    await sendEmail({ to: recipients, ...mail })
  }

  return NextResponse.json({ success: true, notified: recipients.length })
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

async function resolveReceptionRecipients(
  admin: ReturnType<typeof getAdminClient>,
  locationId: string | null,
): Promise<string[]> {
  const emails = new Set<string>()
  const { data: settings } = await admin
    .from("settings")
    .select("key, value")
    .is("location_id", null)
    .in("key", ["reception_email", "admin_notification_email", "host_notifications"])

  const map: Record<string, string> = {}
  for (const row of settings ?? []) map[row.key] = String(row.value ?? "")
  if (map.host_notifications === "false") {
    // Still notify admins for a safety mismatch; reception_email is the extra list.
  }
  for (const key of ["reception_email", "admin_notification_email"]) {
    const value = map[key]?.trim()
    if (value && value.includes("@")) emails.add(value.toLowerCase())
  }

  const { data: admins } = await admin
    .from("profiles")
    .select("email, role, location_id, is_active")
    .in("role", ["admin", "super_admin", "staff"])
    .eq("is_active", true)
    .limit(40)

  for (const profile of admins ?? []) {
    if (!profile.email) continue
    if (profile.role === "staff" && locationId && profile.location_id && profile.location_id !== locationId) continue
    emails.add(String(profile.email).trim().toLowerCase())
  }
  return [...emails]
}
