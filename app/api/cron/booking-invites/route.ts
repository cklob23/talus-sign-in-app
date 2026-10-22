import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireCronSecret } from "@/lib/cron-auth"
import { processDueBookingInvites, supabaseInviteStore } from "@/lib/booking-invite"
import { deliverBookingInvite } from "@/lib/booking-invite-send"

function cronOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, "")
  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto")
  if (forwardedHost) return `${forwardedProto ?? "https"}://${forwardedHost}`
  try {
    return new URL(request.url).origin
  } catch {
    return ""
  }
}

async function run(request: Request) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  const admin = getAdminClient()
  const origin = cronOrigin(request)
  const result = await processDueBookingInvites({
    store: supabaseInviteStore(admin),
    send: (booking) =>
      deliverBookingInvite({
        admin,
        booking,
        origin,
        actorUserId: null,
      }),
  })

  return NextResponse.json({ ok: true, ...result })
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
