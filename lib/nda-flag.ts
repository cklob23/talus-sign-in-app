/**
 * Master switch for the NDA feature.
 *
 * Defaults off. Set NDA_ENABLED=true to restore today's NDA step, server
 * gate, and admin UI. Read only on the server; pass a boolean to clients.
 */
export function isNdaFeatureEnabled(): boolean {
  const raw = (process.env.NDA_ENABLED || "").trim().toLowerCase()
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on"
}
