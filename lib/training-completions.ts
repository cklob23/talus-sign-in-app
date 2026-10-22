/**
 * Lookups for still-valid safety training, shared by the kiosk routes.
 */

type AnyClient = {
  from: (table: string) => any
}

function isUnexpired(row: { expires_at?: string | null }, now: number): boolean {
  if (!row.expires_at) return true
  const at = new Date(row.expires_at).getTime()
  return Number.isFinite(at) && at >= now
}

/** True when this exact visitor row has an unexpired completion for the type. */
export async function hasValidTrainingForVisitor(
  admin: AnyClient,
  visitorId: string,
  visitorTypeId: string,
  now = Date.now(),
): Promise<boolean> {
  const { data, error } = await admin
    .from("training_completions")
    .select("visitor_id, expires_at")
    .eq("visitor_id", visitorId)
    .eq("visitor_type_id", visitorTypeId)
    .order("expires_at", { ascending: false })
    .limit(5)
  if (error || !Array.isArray(data)) return false
  return data.some((row: { expires_at?: string | null }) => isUnexpired(row, now))
}

/** True when any visitor with this email has an unexpired completion for the type. */
export async function hasValidTrainingForEmail(
  admin: AnyClient,
  email: string | null | undefined,
  visitorTypeId: string,
  now = Date.now(),
): Promise<boolean> {
  if (!email) return false
  const { data: visitors, error } = await admin
    .from("visitors")
    .select("id")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error || !Array.isArray(visitors) || visitors.length === 0) return false
  const ids = visitors.map((v: { id: string }) => v.id)
  const { data: completions, error: completionError } = await admin
    .from("training_completions")
    .select("visitor_id, expires_at")
    .in("visitor_id", ids)
    .eq("visitor_type_id", visitorTypeId)
    .order("expires_at", { ascending: false })
    .limit(5)
  if (completionError || !Array.isArray(completions)) return false
  return completions.some((row: { expires_at?: string | null }) => isUnexpired(row, now))
}
