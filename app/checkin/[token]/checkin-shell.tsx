"use client"

import type { ReactNode } from "react"
import { MapPin } from "lucide-react"
import { TalusAgLogo } from "@/components/talusag-logo"
import { LangToggle } from "@/components/lang-toggle"
import type { VisitorLang } from "@/lib/visitor-i18n"

/**
 * Mobile-first frame for the public check-in pages.
 *
 * Visitors arrive on their own phone with no session, so the chrome is
 * deliberately minimal: branding, the site they are signing in to, and the
 * current step. Everything is centred and capped so it also reads well if
 * someone opens the link on a laptop.
 */
export function CheckinShell({
    companyName,
    logo,
    locationName,
    children,
    lang,
    onLang,
}: {
    companyName: string
    logo?: string
    locationName?: string
    children: ReactNode
    lang?: VisitorLang
    onLang?: (lang: VisitorLang) => void
}) {
    return (
        <main className="visitor-touch flex min-h-svh flex-col bg-background text-foreground">
            <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
                {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote branding URL, size unknown
                    <img src={logo} alt={companyName} className="h-8 w-auto object-contain" />
                ) : (
                    <TalusAgLogo className="h-8 w-auto" />
                )}
                <div className="flex items-center gap-3">
                    {locationName ? (
                        <p className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                            <MapPin className="h-3.5 w-3.5" />
                            {locationName}
                        </p>
                    ) : null}
                    {onLang && lang ? <LangToggle lang={lang} onLang={onLang} size="phone" /> : null}
                </div>
            </header>

            <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">{children}</div>

            <footer className="px-4 pb-6 pt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                Your details are used for site safety and visitor records only.
            </footer>
        </main>
    )
}
