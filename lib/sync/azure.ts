import type { SupabaseClient } from "@supabase/supabase-js"

const GRAPH_API_URL = "https://graph.microsoft.com/v1.0"

export interface AzureCredentials {
  tenantId: string
  clientId: string
  clientSecret: string
}

export interface AzureSyncResult {
  synced: number
  created: number
  updated: number
  deactivated: number
  total: number
  errors: string[]
}

/** A user as returned by Microsoft Graph, with the fields Smart Flow mirrors. */
export interface AzureUser {
  id: string
  displayName?: string
  mail?: string
  userPrincipalName?: string
  jobTitle?: string
  department?: string
  officeLocation?: string
  mobilePhone?: string
  businessPhones?: string[]
  accountEnabled?: boolean
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

// Every field Smart Flow mirrors from the directory. `accountEnabled` and the
// phone fields were previously omitted, which is why disabled status and phone
// numbers never synced.
const GRAPH_USER_SELECT =
  "id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones,accountEnabled"

/**
 * Fetch all users from Azure AD via Graph API (handles pagination).
 */
export async function fetchAzureUsers(accessToken: string): Promise<AzureUser[]> {
  const allUsers: AzureUser[] = []

  let nextUrl: string | null = `${GRAPH_API_URL}/users?$select=${GRAPH_USER_SELECT}&$top=999`

  while (nextUrl) {
    const response = await fetch(nextUrl, {
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

    const data: { value?: AzureUser[]; "@odata.nextLink"?: string } = await response.json()
    allUsers.push(...(data.value || []))
    nextUrl = data["@odata.nextLink"] || null
  }

  return allUsers
}

/**
 * Fetch a single Azure AD user by object ID or userPrincipalName.
 * Used by the per-user "Sync from Entra ID" action in the admin blade.
 */
export async function fetchAzureUser(accessToken: string, key: string): Promise<AzureUser | null> {
  const response = await fetch(`${GRAPH_API_URL}/users/${encodeURIComponent(key)}?$select=${GRAPH_USER_SELECT}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })

  if (response.status === 404) return null
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Failed to fetch user from Azure AD: ${errorData.error?.message || response.statusText}`)
  }

  return (await response.json()) as AzureUser
}

/** The best available email for a directory user, lower-cased. */
export function azureUserEmail(u: AzureUser): string | null {
  const email = u.mail || u.userPrincipalName
  return email ? email.toLowerCase() : null
}

/** The best available phone number for a directory user. */
function azureUserPhone(u: AzureUser): string | null {
  return u.mobilePhone || u.businessPhones?.[0] || null
}

/**
 * Fetch a user's Entra ID photo and store it at a STABLE path, returning the
 * public URL (or null when there is no photo).
 *
 * The path is keyed only on the profile id, so re-syncing overwrites the same
 * object instead of the old `${id}-${Date.now()}` scheme, which leaked a new
 * file into the public bucket on every run. A cache-busting query param is
 * appended to the returned URL so the browser still picks up a changed photo.
 */
async function syncAzurePhoto(
  adminClient: SupabaseClient,
  accessToken: string,
  azureId: string,
  profileId: string,
): Promise<string | null> {
  const photoResponse = await fetch(`${GRAPH_API_URL}/users/${azureId}/photo/$value`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!photoResponse.ok) return null

  const arrayBuffer = await photoResponse.arrayBuffer()
  const buffer = new Uint8Array(arrayBuffer)
  const mimeType = photoResponse.headers.get("content-type") || "image/jpeg"
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  }
  const fileExt = extMap[mimeType] || "jpg"
  // Stable path: one object per profile, overwritten in place.
  const fileName = `entra/${profileId}.${fileExt}`

  const { data: buckets } = await adminClient.storage.listBuckets()
  if (!buckets?.some((b) => b.name === "avatars")) {
    await adminClient.storage.createBucket("avatars", {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    })
  }

  const { error: uploadError } = await adminClient.storage
    .from("avatars")
    .upload(fileName, buffer, { contentType: mimeType, upsert: true })
  if (uploadError) return null

  const {
    data: { publicUrl },
  } = adminClient.storage.from("avatars").getPublicUrl(fileName)
  // Cache-bust so a replaced photo is picked up despite the stable path.
  return `${publicUrl}?v=${Date.now()}`
}

export interface UpsertAzureUserResult {
  profileId: string
  isNew: boolean
}

/**
 * Reconcile a single directory user into `profiles`, and mirror the shared
 * fields onto any linked `hosts` row.
 *
 * Matching order is the crux of the fix:
 *   1. `azure_object_id` — the directory's stable key, so renames and email
 *      changes update the SAME profile instead of forking a duplicate.
 *   2. `email` — legacy fallback for profiles created before we stored the
 *      object id; this pass backfills the id so step 1 wins next time.
 *   3. otherwise create a new auth user + profile.
 *
 * Every synced field (name, email, phone, department, job title, office,
 * enabled/disabled) is written on update — previously only full_name was.
 */
export interface SyncOptions {
  /** Fetch and store the user's Entra photo (slow; scheduled syncs skip it). */
  syncPhotos?: boolean
  /**
   * Create a profile for a user who is not in Smart Flow yet. When false, a
   * brand-new user who is ALSO disabled in Entra is skipped entirely — there
   * is no point importing an already-deactivated account.
   */
  createMissing?: boolean
  /**
   * Deactivate the linked host record when the user is disabled in Entra.
   * Turn this off to keep hosts selectable even while their directory account
   * is disabled (e.g. staff disabled for licensing/MFA reasons, not offboarded).
   */
  deactivateHostOnDisable?: boolean
}

export async function upsertAzureUser(
  adminClient: SupabaseClient,
  accessToken: string,
  azureUser: AzureUser,
  options: SyncOptions = {},
): Promise<UpsertAzureUserResult | null> {
  const { syncPhotos = false, createMissing = true, deactivateHostOnDisable = true } = options

  const email = azureUserEmail(azureUser)
  if (!email) return null

  // 1. Match on the stable directory id first.
  const { data: byOid } = await adminClient
    .from("profiles")
    .select("id")
    .eq("azure_object_id", azureUser.id)
    .maybeSingle()

  // 2. Fall back to email for profiles that predate object-id storage.
  let existing = byOid
  if (!existing) {
    const { data: byEmail } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle()
    existing = byEmail
  }

  const isActive = azureUser.accountEnabled !== false

  // Don't import a user who is brand new AND already disabled.
  if (!existing && (!createMissing || !isActive)) return null
  const fields = {
    email,
    full_name: azureUser.displayName || null,
    phone: azureUserPhone(azureUser),
    department: azureUser.department || null,
    job_title: azureUser.jobTitle || null,
    office_location: azureUser.officeLocation || null,
    azure_object_id: azureUser.id,
    is_active: isActive,
    directory_status: isActive ? "active" : "disabled",
    directory_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  let profileId: string
  let isNew = false

  if (existing) {
    profileId = existing.id
    const { error } = await adminClient.from("profiles").update(fields).eq("id", profileId)
    if (error) throw new Error(error.message)

    // Keep the auth email in step with the directory so SSO login still maps.
    await adminClient.auth.admin.updateUserById(profileId, { email }).catch(() => { })
  } else {
    // No profile yet: reuse an auth user with this email if one exists,
    // otherwise create one. This keeps profiles.id === auth.users.id.
    const { data: authUsers } = await adminClient.auth.admin.listUsers()
    const existingAuthUser = authUsers?.users?.find((u) => u.email?.toLowerCase() === email)

    if (existingAuthUser) {
      profileId = existingAuthUser.id
    } else {
      const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: azureUser.displayName || null },
      })
      if (authError) throw new Error(`Failed to create auth user: ${authError.message}`)
      profileId = newAuthUser.user.id
      isNew = true
    }

