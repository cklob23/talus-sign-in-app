"use client"

import type { ReactNode } from "react"
import { Bell, Calendar, Check, Home, LogOut, MapPin, MoreHorizontal, PlayCircle, Search, Users } from "lucide-react"
import { KioskWelcome } from "@/components/kiosk/kiosk-welcome"
import { KioskTypeStep } from "@/components/kiosk/kiosk-type-step"
import { KioskStepper } from "@/components/kiosk/kiosk-stepper"
import { KioskSiteLine } from "@/components/kiosk/kiosk-site-line"
import { LangToggle } from "@/components/lang-toggle"
import { StatusPill } from "@/components/v2/status-pill"
import { TalusAgLogo } from "@/components/talusag-logo"
import { unlockedHeaderSiteLineClassName } from "@/lib/kiosk-site"
import { visitorCopy } from "@/lib/visitor-i18n"
import { cn } from "@/lib/utils"
import type { VisitorType } from "@/types/database"

const copy = visitorCopy("en")

const HOSTS = [
  { id: "1", name: "Maya Chen" },
  { id: "2", name: "Jordan Blake" },
  { id: "3", name: "Priya Shah" },
]

const VISITORS = [
  { initials: "CM", name: "Carlos Mendoza", company: "Gulf Coast Electric", type: "Contractor", tone: "warn" as const, host: "Maya Chen", badge: "V04821", inFor: "20 min", trained: true },
  { initials: "PN", name: "Priya Nair", company: "Acme Valves", type: "Visitor", tone: "ok" as const, host: "Sam Okafor", badge: "V04822", inFor: "55 min", trained: false },
  { initials: "TB", name: "Tom Becker", company: "FedEx", type: "Delivery", tone: "neu" as const, host: "Lena Ortiz", badge: "V04823", inFor: "1 h 30 min", trained: false },
  { initials: "BW", name: "Bartholomew Chen", company: "Environmental Partners", type: "Contractor", tone: "warn" as const, host: "Hiro Iwanaga", badge: "V04824", inFor: "40 min", trained: true },
  { initials: "AW", name: "Ada Wolfensteiner", company: "Agricultural Sciences", type: "Visitor", tone: "ok" as const, host: "Stanley Tioniny", badge: "V04825", inFor: "12 min", trained: false },
  { initials: "DM", name: "Dolvin Residolvin", company: "Talus", type: "Contractor", tone: "warn" as const, host: "Maya Chen", badge: "V04826", inFor: "2 h", trained: true },
  { initials: "SO", name: "Sam Okafor", company: "Northwind", type: "Guest", tone: "ok" as const, host: "Priya Shah", badge: "V04827", inFor: "8 min", trained: false },
  { initials: "LO", name: "Lena Ortiz", company: "Rift Valley", type: "Interview", tone: "neu" as const, host: "Jordan Blake", badge: "V04828", inFor: "33 min", trained: false },
]

function KioskChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-svh flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border bg-card px-4 py-3">
        <TalusAgLogo className="order-1 shrink-0" />
        <KioskSiteLine
          siteName="Test Location"
          meters={52}
          unavailable={false}
          copy={copy}
          className={unlockedHeaderSiteLineClassName()}
        />
        <div className="order-2 ml-auto flex items-center gap-3 md:order-4">
          <LangToggle lang="en" onLang={() => undefined} />
        </div>
      </header>
      <div className="flex-1 overflow-auto p-4 sm:p-8">{children}</div>
    </div>
  )
}

function PhoneChrome({ children, site, lang = true }: { children: ReactNode; site?: string; lang?: boolean }) {
  return (
    <div className="visitor-touch flex h-full min-h-svh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <TalusAgLogo className="h-8 w-auto" />
        <div className="flex items-center gap-3">
          {site ? <span className="text-sm text-muted-foreground">{site}</span> : null}
          {lang ? <LangToggle lang="en" onLang={() => undefined} size="phone" /> : null}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">{children}</div>
    </div>
  )
}

