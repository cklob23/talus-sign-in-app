import { isMissingColumn, isUndefinedTable, isUniqueViolation } from "@/lib/idempotency"
import { computeNextRunAt, isScheduleDue, resolveReportPeriod } from "./period.ts"
import { decideExistingRun } from "./idempotency.ts"
import {
  isRangeType,
  isDurationUnit,
  isReportFormat,
  isReportFrequency,
  isReportKind,
  parseIncludeTableFlag,
  parseRecipientList,
  type DurationUnit,
  type ReportFormat,
  type ReportFrequency,
  type ReportKind,
  type RangeType,
  type ReportSchedule,
  type ReportScheduleInput,
} from "./types.ts"

type AnyClient = {
  from: (table: string) => any
}

export const COMMON_REPORT_TIMEZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Africa/Nairobi",
  "UTC",
]

export function parseUuidList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0)
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return []
}

export function parseScheduleBody(body: Record<string, unknown>): { ok: true; value: ReportScheduleInput } | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return { ok: false, error: "Name is required" }
  if (name.length > 120) return { ok: false, error: "Name must be 120 characters or fewer" }

  const kindRaw = typeof body.kind === "string" ? body.kind : ""
  if (!isReportKind(kindRaw)) return { ok: false, error: "Choose visitor sign-ins, employee sign-ins, or training completions" }

  const rangeRaw = typeof body.rangeType === "string" ? body.rangeType : typeof body.range_type === "string" ? body.range_type : ""
  if (!isRangeType(rangeRaw)) return { ok: false, error: "Choose a valid date range" }

  const frequencyRaw = typeof body.frequency === "string" ? body.frequency : ""
  if (!isReportFrequency(frequencyRaw)) return { ok: false, error: "Choose daily, weekly, or monthly" }

  const formatRaw = typeof body.format === "string" ? body.format : "csv"
  if (!isReportFormat(formatRaw)) return { ok: false, error: "Choose CSV attachment, inline summary, or both" }

  const durationRaw =
    typeof body.durationUnit === "string"
      ? body.durationUnit
      : typeof body.duration_unit === "string"
        ? body.duration_unit
        : "minutes"
  if (!isDurationUnit(durationRaw)) return { ok: false, error: "Choose minutes or hours for duration" }

  const sendTime = typeof body.sendTime === "string" ? body.sendTime : typeof body.send_time === "string" ? body.send_time : ""
  if (!/^\d{1,2}:\d{2}$/.test(sendTime.trim())) return { ok: false, error: "Send time must be HH:MM" }

  const timezone =
    typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "America/Chicago"

  const recipients = parseRecipientList(
    (body.recipients as string | string[]) || (typeof body.recipientText === "string" ? body.recipientText : ""),
  )
  if (recipients.length === 0) return { ok: false, error: "Add at least one recipient email" }

  const lastNDaysRaw = body.lastNDays ?? body.last_n_days
  const lastNDays =
    rangeRaw === "last_n_days"
      ? Math.round(Number(lastNDaysRaw))
      : lastNDaysRaw == null || lastNDaysRaw === ""
        ? null
        : Math.round(Number(lastNDaysRaw))
  if (rangeRaw === "last_n_days" && (!Number.isInteger(lastNDays) || (lastNDays as number) < 1 || (lastNDays as number) > 365)) {
    return { ok: false, error: "Last N days must be between 1 and 365" }
  }

  const weekdayRaw = body.weekday
  const weekday =
    frequencyRaw === "weekly"
      ? Number(weekdayRaw)
      : weekdayRaw == null || weekdayRaw === ""
        ? null
        : Number(weekdayRaw)
  if (frequencyRaw === "weekly" && (!Number.isInteger(weekday) || (weekday as number) < 0 || (weekday as number) > 6)) {
    return { ok: false, error: "Choose a weekday for weekly reports" }
  }

  const monthDayRaw = body.monthDay ?? body.month_day
  const monthDay =
    frequencyRaw === "monthly"
      ? Number(monthDayRaw)
      : monthDayRaw == null || monthDayRaw === ""
        ? null
        : Number(monthDayRaw)
  if (frequencyRaw === "monthly" && (!Number.isInteger(monthDay) || (monthDay as number) < 1 || (monthDay as number) > 31)) {
    return { ok: false, error: "Choose a day of the month between 1 and 31" }
  }

  return {
    ok: true,
    value: {
      name,
      kind: kindRaw as ReportKind,
      locationIds: parseUuidList(body.locationIds ?? body.location_ids),
      visitorTypeIds: parseUuidList(body.visitorTypeIds ?? body.visitor_type_ids),
      rangeType: rangeRaw as RangeType,
      lastNDays: lastNDays && Number.isFinite(lastNDays) ? lastNDays : null,
      frequency: frequencyRaw as ReportFrequency,
      weekday: weekday == null || Number.isNaN(weekday) ? null : weekday,
      monthDay: monthDay == null || Number.isNaN(monthDay) ? null : monthDay,
      sendTime: sendTime.trim().padStart(5, "0"),
      timezone,
      recipients,
      format: formatRaw as ReportFormat,
      durationUnit: durationRaw as DurationUnit,
      includeTable: parseIncludeTableFlag(body.includeTable ?? body.include_table),
      enabled: body.enabled !== false,
    },
  }
}

