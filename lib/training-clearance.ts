/**
 * One shared "is this person cleared for this visitor type" check.
 *
 * Keyed on a normalized visitor email plus visitor_type_id. Validity comes
 * from training_completions.expires_at. The current default window is 365
 * days (unchanged). Visitor types are per site in production, so the type
 * id is the site+type key.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const TRAINING_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000

export type TrainingSource = "kiosk" | "qr" | "training_link" | "prior"

export type TrainingSkipKind = "link" | "code"

export interface TrainingClearance {
  cleared: boolean
  skipKind: TrainingSkipKind | null
  visitorId: string | null
  completedAt: string | null
  expiresAt: string | null
  source: TrainingSource | null
  message: string | null
  messageEs: string | null
}

type AnyClient = {
  from: (table: string) => any
}

export function normalizeVisitorEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null
  const value = email.trim().toLowerCase()
  if (!value || value.length > 254 || !EMAIL_RE.test(value)) return null
  return value
}

export function defaultTrainingExpiresAt(now = Date.now()): string {
  return new Date(now + TRAINING_VALIDITY_MS).toISOString()
}

export function isUnexpiredCompletion(row: { expires_at?: string | null }, now: number): boolean {
  if (!row.expires_at) return true
  const at = new Date(row.expires_at).getTime()
  return Number.isFinite(at) && at >= now
}

export function formatTrainingDay(iso: string, locale: "en" | "es"): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ""
  if (locale === "es") {
    return new Intl.DateTimeFormat("es-US", { month: "short", day: "numeric" }).format(date)
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
}

export function formatTrainingMonthYear(iso: string, locale: "en" | "es"): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ""
  if (locale === "es") {
    return new Intl.DateTimeFormat("es-US", { month: "short", year: "numeric" }).format(date)
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date)
}

/** "You did the safety video on Oct 2. You are cleared until Oct 2027." */
export function formatClearanceMessage(
  completedAt: string,
  expiresAt: string | null,
  locale: "en" | "es" = "en",
): string {
  const done = formatTrainingDay(completedAt, locale)
  const until = expiresAt ? formatTrainingMonthYear(expiresAt, locale) : null
  if (locale === "es") {
    if (until) return `Hizo el video de seguridad el ${done}. Queda autorizado hasta ${until}.`
    return `Hizo el video de seguridad el ${done}. Queda autorizado.`
  }
  if (until) return `You did the safety video on ${done}. You are cleared until ${until}.`
  return `You did the safety video on ${done}. You are cleared.`
}

function skipKindForSource(source: string | null | undefined): TrainingSkipKind {
  return source === "training_link" ? "link" : "code"
}

function asSource(value: unknown): TrainingSource | null {
  if (value === "kiosk" || value === "qr" || value === "training_link" || value === "prior") return value
  return null
}

export function clearanceFromCompletions(
  rows: Array<{
    visitor_id?: string | null
    completed_at?: string | null
    created_at?: string | null
    expires_at?: string | null
    source?: string | null
  }>,
  now = Date.now(),
): TrainingClearance {
  const valid = rows.filter((row) => isUnexpiredCompletion(row, now))
  if (valid.length === 0) {
    return {
      cleared: false,
      skipKind: null,
      visitorId: null,
      completedAt: null,
      expiresAt: null,
      source: null,
      message: null,
      messageEs: null,
    }
  }
  const linkFirst = [...valid].sort((a, b) => {
    const aLink = a.source === "training_link" ? 0 : 1
    const bLink = b.source === "training_link" ? 0 : 1
    if (aLink !== bLink) return aLink - bLink
    const aExp = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY
    const bExp = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY
    return bExp - aExp
  })[0]
  const completedAt = linkFirst.completed_at || linkFirst.created_at || new Date(now).toISOString()
  const expiresAt = linkFirst.expires_at || null
  const source = asSource(linkFirst.source) || "prior"
  return {
    cleared: true,
    skipKind: skipKindForSource(linkFirst.source),
    visitorId: linkFirst.visitor_id || null,
    completedAt,
    expiresAt,
    source,
    message: formatClearanceMessage(completedAt, expiresAt, "en"),
    messageEs: formatClearanceMessage(completedAt, expiresAt, "es"),
  }
}