function AdminChrome({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-dvh bg-background text-foreground [contain:none] [filter:none] [transform:none]">
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-border bg-card p-4 lg:flex">
        <TalusAgLogo className="mb-4" />
        <div className="mb-4 flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-15">
          <MapPin className="h-4 w-4" />
          Houston HQ
        </div>
        <nav className="flex flex-col gap-1 text-sm font-medium">
          <span className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3", title === "Dashboard" ? "bg-accent text-primary-text" : "text-foreground")}>
            <Home className="h-[19px] w-[19px]" /> Dashboard
          </span>
          <span className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3", title === "On site now" ? "bg-accent text-primary-text" : "text-foreground")}>
            <Users className="h-[19px] w-[19px]" /> On site now
          </span>
          <span className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-foreground">
            <Calendar className="h-[19px] w-[19px]" /> Bookings
          </span>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-9">
          <div>
            <h1 className="text-24 font-bold sm:text-32">{title}</h1>
            <p className="text-13 text-muted-foreground sm:text-15">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden min-h-11 w-48 items-center gap-2 rounded-xl border border-border px-3 text-15 text-muted-foreground md:flex">
              <Search className="h-4 w-4" /> Search
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border" aria-label="Theme">
              <Bell className="h-4 w-4" />
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-visible p-4 sm:p-6 lg:p-9">{children}</div>
      </div>
    </div>
  )
}

function KioskWelcomeScreen() {
  return (
    <KioskChrome>
      <KioskWelcome
        companyName="Talus Ag"
        copy={copy}
        onSignIn={() => undefined}
        onSignOut={() => undefined}
        onBooking={() => undefined}
        onStaff={() => undefined}
        showBooking
        offerSignIn
      />
    </KioskChrome>
  )
}

function KioskTypeScreen() {
  return (
    <KioskChrome>
      <KioskTypeStep
        types={[
          { id: "1", name: "Contractor", badge_color: "#f59e0b", requires_host: true, requires_company: true, requires_training: true, requires_nda: false, training_video_url: null, training_title: null, location_id: "loc", created_at: "" },
          { id: "2", name: "Delivery", badge_color: "#3b82f6", requires_host: false, requires_company: true, requires_training: false, requires_nda: false, training_video_url: null, training_title: null, location_id: "loc", created_at: "" },
          { id: "3", name: "Guest", badge_color: "#10b981", requires_host: true, requires_company: false, requires_training: true, requires_nda: false, training_video_url: null, training_title: null, location_id: "loc", created_at: "" },
          { id: "4", name: "Interview", badge_color: "#8b5cf6", requires_host: true, requires_company: false, requires_training: true, requires_nda: false, training_video_url: null, training_title: null, location_id: "loc", created_at: "" },
        ] satisfies VisitorType[]}
        copy={copy}
        onPick={() => undefined}
        onBack={() => undefined}
      />
    </KioskChrome>
  )
}

function KioskBlockedScreen() {
  return (
    <KioskChrome>
      <KioskWelcome
        companyName="Talus Ag"
        copy={copy}
        onSignIn={() => undefined}
        onSignOut={() => undefined}
        onBooking={() => undefined}
        onStaff={() => undefined}
        showBooking
        offerSignIn={false}
        blockedTitle={copy.geofenceVisitor}
        blockedHelp={copy.geofenceBlockedHelp}
        blockedStaffDetail="This kiosk is about 76.2 km from Houston HQ. Sign-in only works within 200 m."
      />
    </KioskChrome>
  )
}

function KioskDetailsScreen() {
  return (
    <KioskChrome>
      <div className="mx-auto max-w-xl space-y-4">
        <KioskStepper current={1} copy={copy} />
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-24 font-bold">{copy.yourDetails}</h1>
          <StatusPill tone="warn">Contractor</StatusPill>
        </div>
        <div className="v2-card space-y-5 p-6">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-15">
              {copy.firstName}
              <input className="mt-1 min-h-14 w-full rounded-xl border border-field bg-card px-3" defaultValue="Carlos" />
            </label>
            <label className="text-15">
              {copy.lastName}
              <input className="mt-1 min-h-14 w-full rounded-xl border-2 border-danger bg-card px-3" defaultValue="" />
              <span className="mt-1 flex items-center gap-1 text-13 text-danger">{copy.lastNameRequired}</span>
            </label>
          </div>
          <label className="block text-15">
            {copy.company}
            <input className="mt-1 min-h-14 w-full rounded-xl border border-field bg-card px-3" defaultValue="Gulf Coast Electric" />
            <span className="mt-1 block text-13 text-muted-foreground">{copy.companyHint}</span>
          </label>
          <label className="block text-15">
            {copy.host}
            <div className="mt-1 flex min-h-14 items-center rounded-xl border border-field bg-card px-3">Maya Chen</div>
          </label>
          <button className="min-h-14 w-full rounded-xl bg-primary text-17 font-semibold text-primary-foreground">{copy.nextTraining}</button>
        </div>
      </div>
    </KioskChrome>
  )
}