export function scheduleToRow(input: ReportScheduleInput, nextRunAt: string | null, createdBy?: string | null) {
  return {
    name: input.name,
    kind: input.kind,
    location_ids: input.locationIds,
    visitor_type_ids: input.visitorTypeIds,
    range_type: input.rangeType,
    last_n_days: input.lastNDays,
    frequency: input.frequency,
    weekday: input.weekday,
    month_day: input.monthDay,
    send_time: input.sendTime,
    timezone: input.timezone,
    recipients: input.recipients,
    format: input.format,
    duration_unit: input.durationUnit,
    include_table: input.includeTable === true,
    enabled: input.enabled,
    next_run_at: nextRunAt,
    ...(createdBy ? { created_by: createdBy } : {}),
    updated_at: new Date().toISOString(),
  }
}

export function rowToSchedule(row: Record<string, unknown>): ReportSchedule {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    kind: (isReportKind(String(row.kind)) ? row.kind : "visitors") as ReportKind,
    locationIds: parseUuidList(row.location_ids),
    visitorTypeIds: parseUuidList(row.visitor_type_ids),
    rangeType: (isRangeType(String(row.range_type)) ? row.range_type : "previous_day") as RangeType,
    lastNDays: row.last_n_days == null ? null : Number(row.last_n_days),
    frequency: (isReportFrequency(String(row.frequency)) ? row.frequency : "daily") as ReportFrequency,
    weekday: row.weekday == null ? null : Number(row.weekday),
    monthDay: row.month_day == null ? null : Number(row.month_day),
    sendTime: String(row.send_time || "08:00"),
    timezone: String(row.timezone || "America/Chicago"),
    recipients: parseRecipientList(Array.isArray(row.recipients) ? (row.recipients as string[]) : []),
    format: (isReportFormat(String(row.format)) ? row.format : "csv") as ReportFormat,
    durationUnit: (isDurationUnit(String(row.duration_unit)) ? row.duration_unit : "minutes") as DurationUnit,
    includeTable: parseIncludeTableFlag(row.include_table),
    enabled: row.enabled !== false,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  }
}

function recipientsFromRow(row: Record<string, unknown>): string[] {
  if (Array.isArray(row.recipients)) {
    return parseRecipientList(row.recipients as string[])
  }
  return []
}

export function hydrateSchedule(row: Record<string, unknown>): ReportSchedule {
  const base = rowToSchedule(row)
  return { ...base, recipients: recipientsFromRow(row) }
}

const OPTIONAL_SCHEDULE_WRITE_FIELDS = ["include_table", "duration_unit"] as const

function omitField(row: Record<string, unknown>, field: string): Record<string, unknown> {
  const next = { ...row }
  delete next[field]
  return next
}

