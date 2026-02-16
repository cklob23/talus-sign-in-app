import type { SupabaseClient } from "@supabase/supabase-js"

const GRAPH_API_URL = "https://graph.microsoft.com/v1.0"

export interface AzureCredentials {
  tenantId: string
  clientId: string
  clientSecret: string
}

export interface AzureSyncResult {
  synced: number
  total: number
  errors: string[]
}

/**
 * Fetch Azure AD credentials from the settings table (DB backup).
 * Falls back gracefully if keys aren't stored yet.
 */
async function getCredentialsFromDB(): Promise<AzureCredentials | null> {
  try {
    const { createClient } = await import("@supabase/supabase-js")
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data } = await adminClient
      .from("settings")
      .select("key, value")
      .is("location_id", null)
      .in("key", [
        "microsoft_sso_enabled",
        "azure_client_id",
        "azure_client_secret",
        "azure_tenant_id",
      ])

    if (!data || data.length === 0) return null

    const s: Record<string, string> = {}
    for (const row of data) {
      // JSONB values: booleans come as true/false, strings may come
      // as raw strings or JSON-quoted strings depending on how they
      // were inserted.  Normalise to plain strings.
      const v = row.value
      if (v === null || v === undefined) {
        s[row.key] = ""
      } else if (typeof v === "string") {
        s[row.key] = v
      } else if (typeof v === "boolean" || typeof v === "number") {
        s[row.key] = String(v)
      } else {
        // JSON object/array -- stringify for safety
        s[row.key] = JSON.stringify(v)
      }
    }

    const enabled = s.microsoft_sso_enabled === "true"
    const clientId = s.azure_client_id || ""
    const clientSecret = s.azure_client_secret || ""
    const tenantId = s.azure_tenant_id || "common"

    if (!enabled) return null
    if (!clientId || !clientSecret) return null

    return { tenantId, clientId, clientSecret }
  } catch {
    return null
  }
}

/**
 * Fetch Azure AD credentials.
 *
 * Priority: DB settings table FIRST (user-supplied secret value),
 * then Supabase Management API as fallback.
 *
 * The Management API may return a secret that differs from the raw
 * Client Secret Value needed for the client_credentials grant
 * (Graph API).  The DB stores the exact value the admin pasted, so
 * it is always preferred.
 */
export async function getAzureCredentials(): Promise<AzureCredentials> {
  // 1. Try DB-stored credentials first (most reliable source)
  const dbCreds = await getCredentialsFromDB()
  if (dbCreds) {
    return dbCreds
  }

  // 2. Fallback: Supabase Management API
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const projectRef = supabaseUrl.replace("https://", "").split(".")[0]
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN

  if (accessToken) {
    try {
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      )

      if (response.ok) {
        const config = await response.json()

        const clientId = config.external_azure_client_id || config.EXTERNAL_AZURE_CLIENT_ID || ""
        const clientSecret = config.external_azure_secret || config.EXTERNAL_AZURE_SECRET || ""
        const azureUrl = config.external_azure_url || config.EXTERNAL_AZURE_URL || ""
        const enabled = config.external_azure_enabled === true || config.EXTERNAL_AZURE_ENABLED === true

        if (enabled && clientId && clientSecret) {
          let tenantId = "common"
          if (azureUrl) {
            const match = azureUrl.match(/microsoftonline\.com\/([^/]+)/)
            if (match) tenantId = match[1]
          }
          return { tenantId, clientId, clientSecret }
        }
      }
    } catch {
      // Management API failed
    }
  }

  throw new Error(
    "Microsoft SSO is not enabled or credentials are missing. Configure it in Settings first."
  )
}

/**
 * Get access token using Client Credentials Flow
 */
