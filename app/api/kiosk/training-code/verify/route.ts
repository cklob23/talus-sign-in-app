import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalEmail, asRequiredUuid } from "@/lib/kiosk-input"
import { verifyTrainingCode } from "@/lib/training-codes"
import { clientIp, rateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const auth = await requireKioskContext(request)
  if (!auth.ok) return auth.response

  const limited = rateLimit(`training-code-verify:${clientIp(request)}`, 30, 30 * 60 * 1000)
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many tries. Watch the video instead." }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  const email = asOptionalEmail(raw.email)
  const visitorTypeId = asRequiredUuid(raw.visitor_type_id)
  const code = typeof raw.code === "string" ? raw.code : ""
  if (email === undefined || !email || !visitorTypeId) {
    return NextResponse.json({ error: "A valid email and visitor type are required." }, { status: 400 })
  }

  const result = await verifyTrainingCode(getAdminClient(), {
    email,
    visitorTypeId,
    code,
  })
  if (!result.ok) {
    const status = result.reason === "store_failed" ? 500 : 409
    return NextResponse.json({ error: result.message, code: result.reason }, { status })
  }
  return NextResponse.json({ success: true, proof: result.proof })
}
