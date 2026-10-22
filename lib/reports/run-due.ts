import { createAdminClient } from "@/lib/supabase/server"
import {
  advanceNextRun,
  claimScheduledRun,
  finishRun,
  listDueSchedules,
  periodForSchedule,
} from "@/lib/reports/schedule"
import { buildReport, sendBuiltReport } from "@/lib/reports/run"

export type DueReportsResult =
  | {
      ok: true
      success: true
      timestamp: string
      due: number
      results: Array<Record<string, unknown>>
    }
  | {
      ok: true
      success: true
      skipped: "missing_tables"
      timestamp: string
    }
  | {
      ok: false
      error: string
    }

export async function runDueReports(): Promise<DueReportsResult> {
  const admin = createAdminClient()
  const now = new Date()
  let due
  try {
    due = await listDueSchedules(admin, now)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load schedules"
    return { ok: false, error: message }
  }

  const results: Array<Record<string, unknown>> = []

  for (const schedule of due) {
    const period = periodForSchedule(schedule, now)
    let claimed
    try {
      claimed = await claimScheduledRun(admin, {
        scheduleId: schedule.id,
        periodStart: period.runStart.toISOString(),
        periodEnd: period.end.toISOString(),
        recipients: schedule.recipients,
        now,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "claim_failed"
      if (message.includes("42P01")) {
        return {
          ok: true,
          success: true,
          skipped: "missing_tables",
          timestamp: now.toISOString(),
        }
      }
      results.push({ id: schedule.id, error: message })
      continue
    }

    if (claimed.skip) {
      const next = await advanceNextRun(admin, schedule, new Date(Math.max(now.getTime(), new Date(schedule.nextRunAt || now).getTime())))
      results.push({ id: schedule.id, skipped: claimed.reason, nextRunAt: next })
      continue
    }

    try {
      const report = await buildReport(admin, {
        kind: schedule.kind,
        locationIds: schedule.locationIds,
        visitorTypeIds: schedule.visitorTypeIds,
        from: period.start.toISOString(),
        to: period.end.toISOString(),
      })
      const sent = await sendBuiltReport({
        admin,
        scheduleName: schedule.name,
        kind: schedule.kind,
        format: schedule.format,
        recipients: schedule.recipients,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        timezone: schedule.timezone,
        locationIds: schedule.locationIds,
        report,
      })
      if (!sent.sent) {
        await finishRun(admin, claimed.id, {
          status: "failed",
          rowCount: report.rowCount,
          error: sent.reason || "send_failed",
        })
        await admin.from("audit_logs").insert({
          action: "report.failed",
          entity_type: "report",
          entity_id: schedule.id,
          description: `Scheduled send failed for ${schedule.name}: ${sent.reason || "send_failed"}`,
          metadata: { trigger: "scheduled", runId: claimed.id, reason: sent.reason },
        })
        results.push({ id: schedule.id, error: sent.reason || "send_failed" })
      } else {
        await finishRun(admin, claimed.id, { status: "sent", rowCount: report.rowCount })
        await admin.from("audit_logs").insert({
          action: "report.sent",
          entity_type: "report",
          entity_id: schedule.id,
          description: `Sent ${schedule.name} (${report.rowCount} rows)`,
          metadata: { trigger: "scheduled", runId: claimed.id, rowCount: report.rowCount },
        })
        results.push({ id: schedule.id, sent: true, rowCount: report.rowCount })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "send_failed"
      await finishRun(admin, claimed.id, { status: "failed", error: message })
      await admin.from("audit_logs").insert({
        action: "report.failed",
        entity_type: "report",
        entity_id: schedule.id,
        description: `Scheduled send failed for ${schedule.name}: ${message}`,
        metadata: { trigger: "scheduled", runId: claimed.id },
      })
      results.push({ id: schedule.id, error: message })
    }

    await advanceNextRun(
      admin,
      schedule,
      new Date(Math.max(now.getTime(), new Date(schedule.nextRunAt || now).getTime())),
    )
  }

  return {
    ok: true,
    success: true,
    timestamp: now.toISOString(),
    due: due.length,
    results,
  }
}
