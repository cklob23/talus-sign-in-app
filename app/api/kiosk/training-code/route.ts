import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalEmail, asRequiredUuid } from "@/lib/kiosk-input"
import { getTrainingClearance } from "@/lib/training-clearance"
import { issueTrainingCode } from "@/lib/training-codes"
import { sendTrainingCodeEmail } from "@/lib/training-mail"
import { getBrandingSettings } from "@/lib/branding"
import { clientIp, rateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const auth = await requireKioskContext(request)
  if (!auth.ok) return auth.response

  const limited = rateLimit(`training-code-issue:${clientIp(request)}`, 12, 30 * 60 * 1000)
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many codes requested. Watch the video, or wait." }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  const email = asOptionalEmail(raw.email)
  const visitorTypeId = asRequiredUuid(raw.visitor_type_id)
  const locationId = asRequiredUuid(raw.location_id)
  const lang = raw.lang === "es" ? "es" : "en"
  if (email === undefined || !email || !visitorTypeId) {
    return NextResponse.json({ error: "A valid email and visitor type are required." }, { status: 400 })
  }

  const admin = getAdminClient()
  const clearance = await getTrainingClearance(admin, email, visitorTypeId)
  if (!clearance.cleared || clearance.skipKind !== "code") {
    return NextResponse.json({ error: "No code is needed for this visitor." }, { status: 409 })
  }

  const issued = await issueTrainingCode(admin, {
    email,
    visitorTypeId,
    locationId,
  })
  if (!issued.ok) {
    const status = issued.reason === "rate_limited" ? 429 : 400
    return NextResponse.json({ error: issued.message, code: issued.reason }, { status })
  }

  let siteName = "Talus Ag"
  if (locationId) {
    const { data: location } = await admin.from("locations").select("name").eq("id", locationId).maybeSingle()
    siteName = location?.name || siteName
  }
  const branding = await getBrandingSettings()
  const sent = await sendTrainingCodeEmail({
    to: email,
    lang,
    siteName,
    code: issued.issued.code,
    logoUrl: branding.companyLogo || null,
  })

  return NextResponse.json({
    success: true,
    sent: sent.sent,
    expiresAt: issued.issued.expiresAt,
    maskedEmail: mask(email),
  })
}

function mask(email: string): string {
  const at = email.indexOf("@")
  if (at <= 1) return "••••"
  return `${email[0]}••••${email[at - 1]}${email.slice(at)}`
}