async function visitorIdsForNormalizedEmail(
  admin: AnyClient,
  email: string,
): Promise<Array<{ id: string }>> {
  const { data, error } = await admin
    .from("visitors")
    .select("id, email")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(40)
  if (error || !Array.isArray(data)) return []
  return data
    .filter((row: { id?: string; email?: string | null }) => normalizeVisitorEmail(row.email) === email && row.id)
    .map((row: { id: string }) => ({ id: row.id }))
}

export async function getTrainingClearance(
  admin: AnyClient,
  email: string | null | undefined,
  visitorTypeId: string,
  now = Date.now(),
): Promise<TrainingClearance> {
  const empty: TrainingClearance = {
    cleared: false,
    skipKind: null,
    visitorId: null,
    completedAt: null,
    expiresAt: null,
    source: null,
    message: null,
    messageEs: null,
  }
  const normalized = normalizeVisitorEmail(email)
  if (!normalized || !visitorTypeId) return empty

  const visitors = await visitorIdsForNormalizedEmail(admin, normalized)
  if (visitors.length === 0) return empty

  const ids = visitors.map((v) => v.id)
  let { data: completions, error } = await admin
    .from("training_completions")
    .select("visitor_id, completed_at, created_at, expires_at, source")
    .in("visitor_id", ids)
    .eq("visitor_type_id", visitorTypeId)
    .order("expires_at", { ascending: false })
    .limit(20)
  if (error?.code === "42703") {
    const retry = await admin
      .from("training_completions")
      .select("visitor_id, completed_at, created_at, expires_at")
      .in("visitor_id", ids)
      .eq("visitor_type_id", visitorTypeId)
      .order("expires_at", { ascending: false })
      .limit(20)
    completions = retry.data
    error = retry.error
  }
  if (error || !Array.isArray(completions)) return empty
  const clearance = clearanceFromCompletions(completions, now)
  if (clearance.cleared && !clearance.visitorId) {
    clearance.visitorId = visitors[0].id
  }
  return clearance
}

export type HostTrainingState = "cleared" | "expired" | "not_completed" | "not_required"

export type HostTrainingSnapshot = {
  state: HostTrainingState
  completedAt: string | null
  expiresAt: string | null
}

function completionDates(row: {
  completed_at?: string | null
  created_at?: string | null
  expires_at?: string | null
}): { completedAt: string | null; expiresAt: string | null } {
  return {
    completedAt: row.completed_at || row.created_at || null,
    expiresAt: row.expires_at || null,
  }
}

/** Host visit page: classify training without changing visitor-facing clearance copy. */
export function hostTrainingFromCompletions(
  requiresTraining: boolean,
  rows: Array<{
    completed_at?: string | null
    created_at?: string | null
    expires_at?: string | null
    source?: string | null
  }>,
  now = Date.now(),
): HostTrainingSnapshot {
  if (!requiresTraining) {
    return { state: "not_required", completedAt: null, expiresAt: null }
  }
  const cleared = clearanceFromCompletions(rows, now)
  if (cleared.cleared) {
    return { state: "cleared", completedAt: cleared.completedAt, expiresAt: cleared.expiresAt }
  }
  const expired = rows
    .map((row) => {
      const dates = completionDates(row)
      const expMs = dates.expiresAt ? new Date(dates.expiresAt).getTime() : Number.NaN
      return { ...dates, expMs }
    })
    .filter((row) => Number.isFinite(row.expMs) && row.expMs < now)
    .sort((a, b) => b.expMs - a.expMs)
  if (expired[0]) {
    return { state: "expired", completedAt: expired[0].completedAt, expiresAt: expired[0].expiresAt }
  }
  return { state: "not_completed", completedAt: null, expiresAt: null }
}