function KioskTrainingScreen() {
  return (
    <KioskChrome>
      <div className="mx-auto max-w-5xl">
        <KioskStepper current={2} copy={copy} />
        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <div>
            <div className="relative flex h-64 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-br from-[#0f2a1c] to-[#2c6b49] sm:h-80">
              <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-card text-primary-text">
                <PlayCircle className="h-10 w-10" />
              </div>
              <div className="absolute inset-x-5 bottom-4 flex items-center gap-3 text-white">
                <span className="font-mono text-13">1:42 / 3:00</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/30">
                  <span className="block h-full w-[57%] rounded-full bg-brand-accent" />
                </span>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="h-4 w-4" /> We told Maya Chen you are here. She will meet you in the lobby.
            </p>
          </div>
          <div className="v2-card flex flex-col gap-4 p-6">
            <h2 className="text-20 font-semibold">{copy.trainingTitle}</h2>
            <p className="text-muted-foreground">{copy.trainingHelp}</p>
            <button className="mt-auto min-h-14 rounded-xl bg-surface-2 text-muted-foreground">{copy.trainingAck}</button>
          </div>
        </div>
      </div>
    </KioskChrome>
  )
}

function QrHostScreen() {
  return (
    <PhoneChrome>
      <div className="mb-4 flex gap-1.5">
        <span className="h-1.5 flex-1 rounded-full bg-primary" />
        <span className="h-1.5 flex-1 rounded-full bg-primary" />
        <span className="h-1.5 flex-1 rounded-full bg-primary" />
        <span className="h-1.5 flex-1 rounded-full bg-border" />
      </div>
      <h1 className="text-20 font-semibold">{copy.host}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{copy.hostHint}</p>
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input className="min-h-12 w-full rounded-xl border border-field bg-card pl-9" placeholder={copy.hostSearch} />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {HOSTS.map((host) => (
          <div
            key={host.id}
            className={`flex min-h-14 items-center justify-between rounded-xl border p-3 ${host.name === "Maya Chen" ? "border-primary bg-accent" : "border-border bg-card"}`}
          >
            <span className="font-medium">{host.name}</span>
            {host.name === "Maya Chen" ? <Check className="h-5 w-5 text-primary" /> : null}
          </div>
        ))}
      </div>
      <button className="mt-4 min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground">{copy.continue}</button>
    </PhoneChrome>
  )
}

