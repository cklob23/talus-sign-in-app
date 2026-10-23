import { NextResponse } from "next/server"
import { requireAdminApiUser } from "@/lib/admin-auth"
import { hasPermission, type PermissionKey } from "@/lib/permissions"
import { createAdminClient } from "@/lib/supabase/server"
import { csvFilename } from "@/lib/reports/csv"
import { REPORT_EXPORT_MAX_ROWS, resolveOnDemandWindow } from "@/lib/reports/period"
import { parseUuidList } from "@/lib/reports/schedule"
import { isReportKind } from "@/lib/reports/types"
import { buildReport, reportCsvChunks } from "@/lib/reports/run"

function canExport(role: string, permissions: Set<PermissionKey>) {
  if (role === "admin" || role === "super_admin") return true
  return hasPermission(permissions, "reports")
}

export async function GET(request: Request) {
  const auth = await requireAdminApiUser()
  if (!auth.ok) return auth.response
  if (!canExport(auth.user.role, auth.user.permissions)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const url = new URL(request.url)
  const kind = url.searchParams.get("kind") || ""
  if (!isReportKind(kind)) {
    return NextResponse.json({ error: "kind must be visitors, employees, or training" }, { status: 400 })
  }

  const period = url.searchParams.get("period") || ""
  const timezone = url.searchParams.get("timezone") || ""
  let from = url.searchParams.get("from") || ""
  let to = url.searchParams.get("to") || ""

  if (period) {
    const window = resolveOnDemandWindow({
      period,
      timezone,
      customStart: url.searchParams.get("customStart"),
      customEnd: url.searchParams.get("customEnd"),
    })
    from = window.start.toISOString()
    to = window.end.toISOString()
  }

  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return NextResponse.json({ error: "from and to must be valid ISO datetimes with to after from" }, { status: 400 })
  }

  const admin = createAdminClient()
  const report = await buildReport(admin, {
    kind,
    locationIds: parseUuidList(url.searchParams.get("locations") || ""),
    visitorTypeIds: parseUuidList(url.searchParams.get("visitorTypes") || ""),
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
  })

  const filename = csvFilename(kind, new Date(fromMs).toISOString(), new Date(toMs).toISOString())
  const encoder = new TextEncoder()
  const chunks = reportCsvChunks(report.csvRows)
  let index = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[index]))
      index += 1
    },
  })

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Report-Row-Count": String(report.rowCount),
      "X-Report-Truncated": report.truncated ? "1" : "0",
      "X-Report-Row-Cap": String(REPORT_EXPORT_MAX_ROWS),
    },
  })
}
