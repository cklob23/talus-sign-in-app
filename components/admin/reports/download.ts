export async function downloadReportCsv(params: {
  kind: "visitors" | "employees" | "training"
  locations: string[]
  visitorTypes: string[]
  from: string
  to: string
  durationUnit?: "minutes" | "hours"
}): Promise<void> {
  const qs = new URLSearchParams({
    kind: params.kind,
    from: params.from,
    to: params.to,
  })
  if (params.durationUnit && params.durationUnit !== "minutes") qs.set("durationUnit", params.durationUnit)
  if (params.locations.length) qs.set("locations", params.locations.join(","))
  if (params.visitorTypes.length) qs.set("visitorTypes", params.visitorTypes.join(","))

  const res = await fetch(`/api/admin/reports/export?${qs.toString()}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || "Could not export CSV")
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const disposition = res.headers.get("content-disposition") || ""
  const match = /filename="([^"]+)"/.exec(disposition)
  link.href = url
  link.download = match?.[1] || "report.csv"
  link.click()
  URL.revokeObjectURL(url)
}
