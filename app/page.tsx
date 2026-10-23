"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { TalusAgLogo } from "@/components/talusag-logo"
import {
  ClipboardList,
  Clock,
  Mail,
  PlayCircle,
  Shield,
  User,
  UserPlus,
} from "lucide-react"
import { useBranding } from "@/hooks/use-branding"

export default function HomePage() {
  const { branding } = useBranding()
  const companyName = branding.companyName || "Talus Ag"

  return (
    <div className="landing-page flex min-h-svh flex-col font-sans">
      <header className="border-b border-[var(--lp-border)]">
        <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="shrink-0 rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-focus)]">
            <TalusAgLogo />
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex min-h-11 items-center rounded-[12px] px-2 text-[15px] font-semibold text-[var(--lp-primary-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-focus)]"
          >
            Admin Login
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto mb-8 max-w-[640px] text-center sm:mb-12">
          <h1 className="text-[32px] font-bold leading-tight text-[var(--lp-text)] lg:text-[40px]">
            {`Welcome to ${companyName}`}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-muted)] lg:text-[17px]">
            Sign in for a visit, check in with a booking, or open the admin portal.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <LandingCard
            href="/kiosk"
            primary
            icon={<UserPlus className="h-7 w-7" aria-hidden />}
            title="Visitor Sign In"
            subtitle="I am visiting or here to work today."
            bullets={[
              { icon: <Clock className="h-4 w-4" aria-hidden />, text: "About 2 minutes" },
              { icon: <PlayCircle className="h-4 w-4" aria-hidden />, text: "Safety video if your visit needs it" },
              { icon: <UserPlus className="h-4 w-4" aria-hidden />, text: "We tell your host you are here." },
            ]}
            cta="Sign in →"
          />

          <LandingCard
            href="/kiosk?mode=booking"
            icon={<ClipboardList className="h-7 w-7" aria-hidden />}
            title="Check In"
            subtitle="Already have a booking? Enter your code."
            bullets={[
              { icon: <Mail className="h-4 w-4" aria-hidden />, text: "Code from your booking email" },
              { icon: <Clock className="h-4 w-4" aria-hidden />, text: "About 30 seconds" },
            ]}
            cta="Check in →"
          />

          <LandingCard
            href="/auth/login"
            className="md:col-span-2 lg:col-span-1"
            icon={<Shield className="h-7 w-7" aria-hidden />}
            title="Admin Portal"
            subtitle="Staff access to visitors, hosts, and reports."
            bullets={[
              { icon: <User className="h-4 w-4" aria-hidden />, text: "Sign in with your Talus account." },
            ]}
            cta="Admin portal →"
          />
        </div>
      </main>

      <footer className="mt-auto border-t border-[var(--lp-border)]">
        <div className="mx-auto flex w-full max-w-[1080px] flex-col items-center gap-1 px-4 py-6 text-center text-[13px] leading-relaxed text-[var(--lp-muted)] sm:px-6">
          <p>{`© ${new Date().getFullYear()} ${companyName} Visitor Management.`}</p>
          <p>
            Need help? Contact IT Support at{" "}
            <a
              href="mailto:it_support@talusag.com"
              className="font-medium text-[var(--lp-primary-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-focus)]"
            >
              it_support@talusag.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}

function LandingCard({
  href,
  primary = false,
  icon,
  title,
  subtitle,
  bullets,
  cta,
  className = "",
}: {
  href: string
  primary?: boolean
  icon: ReactNode
  title: string
  subtitle: string
  bullets: { icon: ReactNode; text: string }[]
  cta: string
  className?: string
}) {
  return (
    <Link
      href={href}
      className={`group flex min-h-[320px] flex-col rounded-[16px] bg-[var(--lp-surface)] p-7 text-left no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-focus)] ${
        primary
          ? "border-2 border-[var(--lp-primary)] shadow-[0_0_0_3px_var(--lp-accent-soft)]"
          : "border border-[var(--lp-border)]"
      } ${className}`}
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-[12px] ${
          primary
            ? "bg-[var(--lp-primary)] text-[var(--lp-on-primary)]"
            : "bg-[var(--lp-surface-2)] text-[var(--lp-text)]"
        }`}
      >
        {icon}
      </span>
      <span className="mt-5 block text-[24px] font-bold leading-tight text-[var(--lp-text)]">{title}</span>
      <span className="mt-1 block text-[15px] leading-relaxed text-[var(--lp-muted)]">{subtitle}</span>
      <ul className="mt-4 flex flex-col gap-2 text-[15px]">
        {bullets.map((bullet) => (
          <li
            key={bullet.text}
            className={`flex items-start gap-2 ${
              primary ? "text-[var(--lp-primary-text)]" : "text-[var(--lp-muted)]"
            }`}
          >
            <span className="mt-0.5 shrink-0">{bullet.icon}</span>
            <span>{bullet.text}</span>
          </li>
        ))}
      </ul>
      <span
        className={`mt-auto inline-flex min-h-12 w-full items-center justify-center rounded-[12px] px-5 text-[17px] font-semibold ${
          primary
            ? "bg-[var(--lp-primary)] text-[var(--lp-on-primary)] group-hover:bg-[var(--lp-primary-hover)]"
            : "border border-[color:var(--lp-primary)] bg-transparent text-[var(--lp-primary-text)] group-hover:bg-[var(--lp-accent-soft)]"
        }`}
      >
        {cta}
      </span>
    </Link>
  )
}
