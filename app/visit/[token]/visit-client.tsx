"use client"

import { Check, LogOut, X } from "lucide-react"
import { useState } from "react"
import { PublicVisitorChrome } from "@/lib/public-visitor-chrome"
import { Button } from "@/components/ui/button"
import { StatusPill } from "@/components/v2/status-pill"
import { formatDateTimeWithZone } from "@/lib/timezone"
import { visitActionsVisible, visitDepartureStamp, visitLinkFooter } from "@/lib/visit-page"

export function VisitPageClient({
  token,
  visitorName,
  hostName,
  company,
  visitorType,
  siteName,
  timezone,
  arrivalTime,
  signedOutAt,
  badgeNumber,
  purpose,
  photoUrl,
  trainingLine,
  companyName,
  logoUrl,
  signedOut,
  expiresAt,
}: {
  token: string
  visitorName: string
  hostName: string
  company: string
  visitorType: string
  siteName: string
  timezone: string
  arrivalTime: string
  signedOutAt: string | null
  badgeNumber: string
  purpose: string
  photoUrl: string
  trainingLine: string
  companyName: string
  logoUrl: string | null
  signedOut: boolean
  expiresAt: number
}) {
  const [status, setStatus] = useState<"on_site" | "signed_out" | "disputed">(signedOut ? "signed_out" : "on_site")
  const [departedAt, setDepartedAt] = useState<string | null>(signedOutAt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const readOnly = !visitActionsVisible(status === "signed_out" || Boolean(departedAt))
  const departure = visitDepartureStamp(departedAt, timezone)

  async function signOut() {
    if (busy || status !== "on_site") return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/visit/${encodeURIComponent(token)}/sign-out`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not sign the visitor out.")
      setDepartedAt(typeof json.signedOutAt === "string" ? json.signedOutAt : new Date().toISOString())
      setStatus("signed_out")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign the visitor out.")
    } finally {
      setBusy(false)
    }
  }

  async function dispute() {
    if (busy || status === "disputed") return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/visit/${encodeURIComponent(token)}/dispute`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not record that.")
      setStatus("disputed")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicVisitorChrome
      companyName={companyName}
      logoUrl={logoUrl}
      footer={visitLinkFooter(hostName, expiresAt, timezone)}
    >
      <p className="text-sm text-muted-foreground">For {hostName}</p>
      <StatusPill tone={status === "on_site" ? "ok" : status === "signed_out" ? "neu" : "warn"} className="mt-2 self-start">
        {status === "on_site" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        {status === "on_site" ? "On site" : status === "signed_out" ? "Signed out" : "Flagged"}
      </StatusPill>
      <div className="mt-4 flex items-center gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-[72px] w-[72px] rounded-full object-cover" />
        ) : (
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent text-xl font-semibold text-primary-text">
            {visitorName.slice(0, 1)}
          </div>
        )}
        <div>
          <h1 className="text-24 font-bold">{visitorName}</h1>
          <p className="text-muted-foreground">
            {[company, visitorType].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="v2-card mt-6 overflow-hidden px-[18px]">
        <Row label="Site" value={siteName} />
        <Row label="Arrived" value={formatDateTimeWithZone(arrivalTime, timezone)} />
        {departure ? <Row label="Departed" value={departure} /> : null}
        {badgeNumber ? <Row label="Badge" value={badgeNumber} mono /> : null}
        {purpose ? <Row label="Purpose" value={purpose} /> : null}
        <Row
          label="Training"
          value={trainingLine}
          last
          emphasis={trainingDone}
        />
      </div>

      {status === "disputed" ? (
        <p className="mt-6 rounded-xl bg-warning-soft p-4 text-warning">
          Reception and admins have been told this is not your visitor.
        </p>
      ) : null}

      {readOnly ? (
        <p className="mt-6 rounded-xl bg-success-soft p-4 text-success">
          {visitorName} is signed out.
        </p>
      ) : (
        <Button className="mt-6 h-14 w-full text-base" onClick={() => void signOut()} disabled={busy}>
          <LogOut className="h-5 w-5" />
          Sign out visitor
        </Button>
      )}

      {!readOnly && status !== "disputed" ? (
        <Button
          variant="outline"
          className="mt-3 h-14 w-full border-danger text-danger hover:bg-danger-soft"
          onClick={() => void dispute()}
          disabled={busy}
        >
          <X className="h-5 w-5" />
          Not my visitor
        </Button>
      ) : null}

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
    </PublicVisitorChrome>
  )
}

function Row({
  label,
  value,
  last,
  mono,
  emphasis,
}: {
  label: string
  value: string
  last?: boolean
  mono?: boolean
  emphasis?: boolean
}) {
  return (
    <div className={`flex min-h-12 items-center justify-between gap-4 ${last ? "" : "border-b border-border"}`}>
      <span className="text-muted-foreground">{label}</span>
      <b className={`text-right ${mono ? "font-mono" : ""} ${emphasis ? "text-primary-text" : ""}`}>{value}</b>
    </div>
  )
}
