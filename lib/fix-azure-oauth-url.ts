/**
 * Fixes a known Supabase Azure OAuth URL issue where the external_azure_url
 * is stored with a trailing /v2.0, causing Supabase to construct a URL with
 * a duplicated path: /v2.0/oauth2/v2.0/authorize (which 404s on Microsoft).
 *
 * This function takes the URL returned by signInWithOAuth (with skipBrowserRedirect)
 * and corrects the path if needed.
 */
export function fixAzureOAuthUrl(url: string): string {
  // Fix the duplicated /v2.0/oauth2/v2.0/ → /oauth2/v2.0/
  return url.replace(
    /\/v2\.0\/oauth2\/v2\.0\//,
    "/oauth2/v2.0/"
  )
}
