import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_INVITE_LEAD_MINUTES,
  INVITE_COOLDOWN_MS,
  TRAINING_LINK_MAX_TTL_MS,
  TRAINING_LINK_MIN_TTL_MS,
  arrivalDayPlusOneEnd,
  checkInMatchedBooking,
  inviteCooldownActive,
  matchPendingBooking,
  processDueBookingInvites,
  resolveInvitePlan,
  trainingLinkTtlMs,
  type BookingInviteStore,
  type LoadedBooking,
} from "./booking-invite.ts"
import { localDatetimeToUtc } from "./timezone.ts"

describe("resolveInvitePlan", () => {
  const arrival = new Date("2026-10-25T15:00:00.000Z")
  const now = new Date("2026-10-22T12:00:00.000Z")

  it("defaults scheduled lead time to 2 days before arrival", () => {
    const plan = resolveInvitePlan({
      mode: "scheduled",
      expectedArrival: arrival,
      leadMinutes: DEFAULT_INVITE_LEAD_MINUTES,
      now,
    })
    assert.equal(plan.sendNow, false)
    assert.equal(plan.status, "scheduled")
    assert.equal(plan.sendAt, "2026-10-23T15:00:00.000Z")
    assert.equal(plan.leadMinutes, 2880)
  })

  it("sends now when the scheduled lead time has already passed", () => {
    const plan = resolveInvitePlan({
      mode: "scheduled",
      expectedArrival: new Date("2026-10-22T18:00:00.000Z"),
      leadMinutes: DEFAULT_INVITE_LEAD_MINUTES,
      now,
    })
    assert.equal(plan.sendNow, true)
    assert.equal(plan.status, "none")
    assert.equal(plan.sendAt, now.toISOString())
  })

  it("sends immediately for now and skips for manual", () => {
    const nowPlan = resolveInvitePlan({ mode: "now", expectedArrival: arrival, leadMinutes: 1440, now })
    const manual = resolveInvitePlan({ mode: "manual", expectedArrival: arrival, leadMinutes: 1440, now })
    assert.equal(nowPlan.sendNow, true)
    assert.equal(manual.sendNow, false)
    assert.equal(manual.status, "none")
    assert.equal(manual.sendAt, null)
  })
})

describe("trainingLinkTtlMs", () => {
  const now = Date.parse("2026-10-22T12:00:00.000Z")

  it("uses 14 days when arrival is soon", () => {
    const ttl = trainingLinkTtlMs({
      expectedArrival: "2026-10-23T20:00:00.000Z",
      timezone: "America/Chicago",
      now,
    })
    assert.equal(ttl, TRAINING_LINK_MIN_TTL_MS)
  })

  it("extends to the local day after arrival when that is later than 14 days", () => {
    const arrival = new Date("2026-11-20T20:00:00.000Z")
    const expire = arrivalDayPlusOneEnd(arrival, "America/Chicago")
    const ttl = trainingLinkTtlMs({ expectedArrival: arrival, timezone: "America/Chicago", now })
    assert.equal(ttl, expire.getTime() - now)
    assert.ok(ttl > TRAINING_LINK_MIN_TTL_MS)
    assert.ok(ttl < TRAINING_LINK_MAX_TTL_MS)
  })

  it("caps at 60 days", () => {
    const ttl = trainingLinkTtlMs({
      expectedArrival: "2027-02-01T15:00:00.000Z",
      timezone: "America/Chicago",
      now,
    })
    assert.equal(ttl, TRAINING_LINK_MAX_TTL_MS)
  })
})

describe("inviteCooldownActive", () => {
  it("is true within 5 minutes of the last send", () => {
    const now = Date.parse("2026-10-22T12:05:00.000Z")
    assert.equal(inviteCooldownActive("2026-10-22T12:01:00.000Z", now), true)
    assert.equal(inviteCooldownActive("2026-10-22T11:59:00.000Z", now), false)
    assert.equal(inviteCooldownActive(null, now), false)
    assert.equal(INVITE_COOLDOWN_MS, 5 * 60 * 1000)
  })
})

