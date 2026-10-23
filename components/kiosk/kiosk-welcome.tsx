"use client"

import { Bell, CalendarCheck, Clock, CreditCard, LogOut, PlayCircle, UserPlus } from "lucide-react"
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
        <h1 className="text-32 font-bold text-foreground md:text-40">{fill(copy.welcomeTitle, { company: companyName })}</h1>
        <p className="mt-2 text-17 text-muted-foreground md:text-20">{copy.welcomeSubtitle}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <button
          type="button"
          disabled={visitorBlocked}
          onClick={onSignIn}
          className="v2-hero flex min-h-[280px] flex-col gap-4 border-2 border-primary p-8 text-left disabled:opacity-50"
        >
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-primary text-primary-foreground">
            <UserPlus className="h-9 w-9" />
          </span>
          <span>
            <span className="block text-24 font-bold">{copy.signInTitle}</span>
            <span className="mt-1 block text-muted-foreground">{copy.signInHelp}</span>
          </span>
          <span className="flex flex-col gap-2 text-17">
            <span className="flex items-center gap-3 text-primary-text"><Clock className="h-5 w-5" />{copy.signInMinutes}</span>
            <span className="flex items-center gap-3 text-primary-text"><PlayCircle className="h-5 w-5" />{copy.signInTraining}</span>
            <span className="flex items-center gap-3 text-primary-text"><Bell className="h-5 w-5" />{copy.signInHost}</span>
          </span>
          <span className="mt-auto inline-flex min-h-16 items-center justify-center rounded-xl bg-primary px-5 text-20 font-semibold text-primary-foreground">
            {copy.signInTitle}
          </span>
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="v2-hero flex min-h-[280px] flex-col gap-4 p-8 text-left"
        >
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-surface-2 text-foreground">
            <LogOut className="h-9 w-9" />
          </span>
          <span>
            <span className="block text-24 font-bold">{copy.signOutTitle}</span>
            <span className="mt-1 block text-muted-foreground">{copy.signOutHelp}</span>
          </span>
          <span className="flex flex-col gap-2 text-17">
            <span className="flex items-center gap-3 text-primary-text"><CreditCard className="h-5 w-5" />{copy.signOutHow}</span>
            <span className="flex items-center gap-3 text-primary-text"><Clock className="h-5 w-5" />{copy.signOutMinutes}</span>
          </span>
          <span className="mt-auto inline-flex min-h-16 items-center justify-center rounded-xl border border-border px-5 text-20 font-semibold">
            {copy.signOutTitle}
          </span>
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {showBooking ? (
          <div className="flex flex-col gap-2">
            <p className="text-base text-muted-foreground">{copy.bookingHint}</p>
            <Button
              type="button"
              variant="outline"
              className="min-h-14 w-full border-primary text-[17px] font-semibold text-primary-text"
              onClick={onBooking}
              disabled={visitorBlocked}
            >
              <CalendarCheck className="h-5 w-5" />
              {copy.haveBooking}
            </Button>
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="min-h-14 w-full px-5 text-[17px] font-semibold text-primary-text sm:w-auto"
            onClick={onStaff}
          >
            {copy.staffSignIn}
          </Button>
        </div>
      </div>
    </div>
  )
}
