"use client"

import type { ReactNode } from "react"
import { TalusAgLogo } from "@/components/talusag-logo"
import { LangToggle } from "@/components/lang-toggle"

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
    <main className="visitor-touch flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={companyName} className="h-8 w-auto object-contain" />
        ) : (
          <TalusAgLogo className="h-8 w-auto" />
        )}
        <div className="flex items-center gap-3">
          {siteName ? <span className="text-sm text-muted-foreground">{siteName}</span> : null}
          {onLang ? <LangToggle lang={lang || "en"} onLang={onLang} size="phone" /> : null}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-6">{children}</div>
      <footer className="px-4 pb-6 text-center text-13 text-muted-foreground">
        {footer || "Talus Ag Visitor Management"}
      </footer>
    </main>
  )
}