describe("processDueBookingInvites", () => {
  function memoryStore(initial: LoadedBooking[]): BookingInviteStore & { rows: LoadedBooking[]; audits: Record<string, unknown>[] } {
    const rows = initial.map((row) => ({ ...row }))
    const audits: Record<string, unknown>[] = []
    return {
      rows,
      audits,
      async listDue(now) {
        return rows.filter(
          (row) =>
            row.invite_status === "scheduled" &&
            row.status === "pending" &&
            row.invite_send_at &&
            new Date(row.invite_send_at).getTime() <= now.getTime(),
        )
      },
      async claim(id) {
        const row = rows.find((item) => item.id === id)
        if (!row || row.invite_status !== "scheduled") return null
        row.invite_status = "sending"
        return { ...row }
      },
      async markSent(id, now, count) {
        const row = rows.find((item) => item.id === id)
        if (!row) return
        row.invite_status = "sent"
        row.invite_sent_at = now.toISOString()
        row.invite_count = count
        row.invite_error = null
      },
      async markFailed(id, _now, error) {
        const row = rows.find((item) => item.id === id)
        if (!row) return
        row.invite_status = "failed"
        row.invite_error = error
      },
      async audit(entry) {
        audits.push(entry)
      },
    }
  }

  const due: LoadedBooking = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "pending",
    visitor_email: "guest@example.com",
    invite_status: "scheduled",
    invite_send_at: "2026-10-22T11:00:00.000Z",
    invite_count: 0,
  }

  it("claims a due row once and marks it sent", async () => {
    const store = memoryStore([{ ...due }])
    let sends = 0
    const result = await processDueBookingInvites({
      store,
      now: new Date("2026-10-22T12:00:00.000Z"),
      send: async () => {
        sends += 1
        return { sent: true }
      },
    })
    assert.deepEqual(result, { claimed: 1, sent: 1, failed: 0, skipped: 0 })
    assert.equal(sends, 1)
    assert.equal(store.rows[0].invite_status, "sent")
    assert.equal(store.rows[0].invite_count, 1)
    assert.equal(store.audits[0]?.action, "booking.invite_sent")
  })

  it("does not send twice when two workers claim the same row", async () => {
    const store = memoryStore([{ ...due }])
    let sends = 0
    const send = async () => {
      sends += 1
      return { sent: true }
    }
    const now = new Date("2026-10-22T12:00:00.000Z")
    const [first, second] = await Promise.all([
      processDueBookingInvites({ store, now, send }),
      processDueBookingInvites({ store, now, send }),
    ])
    assert.equal(sends, 1)
    assert.equal(first.sent + second.sent, 1)
    assert.equal(first.skipped + second.skipped, 1)
    assert.equal(store.rows[0].invite_status, "sent")
  })

  it("skips rows that are already sending or sent", async () => {
    const store = memoryStore([
      { ...due, invite_status: "sending" },
      { ...due, id: "22222222-2222-4222-8222-222222222222", invite_status: "sent" },
    ])
    const result = await processDueBookingInvites({
      store,
      now: new Date("2026-10-22T12:00:00.000Z"),
      send: async () => ({ sent: true }),
    })
    assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0, skipped: 0 })
  })

  it("marks a failed send and audits booking.invite_failed", async () => {
    const store = memoryStore([{ ...due }])
    const result = await processDueBookingInvites({
      store,
      now: new Date("2026-10-22T12:00:00.000Z"),
      send: async () => ({ sent: false, error: "smtp_not_configured" }),
    })
    assert.equal(result.failed, 1)
    assert.equal(store.rows[0].invite_status, "failed")
    assert.equal(store.audits[0]?.action, "booking.invite_failed")
  })
})

