import type { ReactNode } from "react"
import { MapPin } from "lucide-react"

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
}: {
    companyName: string
    logo?: string
    locationName?: string
    children: ReactNode
}) {
    return (
        <main className="flex min-h-svh flex-col bg-muted/40">
            <header className="flex flex-col items-center gap-2 border-b bg-background px-4 py-5">
                {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote branding URL, size unknown
                    <img src={logo} alt={companyName} className="h-8 w-auto object-contain" />
                ) : (
                    <span className="text-lg font-semibold">{companyName}</span>
                )}
                {locationName ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {locationName}
                    </p>
                ) : null}
            </header>

            <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">{children}</div>

            <footer className="px-4 pb-6 pt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                Your details are used for site safety and visitor records only.
            </footer>
        </main>
    )
}
