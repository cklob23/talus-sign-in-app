import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { asOptionalEmail, asOptionalIsoDate, asRequiredUuid } from "@/lib/kiosk-input"
import {
  KIOSK_TRAINING_SCOPE,
  kioskMinWatchMs,
  parseTrainingProof,
  TRAINING_MESSAGES,
  verifyTrainingProof,
} from "@/lib/training-gate"
import { hasValidTrainingForEmail } from "@/lib/training-completions"

/**
 * Record a training completion for a kiosk visitor.
 *
 * For a visitor type that requires training the request must prove it: either
 * the signed ticket from /api/kiosk/training/start (old enough to cover the
 * video) plus the acknowledgement, the group "already watched" option plus
 * the acknowledgement, or a still-valid earlier completion for the same email.
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

    let method: "video" | "group_bypass" | "prior_completion" | "not_required" = "not_required"
    if (visitorType?.requires_training) {
      const proof = parseTrainingProof(raw.training)
      const priorRequested = (raw.training as { prior?: unknown } | undefined)?.prior === true
      if (priorRequested && (await hasValidTrainingForEmail(adminClient, email, visitor_type_id))) {
        method = "prior_completion"
      } else if (proof.bypass) {
        if (!proof.acknowledged) {
          return NextResponse.json(
            { error: TRAINING_MESSAGES.training_not_acknowledged, code: "training_not_acknowledged" },
            { status: 409 },
          )
        }
        method = "group_bypass"
      } else {
        const check = verifyTrainingProof(proof, {
          visitorTypeId: visitor_type_id,
          scope: KIOSK_TRAINING_SCOPE,
          minWatchMs: kioskMinWatchMs(),
        })
        if (!check.ok) {
          return NextResponse.json({ error: check.message, code: check.code }, { status: 409 })
        }
        method = "video"
      }
    }

    const { data: completion, error: completionError } = await adminClient
      .from("training_completions")
      .insert({
        visitor_id,
        visitor_type_id,
        expires_at: expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (completionError) {
      console.error("[API] Training completion insert error:", completionError)
      return NextResponse.json({ error: "Failed to record training" }, { status: 500 })
    }

    return NextResponse.json({ success: true, completion, method })
  } catch (error) {
    console.error("[API] Create training completion error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
