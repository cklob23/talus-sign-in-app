import { NextResponse } from "next/server"
import { requireAdminApiUser } from "@/lib/admin-auth"
import { isUndefinedTable } from "@/lib/idempotency"
import { hasPermission } from "@/lib/permissions"
import { createAdminClient } from "@/lib/supabase/server"
import { filterSyncHistory, mergeSyncHistory, type AuditSyncLog } from "@/lib/sync/history"
import {
  displaySyncRunStatus,
  type SyncRunDisplayStatus,
  type SyncRunProvider,
  type SyncRunRow,
} from "@/lib/sync/runs"
import { getNextSyncAt } from "@/lib/sync/schedule"

const AUDIT_ACTIONS = [
  "scheduled_sync.azure",
  "scheduled_sync.azure_error",
  "scheduled_sync.ramp",
  "scheduled_sync.ramp_error",
]

function settingString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return typeof value === "string" ? value : String(value)
}

function providerSnapshot(
  schedule: string | null,
  lastSync: string | null,
  start: string | null,
) {
  const frequency = schedule || "off"
  const next = getNextSyncAt(frequency, lastSync, start)
  return {
    frequency,
    lastSync,
    start: start || "",
    dueNow: next.dueNow,
    nextAt: next.at ? next.at.toISOString() : null,
    scheduled: next.scheduled,
  }
}

export async function GET(request: Request) {
  const auth = await requireAdminApiUser()
  if (!auth.ok) return auth.response
  if (!hasPermission(auth.user.permissions, "settings")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const url = new URL(request.url)
  const provider = url.searchParams.get("provider")
  const status = url.searchParams.get("status")
  const providerFilter: SyncRunProvider | "all" =
    provider === "azure" || provider === "ramp" ? provider : "all"
  const statusFilter: SyncRunDisplayStatus | "all" =
    status === "queued" ||
    status === "running" ||
    status === "succeeded" ||
    status === "failed" ||
    status === "stale"
      ? status
      : "all"

  const admin = createAdminClient()
  const nowMs = Date.now()

  let runs: SyncRunRow[] = []
  const { data: runRows, error: runError } = await admin
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(150)

  if (runError && !isUndefinedTable(runError)) {
    return NextResponse.json({ error: runError.message }, { status: 500 })
  }
  if (runRows) {
    runs = runRows.map((row) => ({
      ...row,
      errors: Array.isArray(row.errors) ? row.errors : [],
    })) as SyncRunRow[]
  }

  const { data: auditRows } = await admin
    .from("audit_logs")
    .select("id, action, description, created_at")
    .in("action", AUDIT_ACTIONS)
    .order("created_at", { ascending: false })
    .limit(150)

  const merged = mergeSyncHistory(runs, (auditRows || []) as AuditSyncLog[], nowMs)
  const logs = filterSyncHistory(merged, { provider: providerFilter, status: statusFilter })
  const active = merged.filter((entry) => {
    const live = entry.status === "queued" || entry.status === "running"
    const recentFinish =
      (entry.status === "succeeded" || entry.status === "failed" || entry.status === "stale") &&
      entry.finishedAt &&
      nowMs - new Date(entry.finishedAt).getTime() < 60_000
    return (live || recentFinish) && entry.source === "sync_run"
  })

  const { data: settingRows } = await admin
    .from("settings")
    .select("key, value")
    .is("location_id", null)
    .in("key", [
      "sync_schedule_azure",
      "sync_schedule_ramp",
      "sync_start_azure",
      "sync_start_ramp",
      "last_azure_sync",
      "last_ramp_sync",
    ])

  const settings: Record<string, string | null> = {}
  for (const row of settingRows || []) {
    settings[row.key] = settingString(row.value)
  }

  return NextResponse.json({
    logs,
    active,
    staleAfterMs: 5 * 60 * 1000,
    now: new Date(nowMs).toISOString(),
    schedules: {
      azure: providerSnapshot(
        settings.sync_schedule_azure,
        settings.last_azure_sync,
        settings.sync_start_azure,
      ),
      ramp: providerSnapshot(
        settings.sync_schedule_ramp,
        settings.last_ramp_sync,
        settings.sync_start_ramp,
      ),
    },
    running: runs
      .filter((run) => displaySyncRunStatus(run, nowMs) === "running" || displaySyncRunStatus(run, nowMs) === "queued")
      .map((run) => run.id),
  })
}
