import { isUndefinedColumn } from "@/lib/idempotency"

/**
 * Photo is required unless a visitor type explicitly turns it off.
 * Missing column (pre-010) or a null value keep the old "always ask" behaviour.
 */
export function typeRequiresPhoto(type: { requires_photo?: boolean | null } | null | undefined): boolean {
  if (!type) return true
  if (type.requires_photo === false) return false
  return true
}

export const VISITOR_TYPE_SELECT_WITH_PHOTO =
  "id, name, badge_color, requires_host, requires_company, requires_training, requires_nda, requires_photo, training_title, training_video_url, location_id, created_at"

export const VISITOR_TYPE_SELECT_WITHOUT_PHOTO =
  "id, name, badge_color, requires_host, requires_company, requires_training, requires_nda, training_title, training_video_url, location_id, created_at"

export interface VisitorTypePhotoRow {
  id: string
  name: string
  badge_color: string | null
  requires_host: boolean
  requires_company: boolean
  requires_training: boolean
  requires_nda: boolean
  requires_photo: boolean
  training_title: string | null
  training_video_url: string | null
  location_id?: string
  created_at?: string
}

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>

/**
 * Load visitor types. If 010 has not been applied, retry without requires_photo
 * and treat every type as photo-required.
 */
export async function fetchVisitorTypesWithPhoto(
  query: (columns: string) => QueryResult<Record<string, unknown>>,
): Promise<{ data: VisitorTypePhotoRow[]; error: { code?: string; message?: string } | null }> {
  const first = await query(VISITOR_TYPE_SELECT_WITH_PHOTO)
  if (!first.error && first.data) {
    return { data: first.data.map(normalizeVisitorTypeRow), error: null }
  }
  if (isUndefinedColumn(first.error)) {
    const retry = await query(VISITOR_TYPE_SELECT_WITHOUT_PHOTO)
    if (retry.error) return { data: [], error: retry.error }
    return { data: (retry.data ?? []).map(normalizeVisitorTypeRow), error: null }
  }
  return { data: [], error: first.error }
}

export function normalizeVisitorTypeRow(row: Record<string, unknown>): VisitorTypePhotoRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    badge_color: (row.badge_color as string | null) ?? null,
    requires_host: Boolean(row.requires_host),
    requires_company: Boolean(row.requires_company),
    requires_training: Boolean(row.requires_training),
    requires_nda: Boolean(row.requires_nda),
    requires_photo: row.requires_photo === false ? false : true,
    training_title: (row.training_title as string | null) ?? null,
    training_video_url: (row.training_video_url as string | null) ?? null,
    location_id: row.location_id ? String(row.location_id) : undefined,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }
}
