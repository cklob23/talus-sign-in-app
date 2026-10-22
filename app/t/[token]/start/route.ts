import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { readTrainingLinkToken } from "@/lib/visit-token"
import { issueTrainingTicket, trainingLinkScope } from "@/lib/training-gate"
import { clientIp, rateLimit } from "@/lib/rate-limit"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limited = rateLimit(`training-link-start:${clientIp(request)}`, 20, 10 * 60 * 1000)
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 })
  }

  const read = readTrainingLinkToken(token)
  if (!read.ok) {
    return NextResponse.json(
      { error: read.reason === "expired" ? "This training link has expired." : "This training link is not valid." },
      { status: read.reason === "expired" ? 410 : 404 },
    )
  }

  const admin = getAdminClient()
  const { data: visitorType } = await admin
    .from("visitor_types")
    .select("id, requires_training, training_video_url")
    .eq("id", read.payload.visitorTypeId)
    .maybeSingle()
  if (!visitorType?.requires_training || !visitorType.training_video_url) {
    return NextResponse.json({ error: "Training is not required for this visitor type." }, { status: 400 })
  }

  const ticket = issueTrainingTicket({
    visitorTypeId: visitorType.id,
    scope: trainingLinkScope(visitorType.id),
  })
  return NextResponse.json({ ticket })
}
