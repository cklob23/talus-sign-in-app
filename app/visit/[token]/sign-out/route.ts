import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { readVisitToken } from "@/lib/visit-token"
import { clientIp, rateLimit } from "@/lib/rate-limit"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(`visit-signout:${clientIp(request)}`, 15, 10 * 60 * 1000)
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
    .select("id, visitor_id, sign_out_time, badge_number, visitor:visitors(first_name, last_name, email)")
    .eq("id", read.payload.signInId)
    .maybeSingle()
  if (!signIn) {
    return NextResponse.json({ error: "Visit not found." }, { status: 404 })
  }
  if (signIn.sign_out_time) {
    return NextResponse.json({ success: true, alreadySignedOut: true })
  }

  const { error } = await admin
    .from("sign_ins")
    .update({ sign_out_time: new Date().toISOString() })
    .eq("id", signIn.id)
  if (error) {
    return NextResponse.json({ error: "Could not sign the visitor out." }, { status: 500 })
  }

  const visitor = Array.isArray(signIn.visitor) ? signIn.visitor[0] : signIn.visitor
  const visitorName = visitor ? `${visitor.first_name} ${visitor.last_name}` : "Visitor"
  await admin.from("audit_logs").insert({
    user_id: null,
    action: "visitor.sign_out",
    entity_type: "visitor",
    entity_id: signIn.visitor_id,
    description: `Host signed out visitor from visit page: ${visitorName}`,
    metadata: {
      sign_in_id: signIn.id,
      source: "visit_page",
      badge_number: signIn.badge_number,
      visitor_email: visitor?.email || null,
    },
    ip_address: clientIp(request),
    user_agent: request.headers.get("user-agent"),
  })

  return NextResponse.json({ success: true })
}
