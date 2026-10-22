import { NextResponse } from "next/server"
import { requireBuiltInAdmin } from "@/lib/admin-auth"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/server"
import { REPORT_KIND_LABELS } from "@/lib/reports/types"
import { buildReport, sendBuiltReport } from "@/lib/reports/run"
import { adhocPeriodLabel, adhocScheduleName, adhocWindow, parseAdhocSendBody } from "@/lib/reports/send"

const inFlight = new Map<string, number>()

function beginSend(key: string): boolean {
  const now = Date.now()
  const started = inFlight.get(key)
  if (started && now - started < 15_000) return false
  inFlight.set(key, now)
  return true
}

function endSend(key: string) {
  inFlight.delete(key)
}

export async function POST(request: Request) {
  const auth = await requireBuiltInAdmin()
  if (!auth.ok) return auth.response

  const limited = rateLimit(`reports-adhoc:${auth.user.userId}:${clientIp(request)}`, 6, 10 * 60 * 1000)
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many report emails. Try again in a few minutes." }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

  const parsed = parseAdhocSendBody(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const input = parsed.value
  const guardKey = `${auth.user.userId}:${input.kind}:${input.period}:${input.recipients.join(",")}`
  if (!beginSend(guardKey)) {
    return NextResponse.json({ error: "That send is already in progress." }, { status: 409 })
  }

  const admin = createAdminClient()
  const window = adhocWindow(input)
  const periodLabel = adhocPeriodLabel(input)
  const scheduleName = adhocScheduleName(input.kind)

  try {
    const report = await buildReport(admin, {
      kind: input.kind,
      locationIds: input.locationIds,
      visitorTypeIds: input.kind === "employees" ? [] : input.visitorTypeIds,
      from: window.start.toISOString(),
      to: window.end.toISOString(),
    })
    const sent = await sendBuiltReport({
      admin,
      scheduleName,
      kind: input.kind,
      format: input.format,
      recipients: input.recipients,
      periodStart: window.start.toISOString(),
      periodEnd: window.end.toISOString(),
      timezone: input.timezone,
      locationIds: input.locationIds,
      report,
      badge: "Ad-hoc report",
      periodLabel,
      extraLines: [{ label: "Sent from", value: "Reports dashboard" }],
    })
    if (!sent.sent) {
      await admin.from("audit_logs").insert({
        user_id: auth.user.userId,
        action: "reports.sent_adhoc",
        entity_type: "report",
        description: `Ad-hoc ${REPORT_KIND_LABELS[input.kind]} send failed: ${sent.reason || "send_failed"}`,
        metadata: {
          ok: false,
          kind: input.kind,
          format: input.format,
          period: input.period,
          customStart: input.customStart,
          customEnd: input.customEnd,
          timezone: input.timezone,
          locationCount: input.locationIds.length,
          visitorTypeCount: input.visitorTypeIds.length,
          recipientCount: input.recipients.length,
          rowCount: report.rowCount,
          truncated: report.truncated,
          reason: sent.reason || "send_failed",
        },
      })
      return NextResponse.json({ error: sent.reason || "Failed to send report" }, { status: 502 })
    }

    await admin.from("audit_logs").insert({
      user_id: auth.user.userId,
      action: "reports.sent_adhoc",
      entity_type: "report",
      description: `Sent ad-hoc ${REPORT_KIND_LABELS[input.kind]} to ${input.recipients.length} recipients (${report.rowCount} rows)`,
      metadata: {
        ok: true,
        kind: input.kind,
        format: input.format,
        period: input.period,
        customStart: input.customStart,
        customEnd: input.customEnd,
        timezone: input.timezone,
        locationCount: input.locationIds.length,
        visitorTypeCount: input.visitorTypeIds.length,
        recipientCount: input.recipients.length,
        rowCount: report.rowCount,
        truncated: report.truncated,
      },
    })
    return NextResponse.json({
      ok: true,
      rowCount: report.rowCount,
      truncated: report.truncated,
      recipientCount: input.recipients.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send report"
    await admin.from("audit_logs").insert({
      user_id: auth.user.userId,
      action: "reports.sent_adhoc",
      entity_type: "report",
      description: `Ad-hoc ${REPORT_KIND_LABELS[input.kind]} send failed: ${message}`,
      metadata: {
        ok: false,
        kind: input.kind,
        format: input.format,
        period: input.period,
        locationCount: input.locationIds.length,
        recipientCount: input.recipients.length,
      },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    endSend(guardKey)
  }
}
