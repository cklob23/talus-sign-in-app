"use client"

import { ReportFilterBar } from "@/components/admin/reports/filter-bar"
import { ScheduleForm } from "@/components/admin/reports/schedule-form"
import { ScheduledTab } from "@/components/admin/reports/scheduled-tab"
import { SendReportDialog } from "@/components/admin/reports/send-dialog"
import { TrainingTab } from "@/components/admin/reports/training-tab"
import { Toaster } from "@/components/ui/toaster"
import { renderReportEmail } from "@/lib/reports/email"
import { DASHBOARD_PERIODS, type ReportRun, type ReportSchedule } from "@/lib/reports/types"

const locations = [
  { id: "loc-houston", name: "Houston HQ", timezone: "America/Chicago" },
  { id: "loc-nairobi", name: "Nairobi", timezone: "Africa/Nairobi" },
]

const visitorTypes = [
  { id: "type-contractor", name: "Contractor", locationId: "loc-houston" },
  { id: "type-guest", name: "Guest", locationId: "loc-houston" },
]

const schedules: ReportSchedule[] = [
  {
    id: "sch-1",
    name: "Nightly visitor log",
    kind: "visitors",
    locationIds: ["loc-houston"],
    visitorTypeIds: [],
    rangeType: "previous_day",
    lastNDays: null,
    frequency: "daily",
    weekday: null,
    monthDay: null,
    sendTime: "08:00",
    timezone: "America/Chicago",
    recipients: ["caleb@talusag.com", "ops@partner.com"],
    format: "both",
    enabled: true,
    nextRunAt: "2026-10-23T13:00:00.000Z",
    createdBy: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-21T12:00:00.000Z",
  },
  {
    id: "sch-2",
    name: "Weekly training clearance",
    kind: "training",
    locationIds: [],
    visitorTypeIds: ["type-contractor"],
    rangeType: "previous_week",
    lastNDays: null,
    frequency: "weekly",
    weekday: 1,
    monthDay: null,
    sendTime: "07:30",
    timezone: "America/Chicago",
    recipients: ["safety@talusag.com"],
    format: "csv",
    enabled: true,
    nextRunAt: "2026-10-26T12:30:00.000Z",
    createdBy: null,
    createdAt: "2026-10-10T12:00:00.000Z",
    updatedAt: "2026-10-20T12:00:00.000Z",
  },
]

const runs: ReportRun[] = [
  {
    id: "run-1",
    scheduleId: "sch-1",
    trigger: "scheduled",
    status: "sent",
    periodStart: "2026-10-21T05:00:00.000Z",
    periodEnd: "2026-10-22T05:00:00.000Z",
    rowCount: 18,
    recipients: ["caleb@talusag.com", "ops@partner.com"],
    error: null,
    startedAt: "2026-10-22T13:00:12.000Z",
    finishedAt: "2026-10-22T13:00:18.000Z",
  },
  {
    id: "run-2",
    scheduleId: "sch-1",
    trigger: "manual",
    status: "failed",
    periodStart: "2026-10-20T05:00:00.000Z",
    periodEnd: "2026-10-21T05:00:00.000Z",
    rowCount: 11,
    recipients: ["caleb@talusag.com"],
    error: "smtp_not_configured",
    startedAt: "2026-10-21T15:12:00.000Z",
    finishedAt: "2026-10-21T15:12:01.000Z",
  },
]

const trainingRows = [
  {
    id: "tc-1",
    completed_at: "2026-10-21T15:12:00.000Z",
    expires_at: "2027-10-21T15:12:00.000Z",
    source: "training_link",
    visitor: { first_name: "Diego", last_name: "Mendoza", email: "diego@example.com", company: "Acme Field" },
    visitor_type: { name: "Contractor", location_id: "loc-houston" },
    location: { name: "Houston HQ", timezone: "America/Chicago" },
    location_id: "loc-houston",
  },
  {
    id: "tc-2",
    completed_at: "2026-10-18T08:40:00.000Z",
    expires_at: "2025-10-18T08:40:00.000Z",
    source: "kiosk",
    visitor: { first_name: "Priya", last_name: "Shah", email: "priya@example.com", company: "Northwind" },
    visitor_type: { name: "Guest", location_id: "loc-houston" },
    location: { name: "Houston HQ", timezone: "America/Chicago" },
    location_id: "loc-houston",
  },
  {
    id: "tc-3",
    completed_at: "2026-10-16T11:05:00.000Z",
    expires_at: "2027-10-16T11:05:00.000Z",
    source: "qr",
    visitor: { first_name: "James", last_name: "Otieno", email: "james@example.com", company: "Rift Valley" },
    visitor_type: { name: "Contractor", location_id: "loc-nairobi" },
    location: { name: "Nairobi", timezone: "Africa/Nairobi" },
    location_id: "loc-nairobi",
  },
]

