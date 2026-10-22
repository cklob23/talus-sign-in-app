"use client"

import { CalendarCheck, Check, Clock, LogOut, MoreHorizontal, PlayCircle, Search, UserPlus, Users } from "lucide-react"
import { KioskWelcome } from "@/components/kiosk/kiosk-welcome"
import { KioskSiteLine } from "@/components/kiosk/kiosk-site-line"
import { LangToggle } from "@/components/lang-toggle"
import { TalusAgLogo } from "@/components/talusag-logo"
import { visitorCopy } from "@/lib/visitor-i18n"
import { renderHostArrivalEmail } from "@/lib/host-mail"

const copy = visitorCopy("en")

const HOSTS = [
  { id: "1", name: "Maya Chen" },
  { id: "2", name: "Jordan Blake" },
  { id: "3", name: "Priya Shah" },
]

const VISITORS = [
  { name: "Carlos Mendoza", email: "carlos@gulfcoastelectric.com", company: "Gulf Coast Electric", type: "Contractor", host: "Maya Chen", badge: "V4821", inFor: "1h 12m" },
  { name: "Sofia Alvarez", email: "sofia@example.com", company: "Riverbend Farms", type: "Vendor", host: "Jordan Blake", badge: "V4822", inFor: "38m" },
  { name: "Diego Ruiz", email: "diego@gulfcoastelectric.com", company: "Gulf Coast Electric", type: "Contractor", host: "Maya Chen", badge: "V4823", inFor: "16m" },
]

const arrival = renderHostArrivalEmail({
  visitorName: "Carlos Mendoza",
  visitorCompany: "Gulf Coast Electric",
  visitorTypeName: "Contractor",
  locationName: "Houston HQ",
  locationLabel: "Reception",
  signedInBy: "Kiosk",
  badgeNumber: "V4821",
  arrivedAt: "2026-10-22T14:05:00.000Z",
  timeZone: "America/Chicago",
  visitUrl: "https://signin.talusag.com/visit/preview",
  trainingLine: "Cleared",
})

function Frame({
  id,
  title,
  width,
  height,
  children,
}: {
  id: string
  title: string
  width: number
  height: number
  children: React.ReactNode
}) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#55625a]">{title}</h2>
      <div className="overflow-hidden rounded-2xl border bg-white shadow" style={{ width, height }}>
        {children}
      </div>
    </section>
  )
}

function KioskChrome({
  children,
  siteName = "Houston HQ",
  meters = 52,
  unavailable = false,
  noSites = false,
}: {
  children: React.ReactNode
  siteName?: string
  meters?: number | null
  unavailable?: boolean
  noSites?: boolean
}) {
  return (
    <div className="flex h-full flex-col bg-[#f5f8f6]">
      <header className="flex items-center justify-between border-b border-[#dce6df] bg-white px-4 py-3">
        <TalusAgLogo />
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden shrink-0 items-center gap-2 border-r border-[#dce6df] pr-3 text-sm font-medium md:flex">
            <Clock className="h-4 w-4 text-muted-foreground" />
            9:13 AM
          </span>
          {noSites ? (
            <span className="truncate text-sm text-[#8a4500]">{copy.noSitesStaff}</span>
          ) : (
            <KioskSiteLine siteName={siteName} meters={meters} unavailable={unavailable} copy={copy} />
          )}
          <LangToggle lang="en" onLang={() => undefined} />
        </div>
      </header>
      <div className="flex-1 overflow-auto p-6">{children}</div>
    </div>
  )
}

function BeforeWelcome() {
  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <TalusAgLogo />
        <span className="text-sm">Houston HQ · 0ft away</span>
      </header>
      <div className="grid flex-1 grid-cols-3 gap-4 p-8">
        {["Sign In", "Check In", "Sign Out"].map((label) => (
          <div key={label} className="flex flex-col items-center justify-center rounded-xl border p-6">
            <div className="mb-3 h-12 w-12 rounded-full bg-[#00b162]/20" />
            <p className="text-xl font-semibold">{label}</p>
            <p className="text-sm text-gray-500">Visitor action</p>
          </div>
        ))}
        <div className="col-span-3 rounded-xl border p-4">
          <p className="font-semibold">Employee Sign In</p>
          <p className="text-sm text-gray-500">Talus Ag employees sign in here</p>
        </div>
      </div>
    </div>
  )
}

