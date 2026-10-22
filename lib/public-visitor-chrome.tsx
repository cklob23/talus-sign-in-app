"use client"

import type { ReactNode } from "react"
import { TalusAgLogo } from "@/components/talusag-logo"

export function PublicVisitorChrome({
  companyName,
  logoUrl,
  siteName,
  lang,
  onLang,
  children,
  footer,
}: {
  companyName: string
  logoUrl?: string | null
  siteName?: string | null
  lang?: "en" | "es"
  onLang?: (lang: "en" | "es") => void
  children: ReactNode
  footer?: string
}) {
  return (
    <main className="flex min-h-svh flex-col bg-[#f5f8f6] text-[#0f1a13]">
      <header className="flex items-center justify-between gap-3 border-b border-[#dce6df] bg-white px-4 py-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={companyName} className="h-8 w-auto object-contain" />
        ) : (
          <TalusAgLogo className="h-8 w-auto" />
        )}
        <div className="flex items-center gap-3">
          {siteName ? <span className="text-sm text-[#55625a]">{siteName}</span> : null}
          {onLang ? (
            <div className="flex h-12 overflow-hidden rounded-xl border border-[#dce6df]" role="group" aria-label="Language">
              <button
                type="button"
                className={`min-w-12 px-3 text-sm font-semibold ${lang === "en" ? "bg-[#00854c] text-white" : "bg-white"}`}
                onClick={() => onLang("en")}
              >
                EN
              </button>
              <button
                type="button"
                className={`min-w-12 px-3 text-sm font-semibold ${lang === "es" ? "bg-[#00854c] text-white" : "bg-white"}`}
                onClick={() => onLang("es")}
              >
                ES
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-6">{children}</div>
      <footer className="px-4 pb-6 text-center text-xs text-[#55625a]">
        {footer || "Talus Ag Visitor Management"}
      </footer>
    </main>
  )
}
