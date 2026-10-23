import { NextResponse } from "next/server"
import { requireBuiltInAdmin } from "@/lib/admin-auth"
import { isUndefinedColumn, isUndefinedTable } from "@/lib/idempotency"
import { createAdminClient } from "@/lib/supabase/server"
import { hydrateSchedule, nextRunIso, parseScheduleBody, scheduleToRow } from "@/lib/reports/schedule"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireBuiltInAdmin()
  if (!auth.ok) return auth.response
  const { id } = await context.params

  const admin = createAdminClient()
  const { data, error } = await admin.from("report_schedules").select("*").eq("id", id).maybeSingle()
  if (error) {
    if (isUndefinedTable(error)) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ schedule: hydrateSchedule(data) })
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireBuiltInAdmin()
  if (!auth.ok) return auth.response
  const { id } = await context.params

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

  const parsed = parseScheduleBody(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const nextRunAt = parsed.value.enabled ? nextRunIso(parsed.value) : null
  const admin = createAdminClient()
  const row = scheduleToRow(parsed.value, nextRunAt)
  let updated = await admin.from("report_schedules").update(row).eq("id", id).select("*").single()
  if (updated.error && isUndefinedColumn(updated.error)) {
    const { duration_unit: _durationUnit, ...withoutUnit } = row
    updated = await admin.from("report_schedules").update(withoutUnit).eq("id", id).select("*").single()
  }

  if (updated.error || !updated.data) {
    if (isUndefinedTable(updated.error)) {
      return NextResponse.json({ error: "Report schedules are not set up yet. Run scripts/013-reports.sql." }, { status: 503 })
    }
    return NextResponse.json({ error: updated.error?.message || "Failed to update schedule" }, { status: 500 })
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.userId,
    action: "report.schedule_updated",
    entity_type: "report",
    entity_id: id,
    description: `Updated report schedule ${parsed.value.name}`,
    metadata: { kind: parsed.value.kind, enabled: parsed.value.enabled },
  })

  return NextResponse.json({ schedule: hydrateSchedule(updated.data) })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireBuiltInAdmin()
  if (!auth.ok) return auth.response
  const { id } = await context.params

  const admin = createAdminClient()
  const { data: existing } = await admin.from("report_schedules").select("id, name").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { error } = await admin.from("report_schedules").delete().eq("id", id)
  if (error) {
    if (isUndefinedTable(error)) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.userId,
    action: "report.schedule_deleted",
    entity_type: "report",
    entity_id: id,
    description: `Deleted report schedule ${existing.name}`,
  })

  return NextResponse.json({ ok: true })
}
