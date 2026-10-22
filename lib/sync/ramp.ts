import type { SupabaseClient } from "@supabase/supabase-js"
import { collectPages, rampPageItems } from "@/lib/sync/schedule"
import type { SyncProgressReporter } from "@/lib/sync/runs"

const RAMP_API_BASE =
  process.env.RAMP_API_BASE || "https://api.ramp.com/developer/v1"
const VENDOR_BATCH = 100

export interface RampSyncResult {
  synced: number
  total: number
  deactivated: number
  errors: string[]
}

export interface RampSyncOptions {
  /** Skip upserts and deactivations. Fetch and count only. */
  dryRun?: boolean
  /** Optional live progress writer for sync_runs. */
  progress?: SyncProgressReporter
}

interface RampVendor {
  id: string
  name: string
  name_legal?: string
  is_active: boolean
  country?: string
  state?: string
  description?: string
  category_name?: string
  [key: string]: unknown
}

/**
 * Obtain a bearer token from Ramp using OAuth2 or a static API token.
 */
export async function getRampAccessToken(): Promise<string> {
  const staticToken = process.env.RAMP_API_TOKEN
  if (staticToken) return staticToken

  const clientId = process.env.RAMP_CLIENT_ID
  const clientSecret = process.env.RAMP_CLIENT_SECRET

  if (clientId && clientSecret) {
    const tokenUrl = `${RAMP_API_BASE}/token`

    const attempts = [
      () =>
        fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "vendors:read",
            client_id: clientId,
            client_secret: clientSecret,
          }).toString(),
        }),
      () =>
        fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "vendors:read",
          }).toString(),
        }),
    ]

    let lastError = ""
    for (const attempt of attempts) {
      const response = await attempt()
      const responseText = await response.text()

      if (!response.ok) {
        lastError = `Token request failed (${response.status}): ${responseText || "(empty)"}`
        continue
      }

      if (!responseText || responseText.trim().length === 0) {
        lastError = `Token endpoint returned empty body (${response.status})`
        continue
      }

      try {
        const tokenData = JSON.parse(responseText)
        if (tokenData.access_token) return tokenData.access_token
        lastError = `Token response missing access_token`
      } catch {
        lastError = `Token response is not valid JSON`
      }
    }

    throw new Error(`Ramp OAuth failed: ${lastError}`)
  }

  throw new Error(
    "Ramp API credentials not configured. Set RAMP_API_TOKEN or RAMP_CLIENT_ID + RAMP_CLIENT_SECRET."
  )
}

/**
 * Fetch all vendors from Ramp. Follows page.next until Ramp returns null.
 */
export async function fetchRampVendors(
  accessToken: string
): Promise<RampVendor[]> {
  const firstUrl = `${RAMP_API_BASE}/vendors?page_size=100`

  return collectPages(firstUrl, async (url) => {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Ramp API error: ${response.status} - ${errText}`)
    }

    return rampPageItems<RampVendor>(await response.json())
  })
}

/**
 * Full sync: fetch all Ramp vendors, upsert to vendors table, then
 * deactivate local Ramp-linked vendors that are no longer upstream.
 *
 * Behavior change: previously this was upsert-only, so a vendor removed
 * in Ramp stayed active locally. After a successful non-empty fetch,
 * rows with a ramp_vendor_id that is missing from the latest Ramp list
 * are set is_active=false. Locally created vendors (null ramp_vendor_id)
 * are not touched. Ramp's own is_active=false is still mirrored on upsert.
 */
export async function syncRampVendors(
  adminClient: SupabaseClient,
  options: RampSyncOptions = {},
): Promise<RampSyncResult> {
  const dryRun = options.dryRun === true
  const progress = options.progress
  await progress?.setPhase("Fetching Ramp vendors")
  const rampToken = await getRampAccessToken()
  const allVendors = await fetchRampVendors(rampToken)

  const now = new Date().toISOString()
  let synced = 0
  const errors: string[] = []
  const seenIds = new Set(allVendors.map((v) => v.id))
  const upsertBatches = Math.max(1, Math.ceil(allVendors.length / VENDOR_BATCH))

  if (!dryRun) {
    for (let i = 0; i < allVendors.length; i += VENDOR_BATCH) {
      const batchNumber = Math.floor(i / VENDOR_BATCH) + 1
      await progress?.setPhase(`Upserting batch ${batchNumber} of ${upsertBatches}`, i, allVendors.length)
      const batch = allVendors.slice(i, i + VENDOR_BATCH).map((v) => ({
        ramp_vendor_id: v.id,
        name: v.name,
        name_legal: v.name_legal || null,
        is_active: v.is_active !== false,
        country: v.country || null,
        state: v.state || null,
        description: v.description || null,
        category_name: v.category_name || null,
        synced_at: now,
      }))

      const { error, count } = await adminClient
        .from("vendors")
        .upsert(batch, { onConflict: "ramp_vendor_id", count: "exact" })

      if (error) {
        console.error(`Ramp batch ${batchNumber} error:`, error)
        errors.push(`Batch ${batchNumber}: ${error.message}`)
      } else {
        synced += count || batch.length
      }
      await progress?.setCounts({ synced, deactivated: 0, errors })
    }
  } else {
    synced = allVendors.length
    await progress?.setPhase("Dry run: counting Ramp vendors", allVendors.length, allVendors.length)
  }

  // Same safety as Entra: never treat a failed or empty fetch as "everyone left".
  let deactivated = 0
  if (allVendors.length > 0) {
    const { data: managed } = await adminClient
      .from("vendors")
      .select("id, ramp_vendor_id, is_active")
      .not("ramp_vendor_id", "is", null)
      .eq("is_active", true)

    const stale = (managed || []).filter(
      (v) => v.ramp_vendor_id && !seenIds.has(v.ramp_vendor_id),
    )
    deactivated = stale.length
    await progress?.setPhase(
      stale.length === 0 ? "No stale vendors to deactivate" : "Deactivating stale vendors",
      0,
      stale.length,
    )

    if (!dryRun && stale.length > 0) {
      for (let i = 0; i < stale.length; i += VENDOR_BATCH) {
        const batchNumber = Math.floor(i / VENDOR_BATCH) + 1
        const ids = stale.slice(i, i + VENDOR_BATCH).map((v) => v.ramp_vendor_id).filter(Boolean)
        const { error } = await adminClient
          .from("vendors")
          .update({ is_active: false, synced_at: now })
          .in("ramp_vendor_id", ids)
        if (error) {
          deactivated -= ids.length
          errors.push(`Deactivate chunk ${batchNumber}: ${error.message}`)
        }
        await progress?.setPhase(
          `Deactivating stale vendors`,
          Math.min(i + ids.length, stale.length),
          stale.length,
        )
      }
    }
  }

  await progress?.setCounts({ synced, deactivated, errors })
  return { synced, total: allVendors.length, deactivated, errors }
}
