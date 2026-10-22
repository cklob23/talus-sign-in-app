/**
 * Shared host list and validation for kiosk and QR self sign-in.
 *
 * Product decision (P1-6): every active host is offered at every location.
 * hosts.location_id stays on the row (and the FK cascade is unchanged) but
 * it is not used as a filter here.
 */

export interface ActiveHost {
  id: string
  name: string
  department: string | null
}

export const QR_HOST_SELECT = "id, name, department"
export const KIOSK_HOST_SELECT =
  "id, name, email, phone, department, location_id, is_active, profile_id, avatar_url, created_at, updated_at, profile:profiles(id, full_name, email, phone, department)"

export type HostQueryResult<T> =
  | { ok: true; hosts: T[] }
  | { ok: false; error: string }

export interface HostsQueryBuilder {
  select: (columns: string) => HostsQueryBuilder
  eq: (column: string, value: unknown) => HostsQueryBuilder
  order: (column: string) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>
  maybeSingle: () => PromiseLike<{ data: { id: string } | null; error: { message?: string } | null }>
}

export interface HostsClient {
  from: (table: string) => HostsQueryBuilder
}

/** Supabase clients are structurally compatible; keep the helper usable from routes. */
export type AnyHostsClient = {
  from: (table: string) => {
    select: (columns: string) => any
  }
}

/**
 * Load every active host. Callers must surface `error` instead of treating
 * a failed query as an empty list.
 */
export async function listActiveHosts<T = ActiveHost>(
  admin: AnyHostsClient,
  select: string = QR_HOST_SELECT,
): Promise<HostQueryResult<T>> {
  const { data, error } = await admin
    .from("hosts")
    .select(select)
    .eq("is_active", true)
    .order("name")

  if (error) {
    return { ok: false, error: error.message || "Failed to load hosts" }
  }
  return { ok: true, hosts: (data ?? []) as T[] }
}

export type ActiveHostLookup =
  | { ok: true; host: { id: string } }
  | { ok: false; error: string; status: number }

/**
 * Confirm hostId is an existing active host. Not scoped to a location.
 */
export async function findActiveHost(admin: AnyHostsClient, hostId: string): Promise<ActiveHostLookup> {
  const { data, error } = await admin
    .from("hosts")
    .select("id")
    .eq("id", hostId)
    .eq("is_active", true)
    .maybeSingle()
  if (error) {
    return { ok: false, error: "Could not validate host", status: 500 }
  }
  if (!data) {
    return { ok: false, error: "Invalid host", status: 400 }
  }
  return { ok: true, host: data }
}
