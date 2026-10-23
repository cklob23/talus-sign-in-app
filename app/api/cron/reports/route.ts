import { NextResponse } from "next/server"
import { requireCronSecret } from "@/lib/cron-auth"
import { runBookingInviteCron } from "@/lib/booking-invite-cron"
import { runDueReports } from "@/lib/reports/run-due"

type IsolatedJob = { ok: boolean; value: Record<string, unknown> }

function asResult(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>
  return { error: "failed" }
}

async function runIsolated(run: () => Promise<unknown>): Promise<IsolatedJob> {
  try {
    const value = asResult(await run())
    return { ok: value.ok !== false, value }
  } catch (error) {
    return {
      ok: false,
      value: { error: error instanceof Error ? error.message : "failed" },
    }
  }
}

/**
 * Render cron talus-reports (every 15 minutes) POSTs this with
 * Authorization: Bearer $CRON_SECRET. The dashboard command cannot be
 * changed, so this endpoint also runs booking invites in the same request.
 * /api/cron/booking-invites remains available; claim/sent markers keep a
 * later dual-command setup from double-sending.
 */
export async function POST(request: Request) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  // Independent: a throw in one job must not skip the other.
  const bookingInvites = await runIsolated(() => runBookingInviteCron(request))
  const reports = await runIsolated(() => runDueReports())

  const status = bookingInvites.ok && reports.ok ? 200 : 500
  return NextResponse.json(
    { bookingInvites: bookingInvites.value, reports: reports.value },
    { status },
  )
}

export async function GET(request: Request) {
  return POST(request)
}
