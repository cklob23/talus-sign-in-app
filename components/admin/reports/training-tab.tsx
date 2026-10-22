"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { formatReportDateTime, trainingMethodLabel, trainingStatus } from "@/lib/reports/rows"
import { ReportFilterBar, type FilterOption } from "./filter-bar"
import { downloadReportCsv } from "./download"

export interface TrainingRow {
  id: string
  completed_at: string | null
  expires_at: string | null
  source: string | null
  visitor: { first_name: string; last_name: string; email: string | null; company: string | null } | null
  visitor_type: { name: string; location_id?: string | null } | null
  location: { name: string; timezone: string | null } | null
  location_id?: string | null
}

export function TrainingTab({
  period,
  onPeriodChange,
  locations,
  selectedLocations,
  onLocationsChange,
  visitorTypes,
  selectedVisitorTypes,
  onVisitorTypesChange,
  fromIso,
  toIso,
  previewRows,
}: {
  period: string
  onPeriodChange: (value: string) => void
  locations: FilterOption[]
  selectedLocations: string[]
  onLocationsChange: (next: string[]) => void
  visitorTypes: FilterOption[]
  selectedVisitorTypes: string[]
  onVisitorTypesChange: (next: string[]) => void
  fromIso: string
  toIso: string
  previewRows?: TrainingRow[]
}) {
  const [rows, setRows] = useState<TrainingRow[]>(previewRows || [])
  const [loading, setLoading] = useState(!previewRows)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = Date.now()

  useEffect(() => {
    if (previewRows) {
      setRows(previewRows)
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      let query = supabase
        .from("training_completions")
        .select(
          "id, completed_at, expires_at, source, location_id, visitor:visitors(first_name, last_name, email, company), visitor_type:visitor_types(name, location_id), location:locations(name, timezone)",
        )
        .gte("completed_at", fromIso)
        .lt("completed_at", toIso)
        .order("completed_at", { ascending: false })
        .limit(200)
      if (selectedVisitorTypes.length) query = query.in("visitor_type_id", selectedVisitorTypes)
      const { data, error: loadError } = await query
      if (cancelled) return
      if (loadError) {
        setError(loadError.message)
        setRows([])
      } else {
        setError(null)
        const list = (data || []) as TrainingRow[]
        const allowed = new Set(selectedLocations)
        setRows(
          selectedLocations.length === 0
            ? list
            : list.filter((row) => {
                if (row.location_id && allowed.has(row.location_id)) return true
                const typeLoc = row.visitor_type?.location_id
                return !row.location_id && typeLoc && allowed.has(typeLoc)
              }),
        )
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [fromIso, toIso, selectedLocations, selectedVisitorTypes, previewRows])

  const cleared = rows.filter((row) => trainingStatus(row.expires_at, now) === "Cleared").length

  async function exportCsv() {
    setExporting(true)
    setError(null)
    try {
      await downloadReportCsv({
        kind: "training",
        locations: selectedLocations,
        visitorTypes: selectedVisitorTypes,
        from: fromIso,
        to: toIso,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export CSV")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ReportFilterBar
          period={period}
          onPeriodChange={onPeriodChange}
          locations={locations}
          selectedLocations={selectedLocations}
          onLocationsChange={onLocationsChange}
          visitorTypes={visitorTypes}
          selectedVisitorTypes={selectedVisitorTypes}
          onVisitorTypesChange={onVisitorTypesChange}
          showVisitorTypes
        />
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
        <Card>
          <CardHeader className="pb-1 p-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Completions</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl sm:text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 p-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Cleared</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl sm:text-2xl font-bold">{cleared}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 p-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Expired</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl sm:text-2xl font-bold">{rows.length - cleared}</div>
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Training completions</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Times are shown in each site timezone. Status is cleared or expired as of now.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading training data...</p>
          ) : rows.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No completions in this period</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const status = trainingStatus(row.expires_at, now)
                    const zone = row.location?.timezone
                    const name = row.visitor ? `${row.visitor.first_name} ${row.visitor.last_name}`.trim() : ""
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{name || "Visitor"}</div>
                          <div className="text-xs text-muted-foreground">{row.visitor?.email}</div>
                        </TableCell>
                        <TableCell>{row.visitor?.company || "-"}</TableCell>
                        <TableCell>{row.visitor_type?.name || "-"}</TableCell>
                        <TableCell>{row.location?.name || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatReportDateTime(row.completed_at, zone)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatReportDateTime(row.expires_at, zone)}</TableCell>
                        <TableCell>
                          <Badge variant={status === "Cleared" ? "default" : "outline"}>{status}</Badge>
                        </TableCell>
                        <TableCell>{trainingMethodLabel(row.source) || "-"}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
