import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { requireCronSecret } from "@/lib/cron-auth"
import { executeProviderSync } from "@/lib/sync/execute"
import {
  explainSyncDue,
  parseSyncRequest,
  shouldRunProvider,
  unwrapSettingValue,
  type SyncDueExplanation,
} from "@/lib/sync/schedule"

function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Read a setting value from the settings table (global, location_id IS NULL).
 * Use limit(1)+maybeSingle so a missing or duplicate row does not throw
 * and get treated as schedule "off".
 */
async function getSetting(
  adminClient: ReturnType<typeof createAdminClient>,
  key: string
): Promise<string | null> {
  const { data } = await adminClient
    .from("settings")
    .select("value")
    .eq("key", key)
    .is("location_id", null)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return unwrapSettingValue(data.value)
}

/**
 * Upsert a global setting
 */
async function upsertSetting(
  adminClient: ReturnType<typeof createAdminClient>,
  key: string,
  value: string
) {
  const { data: existing } = await adminClient
    .from("settings")
    .select("id")
    .eq("key", key)
    .is("location_id", null)
    .limit(1)
    .maybeSingle()

  if (existing) {
    await adminClient
      .from("settings")
      .update({ value })
      .eq("id", existing.id)
  } else {
    await adminClient.from("settings").insert({ key, value, location_id: null })
  }
}

type ProviderResult = {
  ran: boolean
  reason?: string
  due?: boolean
  schedule?: string
  lastSync?: string | null
  start?: string | null
  nextDueAt?: string | null
  synced?: number
  total?: number
  created?: number
  updated?: number
  deactivated?: number
  errors?: number
  error?: string
}

function planFields(plan: SyncDueExplanation): Pick<
  ProviderResult,
  "due" | "schedule" | "lastSync" | "start" | "nextDueAt"
> {
  return {
    due: plan.due,
    schedule: plan.normalizedSchedule,
    lastSync: plan.lastSync,
    start: plan.start,
    nextDueAt: plan.nextDueAt,
  }
}

function logProvider(name: string, result: ProviderResult) {
  const next = result.nextDueAt || "none"
  if (result.error) {
    console.error(`[scheduled-sync] ${name} error: ${result.error}; nextDueAt=${next}`)
    return
  }
  if (!result.ran) {
    console.info(`[scheduled-sync] ${name} skipped: ${result.reason || "not_due"}; due=${result.due === true}; nextDueAt=${next}`)
    return
  }
  console.info(
    `[scheduled-sync] ${name} ran: synced=${result.synced ?? 0} errors=${result.errors ?? 0}; nextDueAt=${next}`,
  )
}

/**
 * Core sync logic shared by both GET (scheduler) and POST (manual) triggers.
 * Providers run independently so one failure never blocks the other.
 */
