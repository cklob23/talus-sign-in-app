"use client"

import type { VisitorLang } from "@/lib/visitor-i18n"
import { visitorCopy } from "@/lib/visitor-i18n"

export function LangToggle({
  lang,
  onLang,
  size = "kiosk",
}: {
  lang: VisitorLang
  onLang: (lang: VisitorLang) => void
  size?: "kiosk" | "phone"
}) {
  const copy = visitorCopy(lang)
  const min = size === "kiosk" ? "min-h-14 min-w-14" : "min-h-12 min-w-12"
  return (
    <div className="flex overflow-hidden rounded-xl border border-border" role="group" aria-label={copy.langLabel}>
      {(["en", "es"] as const).map((code) => (
        <button
          key={code}
          type="button"
          className={`${min} px-3 text-sm font-semibold ${lang === code ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
          aria-pressed={lang === code}
          onClick={() => onLang(code)}
        >
          {code === "en" ? "EN" : "ES"}
        </button>
      ))}
    </div>
  )
}
