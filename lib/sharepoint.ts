/**
 * SharePoint archive via Microsoft Graph, app-only (client credentials).
 *
 * Reuses the tenant's existing Azure AD app (the same credentials that back the
 * directory sync) but authenticates directly from the AZURE_AD_* environment
 * variables rather than the SSO settings row. That keeps the archive working
 * even when interactive SSO is switched off, and avoids coupling document
 * storage to the login configuration.
 *
 * The app registration must have the Graph APPLICATION permission
 * `Sites.ReadWrite.All` (or `Sites.Selected` granted on the target site) with
 * admin consent. A 403 from Graph almost always means that consent is missing.
 */

const GRAPH = "https://graph.microsoft.com/v1.0"

interface GraphCredentials {
    tenantId: string
    clientId: string
    clientSecret: string
}

function getGraphCredentials(): GraphCredentials | null {
    const tenantId = process.env.AZURE_AD_TENANT_ID
    const clientId = process.env.AZURE_AD_CLIENT_ID
    const clientSecret = process.env.AZURE_AD_CLIENT_SECRET
    if (!tenantId || !clientId || !clientSecret) return null
    return { tenantId, clientId, clientSecret }
}

async function getAppToken(creds: GraphCredentials): Promise<string> {
    const res = await fetch(`https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            scope: "https://graph.microsoft.com/.default",
            grant_type: "client_credentials",
        }).toString(),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(`Graph token request failed: ${err.error_description || err.error || res.statusText}`)
    }
    const data = await res.json()
    return data.access_token as string
}

/**
 * Turns a full site URL into the Graph site addressing pair.
 * `https://talusag.sharepoint.com/sites/Legal` ->
 *   { hostname: "talusag.sharepoint.com", sitePath: "/sites/Legal" }
 * A bare hostname resolves to the root site.
 */
function parseSiteUrl(siteUrl: string): { hostname: string; sitePath: string } | null {
    try {
        const u = new URL(siteUrl.trim())
        const path = u.pathname.replace(/\/+$/, "")
        return { hostname: u.hostname, sitePath: path }
    } catch {
        return null
    }
}

async function graphGet(token: string, path: string) {
    const res = await fetch(`${GRAPH}${path}`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
        const message = body?.error?.message || res.statusText
        const err = new Error(message) as Error & { status?: number }
        err.status = res.status
        throw err
    }
    return body
}

async function resolveSiteId(token: string, siteUrl: string): Promise<{ siteId: string; siteName: string }> {
    const parsed = parseSiteUrl(siteUrl)
    if (!parsed) throw new Error("The SharePoint site URL is not valid.")
    const addr = parsed.sitePath ? `${parsed.hostname}:${parsed.sitePath}` : parsed.hostname
    const site = await graphGet(token, `/sites/${addr}`)
    return { siteId: site.id as string, siteName: (site.displayName || site.name || parsed.sitePath) as string }
}

async function resolveDriveId(token: string, siteId: string): Promise<string> {
    const drive = await graphGet(token, `/sites/${siteId}/drive`)
    return drive.id as string
}

/** Normalises a folder path to Graph's `:/segment/segment:` addressing, empty for root. */
function encodeFolderPath(folderPath: string): string {
    const clean = folderPath
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => encodeURIComponent(s))
        .join("/")
    return clean
}

export interface SharePointUploadArgs {
    siteUrl: string
    folderPath: string
    fileName: string
    bytes: Uint8Array
}

export interface SharePointResult {
    ok: boolean
    url?: string
    error?: string
}

/**
 * Uploads a single PDF into the site's default document library.
 *
 * Signed NDAs are well under 4MB, so the simple upload endpoint is used. Any
 * missing intermediate folders are created implicitly by the path-addressed
 * upload, so no separate folder-creation call is needed.
 */
export async function uploadToSharePoint(args: SharePointUploadArgs): Promise<SharePointResult> {
    const creds = getGraphCredentials()
    if (!creds) return { ok: false, error: "Azure AD app credentials are not configured." }

    try {
        const token = await getAppToken(creds)
        const { siteId } = await resolveSiteId(token, args.siteUrl)
        const driveId = await resolveDriveId(token, siteId)

        const folder = encodeFolderPath(args.folderPath)
        const safeName = args.fileName.replace(/[\\/:*?"<>|]/g, "-")
        const itemPath = folder ? `${folder}/${encodeURIComponent(safeName)}` : encodeURIComponent(safeName)

        const res = await fetch(`${GRAPH}/drives/${driveId}/root:/${itemPath}:/content`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf" },
            body: Buffer.from(args.bytes),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
            const message = body?.error?.message || res.statusText
            return { ok: false, error: `SharePoint upload failed: ${message}` }
        }
        return { ok: true, url: (body.webUrl as string) || undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        return { ok: false, error: message }
    }
}

/**
 * Verifies the site + drive resolve and the folder is reachable, used by the
 * "Test connection" button so an admin gets a clear answer before relying on it.
 */
export async function testSharePointConnection(args: {
    siteUrl: string
    folderPath: string
}): Promise<{ ok: boolean; error?: string; siteName?: string }> {
    const creds = getGraphCredentials()
    if (!creds) return { ok: false, error: "Azure AD app credentials (AZURE_AD_*) are not configured on the server." }

    try {
        const token = await getAppToken(creds)
        const { siteId, siteName } = await resolveSiteId(token, args.siteUrl)
        const driveId = await resolveDriveId(token, siteId)

        // Probe the target folder. A 404 is fine — it will be created on first
        // upload — but a 403 means the app lacks write consent, which we surface.
        const folder = encodeFolderPath(args.folderPath)
        if (folder) {
            try {
                await graphGet(token, `/drives/${driveId}/root:/${folder}`)
            } catch (err) {
                const status = (err as { status?: number }).status
                if (status === 403) {
                    return { ok: false, error: "Connected to the site but the app lacks write permission (Sites.ReadWrite.All)." }
                }
                // 404 (folder not created yet) is acceptable.
            }
        }
        return { ok: true, siteName }
    } catch (error) {
        const status = (error as { status?: number }).status
        const message = error instanceof Error ? error.message : "Unknown error"
        if (status === 403) {
            return { ok: false, error: "Authenticated, but the app lacks permission to this site (grant Sites.ReadWrite.All)." }
        }
        return { ok: false, error: message }
    }
}