async function runScheduledSync(request: Request) {
  try {
    const denied = requireCronSecret(request)
    if (denied) return denied

    const { provider, dryRun } = parseSyncRequest(request.url)
    const adminClient = createAdminClient()

    const [azureSchedule, rampSchedule, azureStart, rampStart, lastAzureSync, lastRampSync] =
      await Promise.all([
        getSetting(adminClient, "sync_schedule_azure"),
        getSetting(adminClient, "sync_schedule_ramp"),
        getSetting(adminClient, "sync_start_azure"),
        getSetting(adminClient, "sync_start_ramp"),
        getSetting(adminClient, "last_azure_sync"),
        getSetting(adminClient, "last_ramp_sync"),
      ])

    const azurePlan = explainSyncDue(azureSchedule || "off", lastAzureSync, azureStart)
    const rampPlan = explainSyncDue(rampSchedule || "off", lastRampSync, rampStart)
    const runAzure = shouldRunProvider(provider, "azure", azurePlan.due)
    const runRamp = shouldRunProvider(provider, "ramp", rampPlan.due)

    const results: { azure?: ProviderResult; ramp?: ProviderResult } = {}

    const azureTask = (async () => {
      if (!runAzure) {
        const reason = provider !== "all" ? `provider=${provider}` : azurePlan.reason
        results.azure = { ran: false, reason, ...planFields(azurePlan) }
        logProvider("azure", results.azure)
        return
      }
      try {
        const out = await executeProviderSync(adminClient, {
          provider: "azure",
          trigger: "cron",
          dryRun,
          syncPhotos: false,
        })
        if (!out.ok || !out.result) {
          const message = out.error || "Azure sync failed"
          results.azure = { ran: true, reason: "due", error: message, ...planFields(azurePlan) }
          logProvider("azure", results.azure)
          if (!dryRun) {
            await adminClient.from("audit_logs").insert({
              action: "scheduled_sync.azure_error",
              entity_type: "system",
              description: `Scheduled Azure AD sync failed: ${message}`,
            })
          }
          return
        }
        const result = out.result
        if (!dryRun) {
          await upsertSetting(adminClient, "last_azure_sync", new Date().toISOString())
          await adminClient.from("audit_logs").insert({
            action: "scheduled_sync.azure",
            entity_type: "system",
            description: `Scheduled Azure AD sync: ${result.synced}/${result.total} users synced, ${result.deactivated} deactivated${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
          })
        }
        results.azure = {
          ran: true,
          reason: "due",
          ...planFields(azurePlan),
          synced: result.synced,
          total: result.total,
          created: "created" in result ? result.created : undefined,
          updated: "updated" in result ? result.updated : undefined,
          deactivated: result.deactivated,
          errors: result.errors.length,
        }
        logProvider("azure", results.azure)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Azure sync failed"
        results.azure = { ran: true, reason: "due", error: message, ...planFields(azurePlan) }
        logProvider("azure", results.azure)
        if (!dryRun) {
          await adminClient.from("audit_logs").insert({
            action: "scheduled_sync.azure_error",
            entity_type: "system",
            description: `Scheduled Azure AD sync failed: ${message}`,
          })
        }
      }
    })()

    const rampTask = (async () => {
      if (!runRamp) {
        const reason = provider !== "all" ? `provider=${provider}` : rampPlan.reason
        results.ramp = { ran: false, reason, ...planFields(rampPlan) }
        logProvider("ramp", results.ramp)
        return
      }
      try {
        const out = await executeProviderSync(adminClient, {
          provider: "ramp",
          trigger: "cron",
          dryRun,
        })
        if (!out.ok || !out.result) {
          const message = out.error || "Ramp sync failed"
          results.ramp = { ran: true, reason: "due", error: message, ...planFields(rampPlan) }
          logProvider("ramp", results.ramp)
          if (!dryRun) {
            await adminClient.from("audit_logs").insert({
              action: "scheduled_sync.ramp_error",
              entity_type: "system",
              description: `Scheduled Ramp sync failed: ${message}`,
            })
          }
          return
        }
        const result = out.result
        if (!dryRun) {
          await upsertSetting(adminClient, "last_ramp_sync", new Date().toISOString())
          await adminClient.from("audit_logs").insert({
            action: "scheduled_sync.ramp",
            entity_type: "system",
            description: `Scheduled Ramp sync: ${result.synced}/${result.total} vendors synced, ${result.deactivated} deactivated${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
          })
        }
        results.ramp = {
          ran: true,
          reason: "due",
          ...planFields(rampPlan),
          synced: result.synced,
          total: result.total,
          deactivated: result.deactivated,
          errors: result.errors.length,
        }
        logProvider("ramp", results.ramp)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ramp sync failed"
        results.ramp = { ran: true, reason: "due", error: message, ...planFields(rampPlan) }
        logProvider("ramp", results.ramp)
        if (!dryRun) {
          await adminClient.from("audit_logs").insert({
            action: "scheduled_sync.ramp_error",
            entity_type: "system",
            description: `Scheduled Ramp sync failed: ${message}`,
          })
        }
      }
    })()

    await Promise.all([azureTask, rampTask])

    const failed = Boolean(results.azure?.error || results.ramp?.error)
    return NextResponse.json(
      {
        success: !failed,
        timestamp: new Date().toISOString(),
        dryRun,
        provider,
        schedules: {
          azure: azurePlan.normalizedSchedule,
          ramp: rampPlan.normalizedSchedule,
        },
        results,
      },
      { status: failed ? 500 : 200 },
    )
  } catch (error) {
    console.error("Scheduled sync error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Scheduled sync failed",
      },
      { status: 500 }
    )
  }
}

/**
 * GET/POST handler. Production runs on Render; call with
 * Authorization: Bearer $CRON_SECRET from the hourly cron or a manual curl.
 * Optional query: ?provider=azure|ramp and ?dryRun=1 (still requires CRON_SECRET).
 */
export async function GET(request: Request) {
  return runScheduledSync(request)
}

export async function POST(request: Request) {
  return runScheduledSync(request)
}