export async function getHostTrainingSnapshot(
  admin: AnyClient,
  email: string | null | undefined,
  visitorTypeId: string | null | undefined,
  requiresTraining: boolean,
  now = Date.now(),
): Promise<HostTrainingSnapshot> {
  if (!requiresTraining) {
    return { state: "not_required", completedAt: null, expiresAt: null }
  }
  const empty: HostTrainingSnapshot = { state: "not_completed", completedAt: null, expiresAt: null }
  const normalized = normalizeVisitorEmail(email)
  if (!normalized || !visitorTypeId) return empty

  const visitors = await visitorIdsForNormalizedEmail(admin, normalized)
  if (visitors.length === 0) return empty

  const ids = visitors.map((v) => v.id)
  let { data: completions, error } = await admin
    .from("training_completions")
    .select("visitor_id, completed_at, created_at, expires_at, source")
    .in("visitor_id", ids)
    .eq("visitor_type_id", visitorTypeId)
    .order("expires_at", { ascending: false })
    .limit(20)
  if (error?.code === "42703") {
    const retry = await admin
      .from("training_completions")
      .select("visitor_id, completed_at, created_at, expires_at")
      .in("visitor_id", ids)
      .eq("visitor_type_id", visitorTypeId)
      .order("expires_at", { ascending: false })
      .limit(20)
    completions = retry.data
    error = retry.error
  }
  if (error || !Array.isArray(completions)) return empty
  return hostTrainingFromCompletions(true, completions, now)
}

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
  return data.some((row: { expires_at?: string | null }) => isUnexpiredCompletion(row, now))
}

export async function hasValidTrainingForEmail(
  admin: AnyClient,
  email: string | null | undefined,
  visitorTypeId: string,
  now = Date.now(),
): Promise<boolean> {
  const clearance = await getTrainingClearance(admin, email, visitorTypeId, now)
  return clearance.cleared
}

export async function findOrCreateVisitorByEmail(
  admin: AnyClient,
  args: {
    email: string
    firstName: string
    lastName: string
    company?: string | null
  },
): Promise<{ id: string } | null> {
  const email = normalizeVisitorEmail(args.email)
  if (!email) return null
  const existing = await visitorIdsForNormalizedEmail(admin, email)
  if (existing[0]) return existing[0]
  const { data, error } = await admin
    .from("visitors")
    .insert({
      first_name: args.firstName.trim() || "Visitor",
      last_name: args.lastName.trim() || "Guest",
      email,
      company: args.company?.trim() || null,
    })
    .select("id")
    .single()
  if (error || !data?.id) return null
  return { id: data.id }
}

async function locationIdForVisitorType(admin: AnyClient, visitorTypeId: string): Promise<string | null> {
  const { data } = await admin.from("visitor_types").select("location_id").eq("id", visitorTypeId).maybeSingle()
  return typeof data?.location_id === "string" && data.location_id ? data.location_id : null
}

export async function recordTrainingCompletion(
  admin: AnyClient,
  args: {
    visitorId: string
    visitorTypeId: string
    source: TrainingSource
    locationId?: string | null
    expiresAt?: string | null
    now?: number
  },
): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
  const expiresAt = args.expiresAt || defaultTrainingExpiresAt(args.now)
  const completedAt = new Date(args.now ?? Date.now()).toISOString()
  const locationId = args.locationId || (await locationIdForVisitorType(admin, args.visitorTypeId))
  const row = {
    visitor_id: args.visitorId,
    visitor_type_id: args.visitorTypeId,
    completed_at: completedAt,
    expires_at: expiresAt,
    source: args.source,
    location_id: locationId,
  }
  const first = await admin.from("training_completions").insert(row).select("id").single()
  if (!first.error) return { ok: true, expiresAt }
  if (first.error?.code === "42703") {
    const { location_id: _locationId, ...withoutLocation } = row
    const retryLocation = await admin.from("training_completions").insert(withoutLocation).select("id").single()
    if (!retryLocation.error) return { ok: true, expiresAt }
    if (retryLocation.error?.code === "42703") {
      const { source: _source, ...legacy } = withoutLocation
      const retry = await admin.from("training_completions").insert(legacy).select("id").single()
      if (!retry.error) return { ok: true, expiresAt }
      return { ok: false, error: retry.error.message || "Failed to record training" }
    }
    return { ok: false, error: retryLocation.error.message || "Failed to record training" }
  }
  return { ok: false, error: first.error.message || "Failed to record training" }
}

export function maskEmail(email: string): string {
  const normalized = normalizeVisitorEmail(email) || email.trim().toLowerCase()
  const at = normalized.indexOf("@")
  if (at <= 0) return "••••"
  const local = normalized.slice(0, at)
  const domain = normalized.slice(at)
  if (local.length <= 2) return `${local[0] || "•"}••••${domain}`
  return `${local[0]}••••${local[local.length - 1]}${domain}`
}
