import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { readTrainingLinkToken } from "@/lib/visit-token"
import {
  parseTrainingProof,
  requiredWatchMs,
  trainingLinkScope,
  verifyTrainingProof,
} from "@/lib/training-gate"
import {
  findOrCreateVisitorByEmail,
  formatClearanceMessage,
  getTrainingClearance,
  recordTrainingCompletion,
} from "@/lib/training-clearance"
import { clientIp, rateLimit } from "@/lib/rate-limit"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limited = rateLimit(`training-link-complete:${clientIp(request)}`, 20, 10 * 60 * 1000)
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

  const body = await request.json().catch(() => null)
  const proof = parseTrainingProof(body)
  const check = verifyTrainingProof(proof, {
    visitorTypeId: read.payload.visitorTypeId,
    scope: trainingLinkScope(read.payload.visitorTypeId),
    minWatchMs: requiredWatchMs(proof.videoSeconds),
  })
  if (!check.ok) {
    return NextResponse.json({ error: check.message, code: check.code }, { status: 409 })
  }

  const admin = getAdminClient()
  const existing = await getTrainingClearance(admin, read.payload.email, read.payload.visitorTypeId)
  if (existing.cleared) {
    return NextResponse.json({
      success: true,
      alreadyCleared: true,
      message: existing.message,
      messageEs: existing.messageEs,
    })
  }

  const visitor = await findOrCreateVisitorByEmail(admin, {
    email: read.payload.email,
    firstName: read.payload.firstName,
    lastName: read.payload.lastName,
    company: read.payload.company,
  })
  if (!visitor) {
    return NextResponse.json({ error: "Could not save your training." }, { status: 500 })
  }

  const recorded = await recordTrainingCompletion(admin, {
    visitorId: visitor.id,
    visitorTypeId: read.payload.visitorTypeId,
    source: "training_link",
  })
  if (!recorded.ok) {
    return NextResponse.json({ error: recorded.error }, { status: 500 })
  }

  const completedAt = new Date().toISOString()
  return NextResponse.json({
    success: true,
    message: formatClearanceMessage(completedAt, recorded.expiresAt, "en"),
    messageEs: formatClearanceMessage(completedAt, recorded.expiresAt, "es"),
  })
}