    const { error } = await adminClient.from("profiles").upsert(
      { id: profileId, role: "staff", created_at: new Date().toISOString(), ...fields },
      { onConflict: "id" },
    )
    if (error) throw new Error(`Profile insert failed: ${error.message}`)
  }

  // Photo (optional; slow, so scheduled syncs skip it).
  let avatarUrl: string | null = null
  if (syncPhotos) {
    try {
      avatarUrl = await syncAzurePhoto(adminClient, accessToken, azureUser.id, profileId)
      if (avatarUrl) {
        await adminClient.from("profiles").update({ avatar_url: avatarUrl }).eq("id", profileId)
      }
    } catch {
      // Photo is best-effort; never fail the whole user over it.
    }
  }

  // Mirror the shared fields onto a linked host so the hosts page and host
  // pickers reflect directory changes.
  const hostFields: Record<string, unknown> = {
    name: fields.full_name,
    email: fields.email,
    phone: fields.phone,
    department: fields.department,
    updated_at: fields.updated_at,
  }
  if (avatarUrl) hostFields.avatar_url = avatarUrl
  // Only touch host activation when the user is disabled AND the caller opted
  // in. We never re-activate a host here: an admin may have deactivated a host
  // for their own reasons while the directory account stays enabled.
  if (!isActive && deactivateHostOnDisable) hostFields.is_active = false
  await adminClient.from("hosts").update(hostFields).eq("profile_id", profileId)

  return { profileId, isNew }
}

