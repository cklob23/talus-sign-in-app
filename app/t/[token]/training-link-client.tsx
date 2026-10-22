"use client"

import { useState } from "react"
import { TrainingPlayer } from "@/components/training-player"
import { PublicVisitorChrome } from "@/lib/public-visitor-chrome"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

export function TrainingLinkClient({
  token,
  firstName,
  lastName,
  email,
  hostName,
  videoTitle,
  videoUrl,
  siteName,
  companyName,
  logoUrl,
  alreadyCleared,
  clearanceMessage,
  clearanceMessageEs,
}: {
  token: string
  firstName: string
  lastName: string
  email: string
  hostName: string
  videoTitle: string
  videoUrl: string
  siteName: string
  companyName: string
  logoUrl: string | null
  alreadyCleared: boolean
  clearanceMessage: string | null
  clearanceMessageEs: string | null
}) {
  const [lang, setLang] = useState<"en" | "es">("en")
  const [ticket, setTicket] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [videoSeconds, setVideoSeconds] = useState<number | null>(null)
  const [acked, setAcked] = useState(false)
  const [done, setDone] = useState(alreadyCleared)
  const [doneMessage, setDoneMessage] = useState(alreadyCleared ? clearanceMessage : null)
  const [doneMessageEs, setDoneMessageEs] = useState(alreadyCleared ? clearanceMessageEs : null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const copy = lang === "es"
    ? {
        title: videoTitle,
        intro: hostName
          ? `${hostName} lo invitó a ${companyName}, ${siteName}. Vea el video completo.`
          : `Vea el video de seguridad para ${siteName}.`,
        start: "Empezar el video",
        ack: "Vi el video. Seguiré las reglas de seguridad.",
        save: "Marcar como autorizado",
        saving: "Guardando...",
        cleared: "Está autorizado",
        hint: "Regístrese en el kiosco o con el código QR usando este correo. No necesita código.",
        email: `Use ${email}`,
        watchAnyway: "Ver el video otra vez",
      }
    : {
        title: videoTitle,
        intro: hostName
          ? `${hostName} invited you to ${companyName}, ${siteName}. Watch the full video.`
          : `Watch the safety video for ${siteName}.`,
        start: "Start the video",
        ack: "I watched the video. I will follow the safety rules.",
        save: "Mark me as cleared",
        saving: "Saving...",
        cleared: "You are cleared",
        hint: "Sign in at the kiosk or by QR code with this email. No code needed.",
        email: `Use ${email}`,
        watchAnyway: "Watch the video again",
      }

  async function start() {
    if (starting || ticket) return
    setStarting(true)
    setError(null)
    try {
      const res = await fetch(`/t/${encodeURIComponent(token)}/start`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || typeof json.ticket !== "string") {
        throw new Error(json.error || "Could not start the video.")
      }
      setTicket(json.ticket)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the video.")
    } finally {
      setStarting(false)
    }
  }

  async function complete() {
    if (!ticket || !ended || !acked || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/t/${encodeURIComponent(token)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket,
          acknowledged: true,
          videoSeconds,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not save your training.")
      setDone(true)
      setDoneMessage(typeof json.message === "string" ? json.message : copy.cleared)
      setDoneMessageEs(typeof json.messageEs === "string" ? json.messageEs : copy.cleared)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your training.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <PublicVisitorChrome
      companyName={companyName}
      logoUrl={logoUrl}
      siteName={siteName}
      lang={lang}
      onLang={setLang}
    >
      <p className="text-sm font-semibold text-[#00703f]">
        {firstName} {lastName}
      </p>
      <h1 className="mt-1 text-3xl font-bold">{copy.title}</h1>
      <p className="mt-2 text-[#55625a]">{copy.intro}</p>

      {done && !ticket ? (
        <div className="mt-6 rounded-2xl border-2 border-[#00854c] bg-white p-6">
          <p className="text-sm font-semibold text-[#00703f]">{copy.cleared}</p>
          <p className="mt-2 text-lg font-medium">{lang === "es" ? doneMessageEs : doneMessage}</p>
          <p className="mt-3 text-sm text-[#55625a]">{copy.hint}</p>
          <p className="mt-1 text-sm font-medium">{copy.email}</p>
          <Button className="mt-4 bg-[#00854c] hover:bg-[#00703f]" onClick={() => setDone(false)}>
            {copy.watchAnyway}
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {!ticket ? (
            <Button className="h-14 w-full bg-[#00854c] text-base hover:bg-[#00703f]" onClick={() => void start()} disabled={starting}>
              {starting ? copy.saving : copy.start}
            </Button>
          ) : (
            <TrainingPlayer
              url={videoUrl}
              title={videoTitle}
              onDuration={setVideoSeconds}
              onEnded={(seconds) => {
                setVideoSeconds(seconds)
                setEnded(true)
              }}
            />
          )}

          {ended ? (
            <label className="flex items-start gap-3 rounded-xl border bg-white p-4">
              <Checkbox checked={acked} onCheckedChange={(value) => setAcked(value === true)} className="mt-1" />
              <span>{copy.ack}</span>
            </label>
          ) : ticket ? (
            <p className="text-sm text-[#55625a]">
              {lang === "es" ? "La casilla se activa al terminar el video." : "The checkbox unlocks when the video ends."}
            </p>
          ) : null}

          <Button
            className="h-14 w-full bg-[#00854c] text-base hover:bg-[#00703f]"
            disabled={!ticket || !ended || !acked || saving}
            onClick={() => void complete()}
          >
            {saving ? copy.saving : copy.save}
          </Button>
        </div>
      )}

      {error ? <p className="mt-4 text-sm text-[#b3000a]">{error}</p> : null}
    </PublicVisitorChrome>
  )
}
