import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { syncAzureUsers } from "@/lib/sync/azure"
import { syncRampVendors } from "@/lib/sync/ramp"

// Schedule frequency options mapped to milliseconds
const SCHEDULE_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "168h": 7 * 24 * 60 * 60 * 1000,
}

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
  // Check if exists
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

/**
 * Determines if a sync is due, respecting start date/time and frequency.
 * - If start date is in the future, skip (not yet time).
 * - If start date is in the past (or empty), check if enough time has passed
 *   since lastSync based on the frequency interval.
 * - If never synced before, sync now (as long as start date has passed).
 */
function isDue(schedule: string, lastSyncIso: string | null, startDateIso: string | null): boolean {
  if (schedule === "off" || !SCHEDULE_MS[schedule]) return false

  const now = Date.now()

  // If a start date is set and it's in the future, don't run yet
  if (startDateIso) {
    const startTime = new Date(startDateIso).getTime()
    if (!Number.isNaN(startTime) && startTime > now) return false
  }

  // Never synced before -- run now
  if (!lastSyncIso) return true

  const lastSync = new Date(lastSyncIso).getTime()
  const interval = SCHEDULE_MS[schedule]
  return now - lastSync >= interval
}

/**
 * POST handler -- called by Vercel Cron every hour.
 * Checks schedule settings and runs Azure AD / Ramp syncs when due.
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminClient = createAdminClient()

    // Read schedule settings including start dates
    const [azureSchedule, rampSchedule, azureStart, rampStart, lastAzureSync, lastRampSync] =
      await Promise.all([
        getSetting(adminClient, "sync_schedule_azure"),
        getSetting(adminClient, "sync_schedule_ramp"),
        getSetting(adminClient, "sync_start_azure"),
        getSetting(adminClient, "sync_start_ramp"),
        getSetting(adminClient, "last_azure_sync"),
        getSetting(adminClient, "last_ramp_sync"),
      ])

    const results: {
      azure?: { ran: boolean; synced?: number; total?: number; error?: string }
      ramp?: { ran: boolean; synced?: number; total?: number; error?: string }
    } = {}

    // Azure AD sync
    if (isDue(azureSchedule || "off", lastAzureSync, azureStart)) {
      try {
        const result = await syncAzureUsers(adminClient, { syncPhotos: false })
        await upsertSetting(
          adminClient,
          "last_azure_sync",
          new Date().toISOString()
        )
        results.azure = {
          ran: true,
          synced: result.synced,
          total: result.total,
        }

        // Log to audit
        await adminClient.from("audit_logs").insert({
          action: "scheduled_sync.azure",
          entity_type: "system",
          description: `Scheduled Azure AD sync: ${result.synced}/${result.total} users synced${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Azure sync failed"
        results.azure = { ran: true, error: message }

        await adminClient.from("audit_logs").insert({
          action: "scheduled_sync.azure_error",
          entity_type: "system",
          description: `Scheduled Azure AD sync failed: ${message}`,
        })
      }
    } else {
      results.azure = { ran: false }
    }

    // Ramp vendor sync
    if (isDue(rampSchedule || "off", lastRampSync, rampStart)) {
      try {
        const result = await syncRampVendors(adminClient)
        await upsertSetting(
          adminClient,
          "last_ramp_sync",
          new Date().toISOString()
        )
        results.ramp = {
          ran: true,
          synced: result.synced,
          total: result.total,
        }

        await adminClient.from("audit_logs").insert({
          action: "scheduled_sync.ramp",
          entity_type: "system",
          description: `Scheduled Ramp sync: ${result.synced}/${result.total} vendors synced${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Ramp sync failed"
        results.ramp = { ran: true, error: message }

        await adminClient.from("audit_logs").insert({
          action: "scheduled_sync.ramp_error",
          entity_type: "system",
          description: `Scheduled Ramp sync failed: ${message}`,
        })
      }
    } else {
      results.ramp = { ran: false }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
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

// GET for status check
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/cron/scheduled-sync",
    description:
      "Runs scheduled Azure AD and Ramp syncs based on settings configuration",
    method: "POST",
    authentication: "Bearer token using CRON_SECRET environment variable",
  })
}
