"use client"

import { CalendarCheck, Clock, LogOut, PlayCircle, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fill, type VisitorCopy } from "@/lib/visitor-i18n"

export function KioskWelcome({
  companyName,
  copy,
  onSignIn,
  onSignOut,
  onBooking,
  onStaff,
  showBooking,
  visitorBlocked,
}: {
  companyName: string
  copy: VisitorCopy
  onSignIn: () => void
  onSignOut: () => void
  onBooking: () => void
  onStaff: () => void
  showBooking: boolean
  visitorBlocked: boolean
}) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-4xl font-bold text-[#0f1a13]">{fill(copy.welcomeTitle, { company: companyName })}</h1>
        <p className="mt-2 text-lg text-[#55625a]">{copy.welcomeSubtitle}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <button
          type="button"
          disabled={visitorBlocked}
          onClick={onSignIn}
          className="flex min-h-[280px] flex-col gap-4 rounded-3xl border-2 border-[#00854c] bg-white p-8 text-left disabled:opacity-50"
        >
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-[#00854c] text-white">
            <UserPlus className="h-9 w-9" />
          </span>
          <span>
            <span className="block text-2xl font-bold">{copy.signInTitle}</span>
            <span className="mt-1 block text-[#55625a]">{copy.signInHelp}</span>
          </span>
          <span className="flex flex-col gap-2 text-[17px]">
            <span className="flex items-center gap-3 text-[#00703f]"><Clock className="h-5 w-5" />{copy.signInMinutes}</span>
            <span className="flex items-center gap-3 text-[#00703f]"><PlayCircle className="h-5 w-5" />{copy.signInTraining}</span>
            <span className="flex items-center gap-3 text-[#00703f]"><UserPlus className="h-5 w-5" />{copy.signInHost}</span>
          </span>
          <span className="mt-auto inline-flex min-h-16 items-center justify-center rounded-xl bg-[#00854c] px-5 text-xl font-semibold text-white">
            {copy.signInTitle}
          </span>
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="flex min-h-[280px] flex-col gap-4 rounded-3xl border bg-white p-8 text-left"
        >
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-[#eef4f0] text-[#0f1a13]">
            <LogOut className="h-9 w-9" />
          </span>
          <span>
            <span className="block text-2xl font-bold">{copy.signOutTitle}</span>
            <span className="mt-1 block text-[#55625a]">{copy.signOutHelp}</span>
          </span>
          <span className="flex flex-col gap-2 text-[17px]">
            <span className="flex items-center gap-3">{copy.signOutHow}</span>
            <span className="flex items-center gap-3">{copy.signOutMinutes}</span>
          </span>
          <span className="mt-auto inline-flex min-h-16 items-center justify-center rounded-xl border px-5 text-xl font-semibold">
            {copy.signOutTitle}
          </span>
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 text-[#55625a]">
        {showBooking ? (
          <button type="button" className="inline-flex min-h-12 items-center gap-2 text-[#00703f]" onClick={onBooking} disabled={visitorBlocked}>
            <CalendarCheck className="h-5 w-5" />
            {copy.bookingHint}
          </button>
        ) : (
          <span>{copy.bookingHint}</span>
        )}
        <Button type="button" variant="ghost" className="min-h-12 text-[#00703f]" onClick={onStaff}>
          {copy.staffSignIn}
        </Button>
      </div>
    </div>
  )
}
