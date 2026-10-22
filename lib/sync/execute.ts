import type { SupabaseClient } from "@supabase/supabase-js"
import { syncAzureUsers, type AzureSyncResult, type SyncOptions } from "@/lib/sync/azure"
import { syncRampVendors, type RampSyncResult, type RampSyncOptions } from "@/lib/sync/ramp"
import {
  createSyncRun,
  emptySyncCounts,
  supabaseSyncRunStore,
  type SyncProgressReporter,
  type SyncRunCounts,
  type SyncRunProvider,
  type SyncRunStore,
  type SyncRunTrigger,
} from "@/lib/sync/runs"

export interface ExecuteSyncResult {
  ok: boolean
  provider: SyncRunProvider
  trigger: SyncRunTrigger
  dryRun: boolean
  runId: string | null
  result?: AzureSyncResult | RampSyncResult
  error?: string
}

export interface ExecuteSyncFns {
  azure?: (client: SupabaseClient, options: SyncOptions) => Promise<AzureSyncResult>
  ramp?: (client: SupabaseClient, options: RampSyncOptions) => Promise<RampSyncResult>
}

function countsFromResult(result: AzureSyncResult | RampSyncResult): SyncRunCounts {
  const created = "created" in result ? result.created : 0
  const updated = "updated" in result ? result.updated : 0
  return {
    synced: result.synced,
    created,
    updated,
    deactivated: result.deactivated,
    errors: result.errors,
  }
}

export async function executeProviderSync(
  adminClient: SupabaseClient,
  input: {
    provider: SyncRunProvider
    trigger: SyncRunTrigger
    dryRun?: boolean
    syncPhotos?: boolean
    store?: SyncRunStore
    fns?: ExecuteSyncFns
    run?: SyncProgressReporter
  },
): Promise<ExecuteSyncResult> {
  const dryRun = input.dryRun === true
  const store = input.store || supabaseSyncRunStore(adminClient)
  const handle = input.run || (await createSyncRun(store, {
    provider: input.provider,
    trigger: input.trigger,
    dryRun,
  }))

  const azureFn = input.fns?.azure || syncAzureUsers
  const rampFn = input.fns?.ramp || syncRampVendors

  try {
    const result =
      input.provider === "azure"
        ? await azureFn(adminClient, {
            syncPhotos: input.syncPhotos === true,
            dryRun,
            progress: handle,
          })
        : await rampFn(adminClient, { dryRun, progress: handle })

    const counts = countsFromResult(result)
    const failedHard = result.errors.length > 0 && result.synced === 0
    if (failedHard) {
      await handle.fail(result.errors[0] || "Sync failed", counts)
      return {
        ok: false,
        provider: input.provider,
        trigger: input.trigger,
        dryRun,
        runId: handle.id,
        result,
        error: result.errors[0] || "Sync failed",
      }
    }

    await handle.succeed(counts)
    return {
      ok: true,
      provider: input.provider,
      trigger: input.trigger,
      dryRun,
      runId: handle.id,
      result,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed"
    await handle.fail(message, emptySyncCounts())
    return {
      ok: false,
      provider: input.provider,
      trigger: input.trigger,
      dryRun,
      runId: handle.id,
      error: message,
    }
  }
}
