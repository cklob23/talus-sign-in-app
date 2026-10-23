import { NextResponse } from "next/server"
import { requireCronSecret } from "@/lib/cron-auth"
import { runBookingInviteCron } from "@/lib/booking-invite-cron"

async function run(request: Request) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  const result = await runBookingInviteCron(request)
  return NextResponse.json(result)
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
