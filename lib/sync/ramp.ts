import type { SupabaseClient } from "@supabase/supabase-js"

const RAMP_API_BASE =
  process.env.RAMP_API_BASE || "https://api.ramp.com/developer/v1"

export interface RampSyncResult {
  synced: number
  total: number
  errors: string[]
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

interface RampVendorResponse {
  data: RampVendor[]
  page: { next: string | null }
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
 * Fetch all vendors from Ramp (handles pagination)
 */
export async function fetchRampVendors(
  accessToken: string
): Promise<RampVendor[]> {
  const allVendors: RampVendor[] = []
  let nextUrl: string | null = `${RAMP_API_BASE}/vendors?page_size=100`

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Ramp API error: ${response.status} - ${errText}`)
    }

    const data: RampVendorResponse = await response.json()
    allVendors.push(...data.data)
    nextUrl = data.page?.next || null
  }

  return allVendors
}

/**
 * Full sync: fetch all Ramp vendors, upsert to vendors table.
 * Used by both the cron job and the manual sync route.
 */
export async function syncRampVendors(
  adminClient: SupabaseClient
): Promise<RampSyncResult> {
  const rampToken = await getRampAccessToken()
  const allVendors = await fetchRampVendors(rampToken)

  const now = new Date().toISOString()
  let synced = 0
  const errors: string[] = []

  const BATCH_SIZE = 100
  for (let i = 0; i < allVendors.length; i += BATCH_SIZE) {
    const batch = allVendors.slice(i, i + BATCH_SIZE).map((v) => ({
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
      console.error(`Ramp batch ${i / BATCH_SIZE + 1} error:`, error)
      errors.push(`Batch ${i / BATCH_SIZE + 1}: ${error.message}`)
    } else {
      synced += count || batch.length
    }
  }

  return { synced, total: allVendors.length, errors }
}
