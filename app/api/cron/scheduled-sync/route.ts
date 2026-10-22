import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { syncAzureUsers } from "@/lib/sync/azure"
import { syncRampVendors } from "@/lib/sync/ramp"
import { isSyncDue, parseSyncRequest, shouldRunProvider } from "@/lib/sync/schedule"

function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Read a setting value from the settings table (global, location_id IS NULL)
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
    .single()
  if (!data) return null
  return typeof data.value === "string" ? data.value : JSON.stringify(data.value)
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
    .single()

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
  synced?: number
  total?: number
  created?: number
  updated?: number
  deactivated?: number
  errors?: number
  error?: string
}

/**
 * Core sync logic shared by both GET (scheduler) and POST (manual) triggers.
 * Providers run independently so one failure never blocks the other.
 */
async function runScheduledSync(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json(
        { error: "Server is not configured: CRON_SECRET is not set." },
        { status: 500 },
      )
    }
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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

    const azureDue = isSyncDue(azureSchedule || "off", lastAzureSync, azureStart)
    const rampDue = isSyncDue(rampSchedule || "off", lastRampSync, rampStart)
    const runAzure = shouldRunProvider(provider, "azure", azureDue)
    const runRamp = shouldRunProvider(provider, "ramp", rampDue)

    const results: { azure?: ProviderResult; ramp?: ProviderResult } = {}

    const azureTask = (async () => {
      if (!runAzure) {
        results.azure = {
          ran: false,
          reason: provider !== "all" ? `provider=${provider}` : "not_due",
        }
        return
      }
      try {
        const result = await syncAzureUsers(adminClient, { syncPhotos: false, dryRun })
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
          synced: result.synced,
          total: result.total,
          created: result.created,
          updated: result.updated,
          deactivated: result.deactivated,
          errors: result.errors.length,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Azure sync failed"
        results.azure = { ran: true, error: message }
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
        results.ramp = {
          ran: false,
          reason: provider !== "all" ? `provider=${provider}` : "not_due",
        }
        return
      }
      try {
        const result = await syncRampVendors(adminClient, { dryRun })
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
          synced: result.synced,
          total: result.total,
          deactivated: result.deactivated,
          errors: result.errors.length,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ramp sync failed"
        results.ramp = { ran: true, error: message }
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

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dryRun,
      provider,
      schedules: {
        azure: azureSchedule || "off",
        ramp: rampSchedule || "off",
      },
      results,
    })
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