describe("matchPendingBooking", () => {
  const LOCATION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
  const BOOKING_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
  const now = new Date("2026-10-22T17:00:00.000Z")

  function fakeAdmin(opts: {
    byId?: Record<string, unknown> | null
    list?: Array<Record<string, unknown>>
    sends?: Array<Record<string, unknown>>
  }) {
    return {
      from(table: string) {
        const rows = table === "training_link_sends" ? opts.sends ?? [] : opts.list ?? []
        const self: Record<string, unknown> = {
          select() {
            return self
          },
          eq() {
            return self
          },
          ilike() {
            return self
          },
          gte() {
            return self
          },
          lt() {
            return self
          },
          not() {
            return self
          },
          order() {
            return self
          },
          limit() {
            return self
          },
          maybeSingle() {
            return Promise.resolve({ data: table === "bookings" ? opts.byId ?? null : rows[0] ?? null, error: null })
          },
          then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
            return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected)
          },
        }
        return self
      },
    }
  }

  it("uses an explicit booking id when it is pending at the site", async () => {
    const admin = fakeAdmin({
      byId: { id: BOOKING_ID, status: "pending", location_id: LOCATION_ID, visitor_email: "a@b.com" },
    })
    const match = await matchPendingBooking(admin, {
      bookingId: BOOKING_ID,
      locationId: LOCATION_ID,
      timezone: "America/Chicago",
      now,
    })
    assert.equal(match?.id, BOOKING_ID)
  })

  it("matches pending bookings by email, site, and local day", async () => {
    const arrival = localDatetimeToUtc("2026-10-22T10:00", "America/Chicago")
    assert.ok(arrival)
    const admin = fakeAdmin({
      list: [
        {
          id: BOOKING_ID,
          status: "pending",
          location_id: LOCATION_ID,
          visitor_email: "guest@example.com",
          expected_arrival: arrival.toISOString(),
        },
      ],
    })
    const match = await matchPendingBooking(admin, {
      email: "guest@example.com",
      locationId: LOCATION_ID,
      timezone: "America/Chicago",
      now,
    })
    assert.equal(match?.id, BOOKING_ID)
  })

  it("ignores a booking on another local day", async () => {
    const admin = fakeAdmin({
      list: [
        {
          id: BOOKING_ID,
          status: "pending",
          location_id: LOCATION_ID,
          visitor_email: "guest@example.com",
          expected_arrival: "2026-10-21T15:00:00.000Z",
        },
      ],
    })
    const match = await matchPendingBooking(admin, {
      email: "guest@example.com",
      locationId: LOCATION_ID,
      timezone: "America/Chicago",
      now,
    })
    assert.equal(match, null)
  })

  it("prefers a booking id from a recent training link send", async () => {
    const admin = fakeAdmin({
      sends: [{ booking_id: BOOKING_ID, created_at: "2026-10-20T12:00:00.000Z" }],
      byId: { id: BOOKING_ID, status: "pending", location_id: LOCATION_ID },
    })
    const match = await matchPendingBooking(admin, {
      email: "guest@example.com",
      locationId: LOCATION_ID,
      timezone: "America/Chicago",
      now,
    })
    assert.equal(match?.id, BOOKING_ID)
  })
})

describe("checkInMatchedBooking", () => {
  it("sets checked_in and visitor_id on the matched row", async () => {
    const writes: Array<{ table: string; payload: unknown }> = []
    const admin = {
      from(table: string) {
        const self: Record<string, unknown> = {
          select() {
            return self
          },
          eq() {
            return self
          },
          ilike() {
            return self
          },
          gte() {
            return self
          },
          lt() {
            return self
          },
          not() {
            return self
          },
          order() {
            return self
          },
          limit() {
            return self
          },
          update(payload: unknown) {
            writes.push({ table, payload })
            return self
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                status: "pending",
                location_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
              },
              error: null,
            })
          },
          then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
            return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
          },
        }
        return self
      },
    }
    const result = await checkInMatchedBooking(admin, {
      bookingId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      visitorId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      locationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      timezone: "America/Chicago",
    })
    assert.equal(result?.id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    assert.equal(writes[0]?.table, "bookings")
    assert.equal((writes[0]?.payload as { status: string }).status, "checked_in")
    assert.equal((writes[0]?.payload as { visitor_id: string }).visitor_id, "cccccccc-cccc-cccc-cccc-cccccccccccc")
  })
})