export function missingColumnName(error: { message?: string } | null | undefined): string | null {
  const message = error?.message || ""
  const postgrest = message.match(/Could not find the '(\w+)' column/i)
  if (postgrest) return postgrest[1]
  const postgres = message.match(
    /column ["']?([a-zA-Z0-9_]+)["']?(?: of relation ["']?[a-zA-Z0-9_]+["']?)? does not exist/i,
  )
  return postgres?.[1] ?? null
}

/** Insert or update, stripping optional columns on 42703 / PGRST204 so a pre-SQL deploy does not 500. */
export async function writeReportSchedule(
  admin: AnyClient,
  mode: "insert" | "update",
  row: Record<string, unknown>,
  id?: string,
) {
  let payload: Record<string, unknown> = { ...row }
  if (mode === "insert" && payload.include_table !== true) {
    payload = omitField(payload, "include_table")
  }
  const attempt = () =>
    mode === "insert"
      ? admin.from("report_schedules").insert(payload).select("*").single()
      : admin.from("report_schedules").update(payload).eq("id", id).select("*").single()

  let result = await attempt()
  while (result.error && isMissingColumn(result.error)) {
    const missing = missingColumnName(result.error)
    const field =
      missing && missing in payload
        ? missing
        : OPTIONAL_SCHEDULE_WRITE_FIELDS.find((column) => column in payload)
    if (!field) break
    payload = omitField(payload, field)
    result = await attempt()
  }
  return result
}

export function nextRunIso(input: Pick<ReportScheduleInput, "frequency" | "weekday" | "monthDay" | "sendTime" | "timezone">, after = new Date()): string {
  return computeNextRunAt(input, after).toISOString()
}

export function periodForSchedule(schedule: Pick<ReportScheduleInput, "rangeType" | "lastNDays" | "timezone">, now = new Date()) {
  return resolveReportPeriod({
    rangeType: schedule.rangeType,
    lastNDays: schedule.lastNDays,
    timezone: schedule.timezone,
    now,
  })
}

export async function listDueSchedules(admin: AnyClient, now = new Date()): Promise<ReportSchedule[]> {
  const { data, error } = await admin
    .from("report_schedules")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(100)

  if (error) {
    if (isUndefinedTable(error)) return []
    throw new Error(error.message || "Failed to load due report schedules")
  }
  return (data || []).map((row: Record<string, unknown>) => hydrateSchedule(row)).filter((row: ReportSchedule) =>
    isScheduleDue(row.enabled, row.nextRunAt, now.getTime()),
  )
}

export interface ClaimedRun {
  id: string
  reused: boolean
  skip: boolean
  reason?: "sent" | "inflight"
}

export async function claimScheduledRun(
  admin: AnyClient,
  args: {
    scheduleId: string
    periodStart: string
    periodEnd: string
    recipients: string[]
    now?: Date
  },
): Promise<ClaimedRun> {
  const now = args.now ?? new Date()
  const { data: existing } = await admin
    .from("report_runs")
    .select("id, status, started_at")
    .eq("schedule_id", args.scheduleId)
    .eq("period_start", args.periodStart)
    .eq("trigger", "scheduled")
    .maybeSingle()

  const decision = decideExistingRun(existing, now.getTime())
  if (decision === "skip_sent") {
    return { id: existing.id, reused: true, skip: true, reason: "sent" }
  }
  if (decision === "skip_inflight") {
    return { id: existing.id, reused: true, skip: true, reason: "inflight" }
  }
  if (decision === "reuse") {
    await admin
      .from("report_runs")
      .update({
        status: "running",
        period_end: args.periodEnd,
        recipients: args.recipients,
        error: null,
        started_at: now.toISOString(),
        finished_at: null,
      })
      .eq("id", existing.id)
    return { id: existing.id, reused: true, skip: false }
  }

  const inserted = await admin
    .from("report_runs")
    .insert({
      schedule_id: args.scheduleId,
      trigger: "scheduled",
      status: "running",
      period_start: args.periodStart,
      period_end: args.periodEnd,
      recipients: args.recipients,
      started_at: now.toISOString(),
    })
    .select("id")
    .single()

  if (!inserted.error && inserted.data?.id) {
    return { id: inserted.data.id, reused: false, skip: false }
  }
  if (isUniqueViolation(inserted.error)) {
    const { data: raced } = await admin
      .from("report_runs")
      .select("id, status, started_at")
      .eq("schedule_id", args.scheduleId)
      .eq("period_start", args.periodStart)
      .eq("trigger", "scheduled")
      .maybeSingle()
    const racedDecision = decideExistingRun(raced, now.getTime())
    if (racedDecision === "skip_sent" || racedDecision === "skip_inflight") {
      return { id: raced?.id || "", reused: true, skip: true, reason: racedDecision === "skip_sent" ? "sent" : "inflight" }
    }
    if (raced?.id) {
      return { id: raced.id, reused: true, skip: false }
    }
  }
  throw new Error(inserted.error?.message || "Failed to claim report run")
}

export async function insertManualRun(
  admin: AnyClient,
  args: {
    scheduleId: string
    periodStart: string
    periodEnd: string
    recipients: string[]
    now?: Date
  },
): Promise<string> {
  const now = args.now ?? new Date()
  const inserted = await admin
    .from("report_runs")
    .insert({
      schedule_id: args.scheduleId,
      trigger: "manual",
      status: "running",
      period_start: args.periodStart,
      period_end: args.periodEnd,
      recipients: args.recipients,
      started_at: now.toISOString(),
    })
    .select("id")
    .single()
  if (inserted.error || !inserted.data?.id) {
    throw new Error(inserted.error?.message || "Failed to start report run")
  }
  return inserted.data.id
}

export async function finishRun(
  admin: AnyClient,
  runId: string,
  result: { status: "sent" | "failed"; rowCount?: number; error?: string | null },
) {
  await admin
    .from("report_runs")
    .update({
      status: result.status,
      row_count: result.rowCount ?? null,
      error: result.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId)
}

export async function advanceNextRun(admin: AnyClient, schedule: ReportSchedule, after = new Date()) {
  const next = nextRunIso(schedule, after)
  await admin.from("report_schedules").update({ next_run_at: next, updated_at: new Date().toISOString() }).eq("id", schedule.id)
  return next
}
