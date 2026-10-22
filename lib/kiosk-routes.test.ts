import assert from "node:assert/strict"
import { before, beforeEach, describe, it } from "node:test"

process.env.KIOSK_ROUTE_TEST_MOCKS = "1"

const VISITOR_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const LOCATION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const HOST_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
const TYPE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
const SIGN_IN_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
const PHOTO_URL = "https://cdn.example.com/visitor-photos/aaaa.jpg"

function wire(body: unknown) {
  return JSON.parse(JSON.stringify(body)) as Record<string, unknown>
}

function jsonRequest(path: string, body: unknown, method = "POST") {
  return new Request(`http://kiosk.local${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const {
  POST: visitorPost,
  PUT: visitorPut,
} = await import("../app/api/kiosk/visitor/route.ts")
const { POST: signInPost } = await import("../app/api/kiosk/sign-in/route.ts")
const { POST: signOutPost } = await import("../app/api/kiosk/sign-out/route.ts")
const { POST: trainingPost } = await import("../app/api/kiosk/training/route.ts")
const { POST: notifyHostPost } = await import("../app/api/notify-host/route.ts")
const { POST: trainingStatusPost } = await import("../app/api/kiosk/training-status/route.ts")
const { POST: findSignInPost } = await import("../app/api/kiosk/find-sign-in/route.ts")
const { POST: completeBookingsPost } = await import("../app/api/kiosk/complete-bookings/route.ts")
const { POST: employeeSignoutPost } = await import("../app/api/kiosk/employee-signout/route.ts")
const { writes, resetWrites } = await import("./test-mocks/supabase-server.ts")

before(() => {
  assert.equal(process.env.KIOSK_ROUTE_TEST_MOCKS, "1")
})

beforeEach(() => {
  resetWrites()
})

describe("kiosk walk-in payloads through route handlers", () => {
  it("creates a walk-in visitor without photo_url or email", async () => {
    const body = wire({
      first_name: "Jane",
      last_name: "Doe",
      email: null,
      phone: null,
      company: null,
    })
    const res = await visitorPost(jsonRequest("/api/kiosk/visitor", body))
    assert.equal(res.status, 200, await res.clone().text())
    const json = await res.json()
    assert.equal(json.success, true)
    assert.equal(json.visitor.id, VISITOR_ID)
  })

  it("creates a walk-in visitor with email and company, still omitting photo_url", async () => {
    const body = wire({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane.doe@talusag.com",
      phone: null,
      company: "Talus Ag",
    })
    const res = await visitorPost(jsonRequest("/api/kiosk/visitor", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("rejects a present-but-invalid email on visitor create", async () => {
    const res = await visitorPost(
      jsonRequest("/api/kiosk/visitor", {
        first_name: "Jane",
        last_name: "Doe",
        email: "not-an-email",
      }),
    )
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, "Invalid field value")
  })

  it("updates photo_url only when PUT sends it", async () => {
    const res = await visitorPut(
      jsonRequest(
        "/api/kiosk/visitor",
        { id: VISITOR_ID, photo_url: PHOTO_URL },
        "PUT",
      ),
    )
    assert.equal(res.status, 200, await res.clone().text())
    const update = writes.find((w) => w.table === "visitors" && w.op === "update")
    assert.deepEqual(update?.payload, { photo_url: PHOTO_URL })
  })

  it("does not null out photo_url when PUT omits it", async () => {
    const res = await visitorPut(
      jsonRequest("/api/kiosk/visitor", { id: VISITOR_ID }, "PUT"),
    )
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, "Missing required field: photo_url")
    assert.equal(
      writes.find((w) => w.table === "visitors" && w.op === "update"),
      undefined,
    )
  })
})

describe("kiosk sign-in / training / notify-host / sign-out payloads", () => {
  it("records a walk-in sign-in without a photo", async () => {
    const body = wire({
      visitor_id: VISITOR_ID,
      visitor_name: "Jane Doe",
      visitor_email: null,
      location_id: LOCATION_ID,
      host_id: HOST_ID,
      badge_number: "V04821",
      photo_url: null,
      visitor_type_id: TYPE_ID,
      booking_id: null,
      timezone: "Pacific Standard Time",
    })
    const res = await signInPost(jsonRequest("/api/kiosk/sign-in", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("records a walk-in sign-in with a photo and email", async () => {
    const body = wire({
      visitor_id: VISITOR_ID,
      visitor_name: "Jane Doe",
      visitor_email: "jane.doe@talusag.com",
      location_id: LOCATION_ID,
      host_id: HOST_ID,
      badge_number: "V04821",
      photo_url: PHOTO_URL,
      visitor_type_id: TYPE_ID,
      booking_id: null,
      timezone: "Pacific Standard Time",
    })
    const res = await signInPost(jsonRequest("/api/kiosk/sign-in", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("records training completion when expires_at is omitted", async () => {
    const body = wire({
      visitor_id: VISITOR_ID,
      visitor_type_id: TYPE_ID,
    })
    const res = await trainingPost(jsonRequest("/api/kiosk/training", body))
    assert.equal(res.status, 200, await res.clone().text())
    const insert = writes.find((w) => w.table === "training_completions" && w.op === "insert")
    assert.ok(insert)
    const payload = insert.payload as { expires_at?: string }
    assert.ok(payload.expires_at)
  })

  it("sends notify-host completing_training without badge or photo", async () => {
    const body = wire({
      hostId: HOST_ID,
      visitorName: "Jane Doe",
      visitorCompany: "Talus Ag",
      purpose: "Meeting",
      locationName: "Headquarters",
      locationId: LOCATION_ID,
      notificationType: "completing_training",
      visitorTypeName: "Contractor",
    })
    const res = await notifyHostPost(jsonRequest("/api/notify-host", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("sends notify-host arrived with badge and photo", async () => {
    const body = wire({
      hostId: HOST_ID,
      visitorName: "Jane Doe",
      visitorCompany: "Talus Ag",
      purpose: "Meeting",
      badgeNumber: "V04821",
      locationName: "Headquarters",
      locationId: LOCATION_ID,
      notificationType: "arrived",
      visitorTypeName: "Contractor",
      visitorPhotoUrl: PHOTO_URL,
    })
    const res = await notifyHostPost(jsonRequest("/api/notify-host", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("signs out with the kiosk lookup payload", async () => {
    const body = wire({
      sign_in_id: SIGN_IN_ID,
      visitor_id: VISITOR_ID,
      visitor_name: "Jane Doe",
      visitor_email: "jane.doe@talusag.com",
      badge_number: "V04821",
    })
    const res = await signOutPost(jsonRequest("/api/kiosk/sign-out", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("signs out with the digital badge payload (visitor_id null)", async () => {
    const body = wire({
      sign_in_id: SIGN_IN_ID,
      visitor_id: null,
      visitor_name: "Jane Doe",
      visitor_email: "jane.doe@talusag.com",
      badge_number: "V04821",
    })
    const res = await signOutPost(jsonRequest("/api/kiosk/sign-out", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("looks up training status with the kiosk email payload", async () => {
    const res = await trainingStatusPost(
      jsonRequest("/api/kiosk/training-status", {
        email: "jane.doe@talusag.com",
        visitor_type_id: TYPE_ID,
      }),
    )
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("treats a missing training-status email as no match, not invalid", async () => {
    const res = await trainingStatusPost(
      jsonRequest("/api/kiosk/training-status", {
        visitor_type_id: TYPE_ID,
      }),
    )
    assert.equal(res.status, 200, await res.clone().text())
    const json = await res.json()
    assert.equal(json.hasValidTraining, false)
  })

  it("finds an active sign-in by email", async () => {
    const res = await findSignInPost(
      jsonRequest("/api/kiosk/find-sign-in", { email: "jane.doe@talusag.com" }),
    )
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("completes checked-in bookings by visitor email", async () => {
    const res = await completeBookingsPost(
      jsonRequest("/api/kiosk/complete-bookings", {
        visitor_email: "jane.doe@talusag.com",
      }),
    )
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("signs out an employee when location_id is sent", async () => {
    const res = await employeeSignoutPost(
      jsonRequest("/api/kiosk/employee-signout", {
        profile_id: "11111111-1111-1111-1111-111111111111",
        location_id: LOCATION_ID,
      }),
    )
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("still rejects a present-but-invalid sign-in timezone", async () => {
    const res = await signInPost(
      jsonRequest("/api/kiosk/sign-in", {
        visitor_id: VISITOR_ID,
        location_id: LOCATION_ID,
        timezone: "x".repeat(65),
      }),
    )
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, "Invalid field value")
  })
})

describe("current kiosk client payloads", () => {
  const IDEMPOTENCY_KEY = "11111111-1111-4111-8111-111111111111"

  it("accepts the walk-in sign-in body the kiosk posts today", async () => {
    const body = wire({
      visitor_id: VISITOR_ID,
      visitor_name: "Jane Doe",
      visitor_email: "jane.doe@talusag.com",
      visitor_company: "Talus Ag",
      purpose: "Meeting",
      visitor_type_name: "Contractor",
      location_id: LOCATION_ID,
      host_id: HOST_ID,
      badge_number: "V04821",
      photo_url: PHOTO_URL,
      visitor_type_id: TYPE_ID,
      booking_id: null,
      timezone: "Pacific Standard Time",
      idempotency_key: IDEMPOTENCY_KEY,
    })
    const res = await signInPost(jsonRequest("/api/kiosk/sign-in", body))
    assert.equal(res.status, 200, await res.clone().text())
    const json = await res.json()
    assert.equal(json.success, true)
  })

  it("accepts the booking sign-in body with a null photo and omitted extras treated as null", async () => {
    const body = wire({
      visitor_id: VISITOR_ID,
      visitor_name: "Jane Doe",
      visitor_email: "jane.doe@talusag.com",
      visitor_company: "Talus Ag",
      purpose: "Site walk",
      visitor_type_name: "Contractor",
      location_id: LOCATION_ID,
      host_id: HOST_ID,
      badge_number: "V04821",
      photo_url: null,
      visitor_type_id: TYPE_ID,
      booking_id: "99999999-9999-4999-8999-999999999999",
      timezone: "Pacific Standard Time",
      idempotency_key: IDEMPOTENCY_KEY,
    })
    const res = await signInPost(jsonRequest("/api/kiosk/sign-in", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("accepts a walk-in sign-in when idempotency_key and extra fields are omitted", async () => {
    const body = wire({
      visitor_id: VISITOR_ID,
      visitor_name: "Jane Doe",
      visitor_email: null,
      location_id: LOCATION_ID,
      host_id: HOST_ID,
      badge_number: "V04821",
      photo_url: null,
      visitor_type_id: TYPE_ID,
      booking_id: null,
      timezone: "Pacific Standard Time",
    })
    assert.equal("idempotency_key" in body, false)
    assert.equal("visitor_company" in body, false)
    assert.equal("purpose" in body, false)
    assert.equal("visitor_type_name" in body, false)
    const res = await signInPost(jsonRequest("/api/kiosk/sign-in", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("rejects a present-but-invalid idempotency_key on sign-in", async () => {
    const res = await signInPost(
      jsonRequest("/api/kiosk/sign-in", {
        visitor_id: VISITOR_ID,
        location_id: LOCATION_ID,
        idempotency_key: "not-a-uuid",
      }),
    )
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, "Invalid field value")
  })

  it("accepts the training notify-host body the kiosk posts today", async () => {
    const body = wire({
      hostId: HOST_ID,
      visitorName: "Jane Doe",
      visitorCompany: "Talus Ag",
      purpose: "Meeting",
      locationName: "Headquarters",
      locationId: LOCATION_ID,
      notificationType: "completing_training",
      visitorTypeName: "Contractor",
      idempotencyKey: IDEMPOTENCY_KEY,
    })
    assert.equal("badgeNumber" in body, false)
    assert.equal("visitorPhotoUrl" in body, false)
    assert.equal("signInId" in body, false)
    const res = await notifyHostPost(jsonRequest("/api/notify-host", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("accepts notify-host training when idempotencyKey is omitted", async () => {
    const body = wire({
      hostId: HOST_ID,
      visitorName: "Jane Doe",
      visitorCompany: "Talus Ag",
      purpose: "Meeting",
      locationName: "Headquarters",
      locationId: LOCATION_ID,
      notificationType: "completing_training",
      visitorTypeName: "Contractor",
    })
    assert.equal("idempotencyKey" in body, false)
    const res = await notifyHostPost(jsonRequest("/api/notify-host", body))
    assert.equal(res.status, 200, await res.clone().text())
  })

  it("rejects a present-but-invalid notify-host idempotencyKey", async () => {
    const res = await notifyHostPost(
      jsonRequest("/api/notify-host", {
        hostId: HOST_ID,
        visitorName: "Jane Doe",
        locationId: LOCATION_ID,
        idempotencyKey: "not-a-uuid",
      }),
    )
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, "Invalid host, sign-in id, or idempotency key")
  })

  it("finds an active sign-in by badge number without email", async () => {
    const body = wire({ badgeNumber: "V04821" })
    assert.equal("email" in body, false)
    const res = await findSignInPost(jsonRequest("/api/kiosk/find-sign-in", body))
    assert.equal(res.status, 200, await res.clone().text())
  })
})
