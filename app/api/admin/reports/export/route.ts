import { NextResponse } from "next/server"
import { requireAdminApiUser } from "@/lib/admin-auth"
import { hasPermission, type PermissionKey } from "@/lib/permissions"
import { createAdminClient } from "@/lib/supabase/server"
import { csvFilename } from "@/lib/reports/csv"
import { parseUuidList } from "@/lib/reports/schedule"
import { isReportKind } from "@/lib/reports/types"
import { buildReport } from "@/lib/reports/run"

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

  const from = url.searchParams.get("from") || ""
  const to = url.searchParams.get("to") || ""
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
  return new NextResponse(report.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
