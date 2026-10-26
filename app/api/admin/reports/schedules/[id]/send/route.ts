import { NextResponse } from "next/server"
import { requireBuiltInAdmin } from "@/lib/admin-auth"
import { isUndefinedTable } from "@/lib/idempotency"
import { resolveAppOrigin } from "@/lib/nda"
import { createAdminClient } from "@/lib/supabase/server"
import { finishRun, hydrateSchedule, insertManualRun, periodForSchedule } from "@/lib/reports/schedule"
import { buildReport, sendBuiltReport } from "@/lib/reports/run"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireBuiltInAdmin()
  if (!auth.ok) return auth.response
  const { id } = await context.params

  const admin = createAdminClient()
  const { data, error } = await admin.from("report_schedules").select("*").eq("id", id).maybeSingle()
  if (error) {
    if (isUndefinedTable(error)) {
      return NextResponse.json({ error: "Report schedules are not set up yet. Run scripts/013-reports.sql." }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const schedule = hydrateSchedule(data)
  const period = periodForSchedule(schedule)
  const runId = await insertManualRun(admin, {
    scheduleId: schedule.id,
    periodStart: period.runStart.toISOString(),
    periodEnd: period.end.toISOString(),
    recipients: schedule.recipients,
  })

  try {
    const report = await buildReport(
      admin,
      {
        kind: schedule.kind,
        locationIds: schedule.locationIds,
        visitorTypeIds: schedule.visitorTypeIds,
        from: period.start.toISOString(),
        to: period.end.toISOString(),
      },
      Date.now(),
      schedule.durationUnit,
    )
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
      durationUnit: schedule.durationUnit,
      includeTable: schedule.includeTable,
      visitorTypeIds: schedule.visitorTypeIds,
      origin: resolveAppOrigin(request),
    })
    if (!sent.sent) {
      await finishRun(admin, runId, { status: "failed", rowCount: report.rowCount, error: sent.reason || "send_failed" })
      await admin.from("audit_logs").insert({
        user_id: auth.user.userId,
        action: "report.failed",
        entity_type: "report",
        entity_id: schedule.id,
        description: `Manual send failed for ${schedule.name}: ${sent.reason || "send_failed"}`,
        metadata: { trigger: "manual", runId, reason: sent.reason },
      })
      return NextResponse.json({ error: sent.reason || "Failed to send report" }, { status: 502 })
    }
    await finishRun(admin, runId, { status: "sent", rowCount: report.rowCount })
    await admin.from("audit_logs").insert({
      user_id: auth.user.userId,
      action: "report.sent",
      entity_type: "report",
      entity_id: schedule.id,
      description: `Sent ${schedule.name} (${report.rowCount} rows)`,
      metadata: { trigger: "manual", runId, rowCount: report.rowCount },
    })
    return NextResponse.json({ ok: true, runId, rowCount: report.rowCount })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send report"
    await finishRun(admin, runId, { status: "failed", error: message })
    await admin.from("audit_logs").insert({
      user_id: auth.user.userId,
      action: "report.failed",
      entity_type: "report",
      entity_id: schedule.id,
      description: `Manual send failed for ${schedule.name}: ${message}`,
      metadata: { trigger: "manual", runId },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