function BeforeDetails() {
  return (
    <div className="flex h-full flex-col bg-white">
      <header className="border-b px-4 py-3">
        <TalusAgLogo />
      </header>
      <div className="mx-auto w-full max-w-xl space-y-3 p-6">
        <h1 className="text-2xl font-bold">Visitor Sign In</h1>
        <p className="text-sm text-gray-500">Please fill out the form below to sign in</p>
        {["First Name", "Last Name", "Email", "Phone", "Visitor Type"].map((label) => (
          <label key={label} className="block text-sm">
            {label}
            <input className="mt-1 h-9 w-full rounded border px-2" defaultValue={label === "Visitor Type" ? "" : ""} />
          </label>
        ))}
        <button className="h-10 w-full rounded bg-[#00b162] text-white">Complete Sign In</button>
        <p className="text-sm text-red-600">Please select a visitor type</p>
      </div>
    </div>
  )
}

function AfterDetails() {
  return (
    <KioskChrome>
      <div className="mx-auto max-w-xl space-y-4">
        <p className="text-sm text-[#55625a]">Step 2 of 4</p>
        <h1 className="text-2xl font-bold">Your details</h1>
        <div className="flex items-center justify-between rounded-xl border bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="h-10 w-1.5 rounded-full bg-[#00854c]" />
            <span className="font-semibold">Contractor</span>
          </div>
          <span className="text-[#00703f]">Change</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            First name *
            <input className="mt-1 min-h-14 w-full rounded-xl border border-[#7b8b7f] px-3" defaultValue="Carlos" />
          </label>
          <label className="text-sm">
            Last name *
            <input className="mt-1 min-h-14 w-full rounded-xl border border-[#7b8b7f] px-3" defaultValue="Mendoza" />
          </label>
        </div>
        <label className="block text-sm">
          Email
          <input className="mt-1 min-h-14 w-full rounded-xl border border-[#7b8b7f] px-3" defaultValue="carlos@gulfcoastelectric.com" />
          <span className="mt-1 block text-xs text-[#55625a]">{copy.emailHint}</span>
        </label>
        <label className="block text-sm">
          Who are you here to see? *
          <select className="mt-1 min-h-14 w-full rounded-xl border border-[#7b8b7f] px-3">
            <option>Maya Chen</option>
          </select>
        </label>
        <button className="min-h-14 w-full rounded-xl bg-[#00854c] text-lg font-semibold text-white">Next: safety video</button>
      </div>
    </KioskChrome>
  )
}

function BeforeHost() {
  return (
    <div className="flex h-full flex-col bg-[#f5f8f6]">
      <header className="border-b bg-white px-4 py-3 text-lg font-bold">Talus Ag</header>
      <div className="flex-1 space-y-3 p-4">
        <h1 className="text-xl font-semibold">Who are you visiting?</h1>
        {HOSTS.map((host) => (
          <div key={host.id} className={`rounded-xl border p-3 ${host.name === "Maya Chen" ? "border-[#00b162] bg-green-50" : "bg-white"}`}>
            {host.name}
          </div>
        ))}
        <p className="text-sm text-red-600">Please choose who you are visiting.</p>
        <button className="h-10 w-full rounded bg-[#00b162] text-white">Continue</button>
      </div>
    </div>
  )
}

function AfterHost() {
  return (
    <div className="visitor-touch flex h-full flex-col bg-[#f5f8f6]">
      <header className="flex items-center justify-between border-b border-[#dce6df] bg-white px-4 py-3">
        <TalusAgLogo className="h-8 w-auto" />
        <LangToggle lang="en" onLang={() => undefined} size="phone" />
      </header>
      <div className="flex-1 space-y-4 p-4">
        <div className="flex gap-1.5">
          <span className="h-1.5 flex-1 rounded-full bg-[#00854c]" />
          <span className="h-1.5 flex-1 rounded-full bg-[#00854c]" />
          <span className="h-1.5 flex-1 rounded-full bg-[#00854c]" />
          <span className="h-1.5 flex-1 rounded-full bg-[#dce6df]" />
        </div>
        <h1 className="text-xl font-semibold">{copy.host}</h1>
        <p className="text-sm text-[#55625a]">{copy.hostHint}</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#55625a]" />
          <input className="min-h-12 w-full rounded-xl border border-[#7b8b7f] pl-9" placeholder={copy.hostSearch} />
        </div>
        {HOSTS.map((host) => (
          <div
            key={host.id}
            className={`flex min-h-14 items-center justify-between rounded-xl border p-3 ${host.name === "Maya Chen" ? "border-[#00854c] bg-[#e2f4e9]" : "bg-white"}`}
          >
            <span className="font-medium">{host.name}</span>
            {host.name === "Maya Chen" ? <Check className="h-5 w-5 text-[#00854c]" /> : null}
          </div>
        ))}
        <button className="min-h-12 w-full rounded-xl bg-[#00854c] font-semibold text-white">{copy.continue}</button>
      </div>
    </div>
  )
}

function BeforeDashboard() {
  return (
    <div className="h-full space-y-4 bg-[#f5f8f6] p-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="flex h-[420px] items-center justify-center rounded-xl border bg-white text-[#55625a]">Map of Houston HQ</div>
      <div className="grid grid-cols-4 gap-3">
        {["Current Visitors", "Employees", "Sign-ins today", "Pending bookings"].map((label) => (
          <div key={label} className="rounded-xl border bg-white p-4">
            <p className="text-sm text-[#55625a]">{label}</p>
            <p className="text-2xl font-bold">3</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AfterDashboard() {
  return (
    <div className="h-full space-y-4 overflow-auto bg-[#f5f8f6] p-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-5 gap-3">
        {[
          ["Current Visitors", "3"],
          ["Current Employees", "2"],
          ["Today's Sign-Ins", "11"],
          ["Avg. Duration", "48 min"],
          ["Pending Bookings", "1"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white p-4">
            <p className="text-sm text-[#55625a]">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-white p-4">
        <p className="mb-3 font-semibold">On site now</p>
        {VISITORS.map((visitor) => (
          <div key={visitor.badge} className="flex items-center justify-between border-t py-2 text-sm">
            <span className="font-medium">{visitor.name}</span>
            <span className="text-[#55625a]">{visitor.host} · {visitor.inFor}</span>
          </div>
        ))}
      </div>
      <div className="flex h-40 items-center justify-center rounded-xl border bg-white text-[#55625a]">Map of Houston HQ</div>
    </div>
  )
}

function BeforeVisitors() {
  return (
    <div className="h-full overflow-hidden bg-[#f5f8f6] p-6">
      <h1 className="mb-4 text-3xl font-bold">Current Visitors</h1>
      <table className="w-full table-fixed border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b text-left">
            {["Visitor", "Email", "Company", "Type", "Location", "Host", "Badge", "Duration", "Actions"].map((h) => (
              <th key={h} className="p-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {VISITORS.map((visitor) => (
            <tr key={visitor.badge} className="border-b">
              <td className="truncate p-2">{visitor.name}</td>
              <td className="truncate p-2">{visitor.email}</td>
              <td className="truncate p-2">{visitor.company}</td>
              <td className="p-2">{visitor.type}</td>
              <td className="p-2">Houston HQ</td>
              <td className="p-2">{visitor.host}</td>
              <td className="p-2">{visitor.badge}</td>
              <td className="p-2">{visitor.inFor}</td>
              <td className="overflow-hidden p-2">P</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AfterVisitors() {
  return (
    <div className="h-full overflow-auto bg-[#f5f8f6] p-6">
      <h1 className="mb-4 text-3xl font-bold">Current Visitors</h1>
      <div className="rounded-xl border bg-white">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b text-left text-[#55625a]">
              <th className="w-[28%] p-3">Visitor</th>
              <th className="w-[16%] p-3">Company</th>
              <th className="w-[12%] p-3">Type</th>
              <th className="w-[14%] p-3">Host</th>
              <th className="w-[10%] p-3">Badge</th>
              <th className="w-[8%] p-3">In</th>
              <th className="w-[160px] p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {VISITORS.map((visitor) => (
              <tr key={visitor.badge} className="border-b">
                <td className="p-3">
                  <p className="font-medium">{visitor.name}</p>
                  <p className="text-xs text-[#55625a]">{visitor.email}</p>
                </td>
                <td className="truncate p-3">{visitor.company}</td>
                <td className="p-3 text-[#00703f]">{visitor.type}</td>
                <td className="p-3">{visitor.host}</td>
                <td className="p-3 font-mono">{visitor.badge}</td>
                <td className="p-3">{visitor.inFor}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <span className="inline-flex min-h-11 items-center rounded-md border px-3">
                      <LogOut className="mr-1 h-4 w-4" />
                      Sign out
                    </span>
                    <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border">
                      <MoreHorizontal className="h-4 w-4" />
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WelcomePreview({
  siteName = "Houston HQ",
  meters = 52,
  unavailable = false,
  noSites = false,
  visitorBlocked = false,
  outside = false,
}: {
  siteName?: string
  meters?: number | null
  unavailable?: boolean
  noSites?: boolean
  visitorBlocked?: boolean
  outside?: boolean
}) {
  return (
    <KioskChrome siteName={siteName} meters={meters} unavailable={unavailable} noSites={noSites}>
      {outside ? (
        <div className="mb-6 rounded-xl border border-[#fff3df] bg-[#fff3df] p-4">
          <p className="font-medium text-[#8a4500]">{copy.geofenceVisitor}</p>
        </div>
      ) : null}
      {noSites ? (
        <div className="mb-6 rounded-xl border border-[#fff3df] bg-[#fff3df] p-4">
          <p className="font-medium text-[#8a4500]">{copy.noSitesStaff}</p>
        </div>
      ) : null}
      <KioskWelcome
        companyName="Talus Ag"
        copy={copy}
        onSignIn={() => undefined}
        onSignOut={() => undefined}
        onBooking={() => undefined}
        onStaff={() => undefined}
        showBooking={!noSites}
        visitorBlocked={visitorBlocked || noSites}
      />
      <p className="mt-8 flex items-center justify-center gap-2 text-sm text-[#55625a]">
        <Clock className="h-4 w-4" />
        Thursday, Oct 22, 2026
      </p>
    </KioskChrome>
  )
}

const HEADER_PREVIEWS: Record<string, Parameters<typeof WelcomePreview>[0]> = {
  "kiosk-welcome-after": {},
  "kiosk-welcome": {},
  "kiosk-header-normal": { siteName: "Test Location", meters: 52 },
  "kiosk-header-noloc": { siteName: "Test Location", meters: null, unavailable: true, visitorBlocked: true },
  "kiosk-header-outside": { siteName: "Test Location", meters: 1200, visitorBlocked: true, outside: true },
  "kiosk-header-nosites": { noSites: true, visitorBlocked: true },
}

export function PreviewUiScreens({ screen, full }: { screen?: string; full?: boolean }) {
  const only = screen?.trim() || "all"
  const show = (id: string) => only === "all" || only === id
  if (full && HEADER_PREVIEWS[only]) {
    return (
      <div className="min-h-screen bg-[#f5f8f6]" style={{ fontFamily: "system-ui, Segoe UI, Helvetica, Arial, sans-serif" }}>
        <WelcomePreview {...HEADER_PREVIEWS[only]} />
      </div>
    )
  }
  return (
    <div className="space-y-16 bg-[#eef4f0] p-6" style={{ fontFamily: "system-ui, Segoe UI, Helvetica, Arial, sans-serif" }}>
      {show("kiosk-welcome-before") ? (
        <Frame id="kiosk-welcome-before" title="Kiosk welcome before" width={1024} height={768}>
          <BeforeWelcome />
        </Frame>
      ) : null}
      {show("kiosk-welcome-after") ? (
        <Frame id="kiosk-welcome-after" title="Kiosk welcome after" width={1024} height={768}>
          <WelcomePreview />
        </Frame>
      ) : null}
      {show("kiosk-details-before") ? (
        <Frame id="kiosk-details-before" title="Kiosk details before" width={768} height={1024}>
          <BeforeDetails />
        </Frame>
      ) : null}
      {show("kiosk-details-after") ? (
        <Frame id="kiosk-details-after" title="Kiosk details after" width={768} height={1024}>
          <AfterDetails />
        </Frame>
      ) : null}
      {show("qr-host-before") ? (
        <Frame id="qr-host-before" title="QR host before" width={390} height={844}>
          <BeforeHost />
        </Frame>
      ) : null}
      {show("qr-host-after") ? (
        <Frame id="qr-host-after" title="QR host after" width={390} height={844}>
          <AfterHost />
        </Frame>
      ) : null}
      {show("admin-dashboard-before") ? (
        <Frame id="admin-dashboard-before" title="Admin dashboard before" width={1280} height={800}>
          <BeforeDashboard />
        </Frame>
      ) : null}
      {show("admin-dashboard-after") ? (
        <Frame id="admin-dashboard-after" title="Admin dashboard after" width={1280} height={800}>
          <AfterDashboard />
        </Frame>
      ) : null}
      {show("admin-visitors-before") ? (
        <Frame id="admin-visitors-before" title="Admin visitors before 1280" width={1280} height={800}>
          <BeforeVisitors />
        </Frame>
      ) : null}
      {show("admin-visitors-after") ? (
        <Frame id="admin-visitors-after" title="Admin visitors after 1280" width={1280} height={800}>
          <AfterVisitors />
        </Frame>
      ) : null}
      {show("arrival-email") ? (
        <section id="arrival-email" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#55625a]">Arrival email after</h2>
          <p className="text-sm text-[#55625a]">
            Subject: {arrival.subject}. Preheader: {arrival.preheader}
          </p>
          <iframe
            title="Arrival email"
            srcDoc={arrival.html}
            className="h-[900px] w-[620px] rounded-2xl border bg-white"
          />
        </section>
      ) : null}
      <div className="hidden">
        <UserPlus className="h-4 w-4" />
        <PlayCircle className="h-4 w-4" />
        <CalendarCheck className="h-4 w-4" />
        <Users className="h-4 w-4" />
      </div>
    </div>
  )
}
