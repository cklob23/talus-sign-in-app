"use client"

import { useState } from "react"
import { PublicVisitorChrome } from "@/lib/public-visitor-chrome"
import { Button } from "@/components/ui/button"
import { formatDateTimeWithZone } from "@/lib/timezone"

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
  trainingDone,
  trainingMessage,
  companyName,
  logoUrl,
  signedOut,
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
  trainingDone: boolean
  trainingMessage: string | null
  companyName: string
  logoUrl: string | null
  signedOut: boolean
}) {
  const [status, setStatus] = useState<"on_site" | "signed_out" | "disputed">(signedOut ? "signed_out" : "on_site")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signOut() {
    if (busy || status !== "on_site") return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/visit/${encodeURIComponent(token)}/sign-out`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not sign the visitor out.")
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
      footer={`This link works for ${hostName} and expires when ${visitorName.split(" ")[0]} signs out.`}
    >
      <p className="text-sm text-[#55625a]">For {hostName}</p>
      <div className="mt-2 inline-flex items-center gap-2 self-start rounded-full bg-[#e2f4e9] px-3 py-1 text-sm font-semibold text-[#00703f]">
        {status === "on_site" ? "On site" : status === "signed_out" ? "Signed out" : "Flagged"}
      </div>
      <div className="mt-4 flex items-center gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-[72px] w-[72px] rounded-full object-cover" />
        ) : (
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#e2f4e9] text-xl font-semibold text-[#00703f]">
            {visitorName.slice(0, 1)}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{visitorName}</h1>
          <p className="text-[#55625a]">
            {[company, visitorType].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[#dce6df] bg-white">
        <Row label="Site" value={siteName} />
        <Row label="Arrived" value={formatDateTimeWithZone(arrivalTime, timezone)} />
        {badgeNumber ? <Row label="Badge" value={badgeNumber} mono /> : null}
        {purpose ? <Row label="Purpose" value={purpose} /> : null}
        <Row
          label="Training"
          value={trainingDone ? trainingMessage || "Done" : "Not cleared"}
          last
        />
      </div>

      {status === "disputed" ? (
        <p className="mt-6 rounded-xl bg-[#fff3df] p-4 text-[#8a4500]">
          Reception and admins have been told this is not your visitor.
        </p>
      ) : null}

      {status === "signed_out" || signedOutAt ? (
        <p className="mt-6 rounded-xl bg-[#e2f4e9] p-4 text-[#00703f]">
          {visitorName} is signed out.
        </p>
      ) : (
        <Button className="mt-6 h-14 w-full bg-[#00854c] text-base hover:bg-[#00703f]" onClick={() => void signOut()} disabled={busy}>
          Sign out visitor
        </Button>
      )}

      {status !== "disputed" ? (
        <Button
          variant="outline"
          className="mt-3 h-14 w-full border-[#b3000a] text-[#b3000a] hover:bg-[#fdecec]"
          onClick={() => void dispute()}
          disabled={busy}
        >
          Not my visitor
        </Button>
      ) : null}

      {error ? <p className="mt-4 text-sm text-[#b3000a]">{error}</p> : null}
    </PublicVisitorChrome>
  )
}

function Row({ label, value, last, mono }: { label: string; value: string; last?: boolean; mono?: boolean }) {
  return (
    <div className={`flex min-h-12 items-center justify-between gap-4 px-4 ${last ? "" : "border-b border-[#dce6df]"}`}>
      <span className="text-[#55625a]">{label}</span>
      <b className={`text-right ${mono ? "font-mono" : ""}`}>{value}</b>
    </div>
  )
}
