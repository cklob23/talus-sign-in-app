import { NextResponse } from "next/server"
import { requireBuiltInAdmin } from "@/lib/admin-auth"
import { isUndefinedTable } from "@/lib/idempotency"
import { createAdminClient } from "@/lib/supabase/server"
import { hydrateSchedule, nextRunIso, parseScheduleBody, scheduleToRow } from "@/lib/reports/schedule"

export async function GET() {
  const auth = await requireBuiltInAdmin()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("report_schedules")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    if (isUndefinedTable(error)) return NextResponse.json({ schedules: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ schedules: (data || []).map((row) => hydrateSchedule(row)) })
}

export async function POST(request: Request) {
  const auth = await requireBuiltInAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

  const parsed = parseScheduleBody(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const nextRunAt = parsed.value.enabled ? nextRunIso(parsed.value) : null
  const admin = createAdminClient()
  const inserted = await admin
    .from("report_schedules")
    .insert(scheduleToRow(parsed.value, nextRunAt, auth.user.userId))
    .select("*")
    .single()

  if (inserted.error || !inserted.data) {
    if (isUndefinedTable(inserted.error)) {
      return NextResponse.json({ error: "Report schedules are not set up yet. Run scripts/013-reports.sql." }, { status: 503 })
    }
    return NextResponse.json({ error: inserted.error?.message || "Failed to create schedule" }, { status: 500 })
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.userId,
    action: "report.schedule_created",
    entity_type: "report",
    entity_id: inserted.data.id,
    description: `Created report schedule ${parsed.value.name}`,
    metadata: { kind: parsed.value.kind, recipients: parsed.value.recipients },
  })

  return NextResponse.json({ schedule: hydrateSchedule(inserted.data) }, { status: 201 })
}