export async function getAzureAccessToken(credentials: AzureCredentials): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`
  
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  })

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `Failed to get Azure AD token: ${errorData.error_description || errorData.error || "Unknown error"}`
    )
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Fetch all users from Azure AD via Graph API (handles pagination)
 */
export async function fetchAzureUsers(accessToken: string) {
  const allUsers: Array<{
    id: string
    displayName: string
    mail: string
    userPrincipalName: string
    jobTitle?: string
    department?: string
  }> = []

  let nextUrl: string | null =
    `${GRAPH_API_URL}/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=999`

  while (nextUrl) {
    const response: Response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Failed to fetch users from Azure AD: ${errorData.error?.message || response.statusText}`
      )
    }

    const data = await response.json()
    allUsers.push(...(data.value || []))
    nextUrl = data["@odata.nextLink"] || null
  }

  return allUsers
}

/**
 * Full sync: fetch all Azure AD users, upsert profiles, optionally sync photos.
 * Used by both the cron job and the manual sync route.
 */
export async function syncAzureUsers(
  adminClient: SupabaseClient,
  options: { syncPhotos?: boolean } = {}
): Promise<AzureSyncResult> {
  const credentials = await getAzureCredentials()
  const accessToken = await getAzureAccessToken(credentials)
  const azureUsers = await fetchAzureUsers(accessToken)

  let synced = 0
  const errors: string[] = []

  for (const azureUser of azureUsers) {
    const email = azureUser.mail || azureUser.userPrincipalName
    if (!email) continue

    try {
      // Check if profile already exists
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("email", email.toLowerCase())
        .single()

      let profileId: string

      if (existingProfile) {
        profileId = existingProfile.id
        await adminClient
          .from("profiles")
          .update({
            full_name: azureUser.displayName || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingProfile.id)
      } else {
        // Check for existing auth user
        const { data: authUsers } = await adminClient.auth.admin.listUsers()
        const existingAuthUser = authUsers?.users?.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        )

        if (existingAuthUser) {
          profileId = existingAuthUser.id
        } else {
          const { data: newAuthUser, error: authError } =
            await adminClient.auth.admin.createUser({
              email: email.toLowerCase(),
              email_confirm: true,
              user_metadata: { full_name: azureUser.displayName || null },
            })

          if (authError) {
            throw new Error(`Failed to create auth user: ${authError.message}`)
          }
          profileId = newAuthUser.user.id
        }

        await adminClient.from("profiles").upsert(
          {
            id: profileId,
            email: email.toLowerCase(),
            full_name: azureUser.displayName || null,
            role: "staff",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
      }

      // Optionally sync photos (slower, skip for scheduled syncs by default)
      if (options.syncPhotos) {
        try {
          const photoResponse = await fetch(
            `${GRAPH_API_URL}/users/${azureUser.id}/photo/$value`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )

          if (photoResponse.ok) {
            const photoBlob = await photoResponse.blob()
            const arrayBuffer = await photoBlob.arrayBuffer()
            const buffer = new Uint8Array(arrayBuffer)
            const mimeType =
              photoResponse.headers.get("content-type") || "image/jpeg"
            const extMap: Record<string, string> = {
              "image/jpeg": "jpg",
              "image/png": "png",
              "image/gif": "gif",
              "image/webp": "webp",
            }
            const fileExt = extMap[mimeType] || "jpg"
            const fileName = `${profileId}-${Date.now()}.${fileExt}`

            const { data: buckets } = await adminClient.storage.listBuckets()
            if (!buckets?.some((b) => b.name === "avatars")) {
              await adminClient.storage.createBucket("avatars", {
                public: true,
                fileSizeLimit: 5 * 1024 * 1024,
                allowedMimeTypes: [
                  "image/jpeg",
                  "image/png",
                  "image/gif",
                  "image/webp",
                ],
              })
            }

            const { error: uploadError } = await adminClient.storage
              .from("avatars")
              .upload(fileName, buffer, { contentType: mimeType, upsert: true })

            if (!uploadError) {
              const {
                data: { publicUrl },
              } = adminClient.storage.from("avatars").getPublicUrl(fileName)

              await adminClient
                .from("profiles")
                .update({ avatar_url: publicUrl })
                .eq("id", profileId)
            }
          }
        } catch {
          // Photo fetch/upload failed, continue
        }
      }

      synced++
    } catch (userError) {
      errors.push(
        `${email}: ${userError instanceof Error ? userError.message : "Unknown error"}`
      )
    }
  }

  return { synced, total: azureUsers.length, errors }
}
