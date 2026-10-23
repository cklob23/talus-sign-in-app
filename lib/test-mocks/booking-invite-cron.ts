export type BookingInviteCronResult = {
  ok: true
  claimed: number
  sent: number
  failed: number
  skipped: number
}

const emptyResult: BookingInviteCronResult = {
  ok: true,
  claimed: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
}

let impl: ((request: Request) => Promise<BookingInviteCronResult>) | null = null

export function setBookingInviteCronImpl(fn: ((request: Request) => Promise<BookingInviteCronResult>) | null) {
  impl = fn
}

export function resetBookingInviteCronMock() {
  impl = null
}

export function bookingInviteCronOrigin(request: Request): string {
  try {
    return new URL(request.url).origin
  } catch {
    return "https://example.com"
  }
}

export async function runBookingInviteCron(request: Request): Promise<BookingInviteCronResult> {
  if (impl) return impl(request)
  return { ...emptyResult }
}