function VisitScreen() {
  return (
    <PhoneChrome site="For Maya Chen" lang={false}>
      <StatusPill tone="ok" className="self-start">
        <Check className="h-3.5 w-3.5" strokeWidth={3} /> On site
      </StatusPill>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent text-xl font-semibold text-primary-text">C</div>
        <div>
          <h1 className="text-24 font-bold">Carlos Mendoza</h1>
          <p className="text-muted-foreground">Gulf Coast Electric · Contractor</p>
        </div>
      </div>
      <div className="v2-card mt-6 overflow-hidden px-[18px]">
        {[
          ["Site", "Houston HQ"],
          ["Waiting at", "Main lobby"],
          ["Badge", "V04821"],
          ["Purpose", "Electrical panel upgrade"],
        ].map(([label, value]) => (
          <div key={label} className="flex min-h-12 items-center justify-between border-b border-border last:border-0">
            <span className="text-muted-foreground">{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <button className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground">
        <LogOut className="h-5 w-5" /> Sign out visitor
      </button>
      <button className="mt-3 flex min-h-14 w-full items-center justify-center rounded-xl border border-danger font-semibold text-danger">
        Not my visitor
      </button>
    </PhoneChrome>
  )
}

function AdminDashboardScreen() {
  return (
    <AdminChrome title="Dashboard" subtitle="Houston HQ · Wednesday, Oct 21 · Updated 6:31 PM CDT">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["On site now", "7", "5 visitors, 2 staff"],
          ["Signed in today", "18", "Busiest hour 10 AM"],
          ["In safety video", "1", "Ready in about 2 min"],
          ["Expected today", "4", "Bookings not here yet"],
        ].map(([label, value, hint]) => (
          <div key={label} className="v2-card p-5">
            <p className="text-13 text-muted-foreground">{label}</p>
            <p className="mt-2 text-32 font-bold tracking-tight">{value}</p>
            <p className="text-13 text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 v2-card p-5">
        <p className="mb-3 font-semibold">Latest activity</p>
        {VISITORS.map((visitor) => (
          <div key={visitor.badge} className="flex min-h-13 items-center justify-between border-t border-border py-3">
            <span className="font-medium">{visitor.name}</span>
            <span className="text-13 text-muted-foreground">{visitor.host} · {visitor.inFor}</span>
          </div>
        ))}
      </div>
    </AdminChrome>
  )
}

function AdminVisitorsScreen() {
  return (
    <AdminChrome title="On site now" subtitle="Houston HQ · 5 visitors, 2 staff · Updated 6:31 PM CDT">
      <div className="mb-4 hidden gap-2 md:flex">
        <span className="rounded-xl bg-accent px-3 py-2 text-15 font-semibold text-primary-text">Visitors 5</span>
        <span className="rounded-xl px-3 py-2 text-15 text-muted-foreground">Staff 2</span>
      </div>
      <div className="space-y-3 md:hidden">
        {VISITORS.map((visitor) => (
          <div key={visitor.badge} className="v2-card space-y-3 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-13 font-semibold text-primary-text">{visitor.initials}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{visitor.name}</p>
                <p className="text-13 text-muted-foreground">{visitor.company}</p>
              </div>
              <StatusPill tone={visitor.tone} className="h-8 text-13">{visitor.type}</StatusPill>
            </div>
            <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        ))}
      </div>
      <div className="v2-card hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="p-4">Visitor</th>
              <th className="p-4">Type</th>
              <th className="p-4">Host</th>
              <th className="p-4">Badge</th>
              <th className="p-4">On site</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {VISITORS.map((visitor) => (
              <tr key={visitor.badge} className="border-b border-border last:border-0">
                <td className="p-4">
                  <p className="font-medium">{visitor.name}</p>
                  <p className="text-13 text-muted-foreground">{visitor.company}</p>
                </td>
                <td className="p-4">
                  <StatusPill tone={visitor.tone} className="h-8 text-13">{visitor.type}</StatusPill>
                </td>
                <td className="p-4">{visitor.host}</td>
                <td className="p-4 font-mono">{visitor.badge}</td>
                <td className="p-4">{visitor.inFor}</td>
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <span className="inline-flex min-h-11 items-center rounded-xl border border-field px-3">
                      <LogOut className="mr-1 h-4 w-4" /> Sign out
                    </span>
                    <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border">
                      <MoreHorizontal className="h-4 w-4" />
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminChrome>
  )
}

const SCREENS: Record<string, { title: string; node: ReactNode }> = {
  "kiosk-welcome": { title: "Kiosk welcome", node: <KioskWelcomeScreen /> },
  "kiosk-type": { title: "Kiosk type", node: <KioskTypeScreen /> },
  "kiosk-blocked": { title: "Kiosk blocked", node: <KioskBlockedScreen /> },
  "kiosk-details": { title: "Kiosk details", node: <KioskDetailsScreen /> },
  "kiosk-training": { title: "Kiosk training", node: <KioskTrainingScreen /> },
  "qr-host": { title: "QR host", node: <QrHostScreen /> },
  visit: { title: "Visit", node: <VisitScreen /> },
  "admin-dashboard": { title: "Admin dashboard", node: <AdminDashboardScreen /> },
  "admin-visitors": { title: "Admin visitors", node: <AdminVisitorsScreen /> },
}

export function PreviewUiScreens({ screen, theme = "light" }: { screen?: string; theme?: "light" | "dark" }) {
  const only = screen?.trim() || "all"
  const themeClass = theme === "dark" ? "dark" : ""

  if (only !== "all" && SCREENS[only]) {
    return (
      <div id={`screen-${only}`} className={cn(themeClass, "min-h-svh bg-background text-foreground")} data-theme={theme}>
        {SCREENS[only].node}
      </div>
    )
  }

  return (
    <div className={cn(themeClass, "space-y-16 bg-surface-2 p-6")} data-theme={theme}>
      {Object.entries(SCREENS).map(([id, item]) => (
        <section key={id} id={id} className="overflow-hidden rounded-2xl border border-border bg-background shadow">
          <h2 className="border-b border-border px-4 py-2 text-13 font-semibold uppercase tracking-wide text-muted-foreground">{item.title}</h2>
          <div className="min-h-[640px]">{item.node}</div>
        </section>
      ))}
    </div>
  )
}
