import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/server"

// Use RAMP_API_BASE env var for flexibility (production vs sandbox)
const RAMP_API_BASE =
  process.env.RAMP_API_BASE || "https://api.ramp.com/developer/v1"

/**
 * Obtain a bearer token from Ramp using the OAuth2 client_credentials grant.
 *
 * Auth strategy (in priority order):
 * 1. RAMP_CLIENT_ID + RAMP_CLIENT_SECRET -> OAuth2 token exchange
 * 2. RAMP_API_TOKEN -> Direct bearer token (API key like rk_live_...)
 */
async function getRampAccessToken(): Promise<string> {
  // Strategy 1: Static API key / bearer token (simplest, most common)
  const staticToken = process.env.RAMP_API_TOKEN
  if (staticToken) return staticToken

  // Strategy 2: OAuth2 client_credentials flow
  const clientId = process.env.RAMP_CLIENT_ID
  const clientSecret = process.env.RAMP_CLIENT_SECRET

  if (clientId && clientSecret) {
    const tokenUrl = `${RAMP_API_BASE}/token`

    // Try both auth methods: form body params first, then Basic auth header
    const attempts = [
      // Attempt 1: credentials in form body
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
      // Attempt 2: credentials in Basic auth header
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
        lastError = `Token request failed (${response.status}): ${responseText || "(empty response)"}`
        continue
      }

      // Guard against empty response body
      if (!responseText || responseText.trim().length === 0) {
        lastError = `Token endpoint returned empty body (${response.status})`
        continue
      }

      try {
        const tokenData = JSON.parse(responseText)
        if (tokenData.access_token) return tokenData.access_token
        lastError = `Token response missing access_token: ${responseText}`
      } catch {
        lastError = `Token response is not valid JSON: ${responseText.slice(0, 200)}`
      }
    }

    throw new Error(`Ramp OAuth failed: ${lastError}`)
  }

  throw new Error(
    "Ramp API credentials not configured. Set RAMP_API_TOKEN (recommended), or RAMP_CLIENT_ID + RAMP_CLIENT_SECRET for OAuth."
  )
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

interface RampPage {
  next: string | null
}

interface RampVendorResponse {
  data: RampVendor[]
  page: RampPage
}

/**
 * GET - Preview vendors from Ramp before importing (like Azure AD user preview).
 * Returns the vendor list from Ramp without writing to DB.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminClient = getAdminClient()
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    let rampToken: string
    try {
      rampToken = await getRampAccessToken()
    } catch (authErr) {
      return NextResponse.json(
        { error: authErr instanceof Error ? authErr.message : "Failed to authenticate with Ramp" },
        { status: 500 }
      )
    }

    // Fetch all vendors from Ramp (paginated)
    const allVendors: RampVendor[] = []
    let nextUrl: string | null = `${RAMP_API_BASE}/vendors?page_size=100`

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${rampToken}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        const errText = await response.text()
        return NextResponse.json(
          { error: `Ramp API error: ${response.status} - ${errText}` },
          { status: 502 }
        )
      }

      const data: RampVendorResponse = await response.json()
      allVendors.push(...data.data)
      nextUrl = data.page?.next || null
    }

    // Check which vendors already exist in our DB
    const { data: existingVendors } = await adminClient
      .from("vendors")
      .select("ramp_vendor_id")

    const existingRampIds = new Set(
      (existingVendors || []).map((v: { ramp_vendor_id: string | null }) => v.ramp_vendor_id).filter(Boolean)
    )

    // Return vendors with an "exists" flag
    const vendors = allVendors.map((v) => ({
      id: v.id,
      name: v.name,
      name_legal: v.name_legal || null,
      is_active: v.is_active !== false,
      country: v.country || null,
      state: v.state || null,
      description: v.description || null,
      category_name: v.category_name || null,
      exists: existingRampIds.has(v.id),
    }))

    return NextResponse.json({ vendors })
  } catch (err) {
    console.error("Ramp preview error:", err)
    return NextResponse.json(
      { error: "Failed to fetch vendors from Ramp" },
      { status: 500 }
    )
  }
}

/**
 * POST - Import selected vendors from the preview into the database.
 * Accepts { vendors: [...] } with the selected vendor objects from the GET preview.
 * This avoids re-fetching all 2700+ vendors from Ramp again.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminClient = getAdminClient()
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const selectedVendors: {
      id: string
      name: string
      name_legal?: string | null
      is_active?: boolean
      country?: string | null
      state?: string | null
      description?: string | null
      category_name?: string | null
    }[] = body.vendors

    if (!selectedVendors || selectedVendors.length === 0) {
      return NextResponse.json({ error: "No vendors provided" }, { status: 400 })
    }

    // Batch upsert selected vendors (chunks of 100 for speed)
    const now = new Date().toISOString()
    let upserted = 0
    const errors: string[] = []

    const BATCH_SIZE = 100
    for (let i = 0; i < selectedVendors.length; i += BATCH_SIZE) {
      const batch = selectedVendors.slice(i, i + BATCH_SIZE).map((v) => ({
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
        console.error(`Batch ${i / BATCH_SIZE + 1} error:`, error)
        errors.push(`Batch ${i / BATCH_SIZE + 1}: ${error.message}`)
      } else {
        upserted += count || batch.length
      }
    }

    if (errors.length > 0 && upserted === 0) {
      return NextResponse.json(
        { error: `Import failed: ${errors[0]}` },
        { status: 500 }
      )
    }

    // Update last sync timestamp for scheduled sync tracking
    if (upserted > 0) {
      const { data: existing } = await adminClient
        .from("settings")
        .select("id")
        .eq("key", "last_ramp_sync")
        .is("location_id", null)
        .single()

      if (existing) {
        await adminClient
          .from("settings")
          .update({ value: new Date().toISOString() })
          .eq("id", existing.id)
      } else {
        await adminClient
          .from("settings")
          .insert({ key: "last_ramp_sync", value: new Date().toISOString(), location_id: null })
      }
    }

    return NextResponse.json({
      success: true,
      synced: upserted,
      total_selected: selectedVendors.length,
      ...(errors.length > 0 ? { warnings: errors } : {}),
    })
  } catch (err) {
    console.error("Ramp import error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to import vendors" },
      { status: 500 }
    )
  }
}
