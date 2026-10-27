import { sanitizeAppUrl, sanitizePlainText } from "@/lib/html-escape"
import { DEFAULT_REPORT_TIMEZONE, REPORT_VIEW_MAX_RANGE_DAYS } from "./period.ts"
import { isDurationUnit, isReportKind, type DurationUnit, type ReportKind } from "./types.ts"

export const REPORT_VIEW_PATH = "/admin/reports/view"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 40

export interface ReportViewFilters {
  kind: ReportKind
  from: string
  to: string
  locationIds: string[]
  visitorTypeIds: string[]
  durationUnit: DurationUnit
  timezone: string
  name: string
}

export interface ReportViewUrlArgs {
  kind: ReportKind
  from: string
  to: string
  locationIds?: string[]
  visitorTypeIds?: string[]
  durationUnit?: DurationUnit
  timezone?: string
  name?: string
}

function parseIso(value: string | null | undefined): string {
  if (!value) return ""
  const trimmed = value.trim()
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) return ""
  return new Date(ms).toISOString()
}

function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(",")) {
    const id = part.trim()
    if (!UUID_RE.test(id)) continue
    const key = id.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(id)
    if (out.length >= MAX_IDS) break
  }
  return out
}

function parseTimezone(value: string | null | undefined): string {
  const raw = (value || "").trim()
  if (!raw || raw.length > 80) return ""
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date())
    return raw
  } catch {
    return ""
  }
}

function searchValue(
  search: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  if (search instanceof URLSearchParams) return search.get(key)
  const value = search[key]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** Relative path for this report run. Query holds filters only — no row PII. */
export function buildReportViewPath(filters: ReportViewUrlArgs): string {
  const params = new URLSearchParams()
  params.set("kind", filters.kind)
  params.set("from", filters.from)
  params.set("to", filters.to)
  if (filters.locationIds?.length) params.set("locations", filters.locationIds.join(","))
  if (filters.visitorTypeIds?.length) params.set("visitorTypes", filters.visitorTypeIds.join(","))
  if (filters.durationUnit && filters.durationUnit !== "minutes") {
    params.set("durationUnit", filters.durationUnit)
  }
  if (filters.timezone) params.set("tz", filters.timezone)
  const name = sanitizePlainText(filters.name || "", 120)
  if (name) params.set("name", name)
  return `${REPORT_VIEW_PATH}?${params.toString()}`
}

export function buildReportViewUrl(origin: string, filters: ReportViewUrlArgs): string {
  const base = origin.trim().replace(/\/+$/, "")
  if (!base) return ""
  return sanitizeAppUrl(`${base}${buildReportViewPath(filters)}`)
}

export function clampReportViewRange(from: string, to: string): { from: string; to: string; clamped: boolean } {
  const start = Date.parse(from)
  const end = Date.parse(to)
  const maxMs = REPORT_VIEW_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { from, to, clamped: false }
  }
  if (end - start <= maxMs) return { from, to, clamped: false }
  return { from: new Date(end - maxMs).toISOString(), to, clamped: true }
}

export function parseReportViewSearch(
  search: URLSearchParams | Record<string, string | string[] | undefined>,
): ReportViewFilters | null {
  const kindRaw = searchValue(search, "kind") || ""
  if (!isReportKind(kindRaw)) return null
  const from = parseIso(searchValue(search, "from"))
  const to = parseIso(searchValue(search, "to"))
  if (!from || !to || from >= to) return null
  const durationRaw = searchValue(search, "durationUnit") || searchValue(search, "duration_unit") || "minutes"
  const durationUnit = isDurationUnit(durationRaw) ? durationRaw : "minutes"
  return {
    kind: kindRaw,
    from,
    to,
    locationIds: parseIds(searchValue(search, "locations")),
    visitorTypeIds: parseIds(searchValue(search, "visitorTypes")),
    durationUnit,
    timezone: parseTimezone(searchValue(search, "tz") || searchValue(search, "timezone")) || DEFAULT_REPORT_TIMEZONE,
    name: sanitizePlainText(searchValue(search, "name") || "", 120),
  }
}
