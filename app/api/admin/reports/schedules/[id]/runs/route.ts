import { NextResponse } from "next/server"
import { requireBuiltInAdmin } from "@/lib/admin-auth"
import { isUndefinedTable } from "@/lib/idempotency"
import { createAdminClient } from "@/lib/supabase/server"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireBuiltInAdmin()
  if (!auth.ok) return auth.response
  const { id } = await context.params

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("report_runs")
    .select("*")
    .eq("schedule_id", id)
    .order("started_at", { ascending: false })
    .limit(50)

  if (error) {
    if (isUndefinedTable(error)) return NextResponse.json({ runs: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    runs: (data || []).map((row) => ({
      id: row.id,
      scheduleId: row.schedule_id,
      trigger: row.trigger,
      status: row.status,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      rowCount: row.row_count,
      recipients: row.recipients || [],
      error: row.error,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    })),
  })
}