/**
 * Full sync: fetch all Azure AD users, reconcile each, then deactivate profiles
 * whose directory user has disappeared. Used by the cron job and manual sync.
 */
export async function syncAzureUsers(
  adminClient: SupabaseClient,
  options: SyncOptions = {},
): Promise<AzureSyncResult> {
  const credentials = await getAzureCredentials()
  const accessToken = await getAzureAccessToken(credentials)

  // A failure here throws BEFORE the deactivation sweep runs, so a transient
  // Graph outage can never be misread as "everyone left the directory".
  const azureUsers = await fetchAzureUsers(accessToken)

  let created = 0
  let updated = 0
  const errors: string[] = []
  const seenOids = new Set<string>()

  for (const azureUser of azureUsers) {
    seenOids.add(azureUser.id)
    try {
      const result = await upsertAzureUser(adminClient, accessToken, azureUser, options)
      if (!result) continue
      if (result.isNew) created++
      else updated++
    } catch (userError) {
      const email = azureUserEmail(azureUser) || azureUser.id
      errors.push(`${email}: ${userError instanceof Error ? userError.message : "Unknown error"}`)
    }
  }

  // Deactivation sweep: profiles that were directory-managed but are no longer
  // present are marked removed. We only sweep when the fetch clearly succeeded
  // (non-empty result), and we never touch admins or locally-created accounts.
  let deactivated = 0
  if (azureUsers.length > 0) {
    const { data: managed } = await adminClient
      .from("profiles")
      .select("id, azure_object_id, role")
      .not("azure_object_id", "is", null)
      .neq("directory_status", "removed")

    const stale = (managed || []).filter(
      (p) => p.azure_object_id && !seenOids.has(p.azure_object_id) && p.role !== "admin",
    )
    for (const p of stale) {
      const { error } = await adminClient
        .from("profiles")
        .update({
          is_active: false,
          directory_status: "removed",
          directory_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id)
      if (!error) {
        deactivated++
        // Deactivate the linked host too, so they stop being selectable. A user
        // removed from the directory entirely is always deactivated as a host,
        // regardless of the disable-time host option.
        await adminClient.from("hosts").update({ is_active: false }).eq("profile_id", p.id)
      }
    }
  }

  return { synced: created + updated, created, updated, deactivated, total: azureUsers.length, errors }
}

/**
 * Sync a single user on demand (the blade's "Sync from Entra ID" button).
 * Looks the user up by stored object id, else by email.
 */
export async function syncSingleAzureUser(
  adminClient: SupabaseClient,
  profileId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, email, azure_object_id")
    .eq("id", profileId)
    .maybeSingle()
  if (!profile) return { ok: false, error: "Profile not found" }

  const credentials = await getAzureCredentials()
  const accessToken = await getAzureAccessToken(credentials)

  const key = profile.azure_object_id || profile.email
  if (!key) return { ok: false, error: "No Entra ID identifier for this user" }

  const azureUser = await fetchAzureUser(accessToken, key)
  if (!azureUser) return { ok: false, error: "User not found in Entra ID" }

  await upsertAzureUser(adminClient, accessToken, azureUser, { syncPhotos: true })
  return { ok: true }
}
