import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalEmail, asOptionalIsoDate, asRequiredUuid } from "@/lib/kiosk-input"
import {
  KIOSK_TRAINING_SCOPE,
  kioskMinWatchMs,
  parseTrainingProof,
  requiredWatchMs,
  verifyTrainingProof,
} from "@/lib/training-gate"
import {
  defaultTrainingExpiresAt,
  getTrainingClearance,
  hasValidTrainingForVisitor,
  recordTrainingCompletion,
} from "@/lib/training-clearance"
import { readTrainingCodeProof } from "@/lib/training-codes"

/**
 * Record a training completion for a kiosk visitor.
 *
 * Proof is one of: a still-valid training-link clearance, a verified email
 * code, or the signed ticket from /api/kiosk/training/start plus the
 * acknowledgement after the player ended event.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireKioskContext(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const visitor_id = asRequiredUuid(raw.visitor_id)
    const visitor_type_id = asRequiredUuid(raw.visitor_type_id)
    const expires_at = asOptionalIsoDate(raw.expires_at)
    const email = asOptionalEmail(raw.email)

    if (!visitor_id || !visitor_type_id) {
      return NextResponse.json(
        { error: "Missing required fields: visitor_id and visitor_type_id" },
        { status: 400 },
      )
    }
    if (expires_at === undefined) {
      return NextResponse.json({ error: "Invalid expires_at" }, { status: 400 })
    }
    if (email === undefined) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 })
    }

    const adminClient = getAdminClient()
    const { data: visitorType } = await adminClient
      .from("visitor_types")
      .select("id, requires_training")
      .eq("id", visitor_type_id)
      .maybeSingle()

    let method: "video" | "prior_completion" | "code" | "not_required" = "not_required"
    let source: "kiosk" | "prior" | "training_link" = "kiosk"
    if (visitorType?.requires_training) {
      const training = (raw.training as Record<string, unknown> | undefined) || {}
      const proof = parseTrainingProof(raw.training)
      const priorRequested = training.prior === true
      const via = training.via === "link" || training.via === "code" ? training.via : null
      const clearance = await getTrainingClearance(adminClient, email, visitor_type_id)

      if (priorRequested && via === "code") {
        const codeCheck = readTrainingCodeProof(training.codeToken, {
          email: email || undefined,
          visitorTypeId: visitor_type_id,
        })
        if (!codeCheck.ok || !clearance.cleared) {
          return NextResponse.json(
            { error: "Enter the code from your email, or watch the video.", code: "training_code_required" },
            { status: 409 },
          )
        }
        method = "code"
        source = "prior"
      } else if (priorRequested && via === "link") {
        if (clearance.skipKind !== "link") {
          return NextResponse.json(
            { error: "Enter the code from your email, or watch the video.", code: "training_code_required" },
            { status: 409 },
          )
        }
        method = "prior_completion"
        source = "training_link"
      } else if (
        priorRequested &&
        (clearance.cleared || (await hasValidTrainingForVisitor(adminClient, visitor_id, visitor_type_id)))
      ) {
        method = "prior_completion"
        source = clearance.skipKind === "link" ? "training_link" : "prior"
      } else {
        const minWatchMs = requiredWatchMs(proof.videoSeconds) ?? kioskMinWatchMs()
        const check = verifyTrainingProof(proof, {
          visitorTypeId: visitor_type_id,
          scope: KIOSK_TRAINING_SCOPE,
          minWatchMs,
        })
        if (!check.ok) {
          return NextResponse.json({ error: check.message, code: check.code }, { status: 409 })
        }
        method = "video"
        source = "kiosk"
      }
    }

    const recorded = await recordTrainingCompletion(adminClient, {
      visitorId: visitor_id,
      visitorTypeId: visitor_type_id,
      source,
      expiresAt: expires_at,
    })
    if (!recorded.ok) {
      console.error("[API] Training completion insert error:", recorded.error)
      return NextResponse.json({ error: "Failed to record training" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      completion: { visitor_id, visitor_type_id, expires_at: recorded.expiresAt || defaultTrainingExpiresAt() },
      method,
    })
  } catch (error) {
    console.error("[API] Create training completion error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
