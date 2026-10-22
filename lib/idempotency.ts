import { asOptionalUuid } from "@/lib/kiosk-input"

export const PG_UNIQUE_VIOLATION = "23505"
export const PG_UNDEFINED_COLUMN = "42703"
export const PG_UNDEFINED_TABLE = "42P01"

export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === PG_UNIQUE_VIOLATION
}

export function isUndefinedColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === PG_UNDEFINED_COLUMN
}

export function isUndefinedTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === PG_UNDEFINED_TABLE
}

/** Missing (`undefined`) → `null`. Present-but-invalid → `undefined`. */
export function parseIdempotencyKey(value: unknown): string | null | undefined {
  return asOptionalUuid(value)
}

export interface SignInRow {
  id: string
  [key: string]: unknown
}

export interface SignInInsertResult {
  data: SignInRow | null
  error: { code?: string; message?: string } | null
}

export interface SignInIdempotencyStore {
  findByIdempotencyKey(key: string): Promise<SignInRow | null>
  insert(row: Record<string, unknown>): Promise<SignInInsertResult>
}

export type IdempotentSignInResult =
  | { ok: true; signIn: SignInRow; replayed: boolean }
  | { ok: false; error: { code?: string; message?: string } }

/**
 * Insert a sign-in, returning the original row when the same idempotency key
 * is submitted again (Cloudflare / HTTP3 replay, double tap).
 *
 * If the column is not on the database yet (006 not applied), retries without
 * the key so deploy order stays additive.
 */
export async function createSignInIdempotent(
  store: SignInIdempotencyStore,
  row: Record<string, unknown>,
): Promise<IdempotentSignInResult> {
  const key = typeof row.idempotency_key === "string" && row.idempotency_key
    ? row.idempotency_key
    : null

  if (key) {
    const existing = await store.findByIdempotencyKey(key)
    if (existing) return { ok: true, signIn: existing, replayed: true }
  }

  const first = await store.insert(row)
  if (!first.error && first.data) {
    return { ok: true, signIn: first.data, replayed: false }
  }

  if (isUniqueViolation(first.error) && key) {
    const existing = await store.findByIdempotencyKey(key)
    if (existing) return { ok: true, signIn: existing, replayed: true }
  }

  if (isUndefinedColumn(first.error) && key) {
    const { idempotency_key: _dropped, ...withoutKey } = row
    const retry = await store.insert(withoutKey)
    if (!retry.error && retry.data) {
      return { ok: true, signIn: retry.data, replayed: false }
    }
    return { ok: false, error: retry.error ?? { message: "Failed to create sign-in" } }
  }

  return { ok: false, error: first.error ?? { message: "Failed to create sign-in" } }
}

export interface NotificationClaim {
  signInId?: string | null
  notificationType: string
  idempotencyKey?: string | null
}

export interface NotificationStore {
  findExisting(claim: NotificationClaim): Promise<boolean>
  insert(claim: NotificationClaim): Promise<{ error: { code?: string; message?: string } | null }>
}

/**
 * Claim the right to send one host notification. Repeat claims for the same
 * sign-in + type (or the same idempotency key) return "duplicate" and the
 * caller must not send again.
 *
 * Missing table (006 not applied) returns "claimed" so the first deploy
 * still notifies; once the table exists, the unique indexes enforce at most once.
 */
export async function claimNotificationOnce(
  store: NotificationStore,
  claim: NotificationClaim,
): Promise<"claimed" | "duplicate"> {
  if (await store.findExisting(claim)) return "duplicate"

  const { error } = await store.insert(claim)
  if (!error) return "claimed"
  if (isUniqueViolation(error)) return "duplicate"
  if (isUndefinedTable(error) || isUndefinedColumn(error)) return "claimed"
  console.error("[host-notify] claim insert failed:", error.message || error)
  return "claimed"
}