const email = renderReportEmail({
  scheduleName: "Ad-hoc visitor sign-ins",
  kind: "visitors",
  periodStart: "1970-01-01T00:00:00.000Z",
  periodEnd: "2026-10-22T18:00:00.000Z",
  timezone: "America/New_York",
  locationNames: ["Houston HQ"],
  rowCount: 18,
  format: "both",
  csvAttached: true,
  logoUrl: "",
  badge: "Ad-hoc report",
  periodLabel: "All time",
  extraLines: [{ label: "Sent from", value: "Reports dashboard" }],
})
const emailHtml = email.html.replaceAll("Geist,'Segoe UI',Helvetica,Arial,sans-serif", "Liberation Sans,DejaVu Sans,Arial,sans-serif")

export function PreviewReportsScreens({ screen }: { screen?: string }) {
  const only = screen?.trim() || "all"
  const show = (id: string) => only === "all" || only === id

  return (
    <div className="min-h-screen space-y-16 bg-[#eef4f0] p-6">
      <Toaster />
      {show("timeframe") ? (
        <section id="timeframe" className="mx-auto max-w-5xl rounded-xl bg-background p-6 shadow-sm">
          <h1 className="text-2xl font-bold mb-1">Reports</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Sign-in logs, training completions, and scheduled email reports. Times use each site timezone.
          </p>
          <div className="flex flex-wrap items-start gap-6">
            <ReportFilterBar
              period="all"
              onPeriodChange={() => {}}
              locations={locations}
              selectedLocations={[]}
              onLocationsChange={() => {}}
              visitorTypes={visitorTypes}
              selectedVisitorTypes={[]}
              onVisitorTypesChange={() => {}}
              showVisitorTypes
            />
            <div className="w-48 rounded-md border bg-popover p-1 shadow-md">
              {DASHBOARD_PERIODS.map((item) => (
                <div
                  key={item.value}
                  className={`rounded-sm px-2 py-1.5 text-sm ${item.value === "all" ? "bg-accent font-medium" : ""}`}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {show("send-dialog") ? (
        <section id="send-dialog" className="mx-auto max-w-5xl rounded-xl bg-background p-6 shadow-sm min-h-[32rem]">
          <h1 className="text-2xl font-bold mb-4">Reports</h1>
          <SendReportDialog
            open
            onOpenChange={() => {}}
            kind="visitors"
            period="all"
            timezone="America/New_York"
            locationIds={[]}
            visitorTypeIds={[]}
            previewRecipients="caleb@talusag.com, ops@partner.com"
            previewInline
          />
        </section>
      ) : null}

      {show("scheduled-list") ? (
        <section id="scheduled-list" className="mx-auto max-w-5xl rounded-xl bg-background p-6 shadow-sm">
          <ScheduledTab
            locations={locations}
            visitorTypes={visitorTypes}
            previewSchedules={schedules}
            previewRuns={runs}
          />
        </section>
      ) : null}

      {show("schedule-form") ? (
        <section id="schedule-form" className="mx-auto max-w-lg rounded-xl bg-background p-6 shadow-sm">
          <h2 className="text-lg font-semibold">New schedule</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Reports include personal data. A warning appears if a recipient is not @talusag.com.
          </p>
          <ScheduleForm
            initial={schedules[0]}
            locations={locations}
            visitorTypes={visitorTypes}
            submitting={false}
            onSubmit={() => {}}
            onCancel={() => {}}
          />
        </section>
      ) : null}

      {show("training") ? (
        <section id="training" className="mx-auto max-w-5xl rounded-xl bg-background p-6 shadow-sm">
          <h1 className="text-2xl font-bold mb-4">Reports</h1>
          <TrainingTab
            period="all"
            onPeriodChange={() => {}}
            timezone="America/New_York"
            locations={locations}
            selectedLocations={[]}
            onLocationsChange={() => {}}
            visitorTypes={visitorTypes}
            selectedVisitorTypes={[]}
            onVisitorTypesChange={() => {}}
            fromIso="2026-09-22T05:00:00.000Z"
            toIso="2026-10-22T17:00:00.000Z"
            previewRows={trainingRows}
            canSend
          />
        </section>
      ) : null}

      {show("report-email") ? (
        <section id="report-email" className="mx-auto max-w-[720px]">
          <iframe
            title="Report email"
            className="h-[880px] w-full rounded-xl border bg-white"
            srcDoc={emailHtml}
          />
        </section>
      ) : null}
    </div>
  )
}
