import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

process.env.KIOSK_ROUTE_TEST_MOCKS = "1"
process.env.KIOSK_SESSION_SECRET = "route-test-secret-0123456789"

const VISITOR_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const LOCATION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const HOST_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
const TYPE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
const TOKEN = "qr-token-0123456789abcdef"
const VIDEO_SECONDS = 453

const { issueTrainingTicket, qrTrainingScope, KIOSK_TRAINING_SCOPE } = await import("./training-gate.ts")
const { writes, resetWrites, setOverride, clearOverrides } = await import("./test-mocks/supabase-server.ts")
const { POST: kioskTrainingPost } = await import("../app/api/kiosk/training/route.ts")
const { POST: kioskTrainingStartPost } = await import("../app/api/kiosk/training/start/route.ts")
const { POST: kioskSignInPost } = await import("../app/api/kiosk/sign-in/route.ts")
const { POST: qrSignInPost } = await import("../app/api/checkin/[token]/route.ts")
const { POST: qrTrainingStartPost } = await import("../app/api/checkin/[token]/training-start/route.ts")

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://kiosk.local${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const qrParams = { params: Promise.resolve({ token: TOKEN }) }

function trainingType(videoUrl: string | null = "https://cdn.example.com/safety.mp4") {
  setOverride("visitor_types", {
    single: {
      id: TYPE_ID,
      name: "Contractor",
      requires_host: true,
      requires_company: false,
      requires_nda: false,
      requires_training: true,
      training_video_url: videoUrl,
    },
  })
}

function qrLocation() {
  setOverride("location_qr_codes", {
    single: {
      location_id: LOCATION_ID,
      locations: {
        id: LOCATION_ID,
        name: "Test Location",
        address: null,
        timezone: "America/New_York",
        latitude: null,
        longitude: null,
        auto_signin_radius_meters: null,
      },
    },
  })
  setOverride("settings", { single: { value: true } })
  // No existing sign-in for the idempotency key, no badge collisions.
  setOverride("sign_ins", { single: null, list: [] })
  setOverride("hosts", { single: { id: HOST_ID } })
}

function qrBody(training?: unknown) {
  return {
    firstName: "QA TEST",
    lastName: "Visitor7",
    email: "diego@example.com",
    visitorTypeId: TYPE_ID,
    hostId: HOST_ID,
    idempotencyKey: "11111111-2222-4333-8444-555555555555",
    training,
  }
}

beforeEach(() => {
  resetWrites()
  clearOverrides()
})

describe("QR check-in training enforcement", () => {
  it("issues a ticket at training start", async () => {
    qrLocation()
    trainingType()
    const res = await qrTrainingStartPost(
      jsonRequest(`/api/checkin/${TOKEN}/training-start`, {
        visitorTypeId: TYPE_ID,
        hostId: HOST_ID,
        firstName: "QA TEST",
        lastName: "Visitor7",
        notifyHost: true,
      }) as never,
      qrParams,
    )
    assert.equal(res.status, 200, await res.clone().text())
    const json = await res.json()
    assert.equal(typeof json.ticket, "string")
  })

  it("refuses sign-in with no training proof, and says why", async () => {
    qrLocation()
    trainingType()
    const res = await qrSignInPost(jsonRequest(`/api/checkin/${TOKEN}`, qrBody()) as never, qrParams)
    assert.equal(res.status, 409)
    const json = await res.json()
    assert.equal(json.code, "training_not_acknowledged")
    assert.ok(json.error.length > 0)
    assert.equal(writes.some((w) => w.table === "sign_ins"), false)
  })

  it("refuses sign-in while the video is still playing", async () => {
    qrLocation()
    trainingType()
    const ticket = issueTrainingTicket({
      visitorTypeId: TYPE_ID,
      scope: qrTrainingScope(LOCATION_ID),
      now: Date.now() - 60_000,
    })
    const res = await qrSignInPost(
      jsonRequest(`/api/checkin/${TOKEN}`, qrBody({ ticket, acknowledged: true, videoSeconds: VIDEO_SECONDS })) as never,
      qrParams,
    )
    assert.equal(res.status, 409)
    assert.equal((await res.json()).code, "training_too_early")
    assert.equal(writes.some((w) => w.table === "sign_ins"), false)
  })

  it("signs in a cross-location visitor who watched the full video, and records training", async () => {
    qrLocation()
    trainingType()
    const ticket = issueTrainingTicket({
      visitorTypeId: TYPE_ID,
      scope: qrTrainingScope(LOCATION_ID),
      now: Date.now() - (VIDEO_SECONDS + 30) * 1000,
    })
    const res = await qrSignInPost(
      jsonRequest(`/api/checkin/${TOKEN}`, qrBody({ ticket, acknowledged: true, videoSeconds: VIDEO_SECONDS })) as never,
      qrParams,
    )
    assert.equal(res.status, 200, await res.clone().text())
    const json = await res.json()
    assert.equal(json.success, true)
    assert.match(json.badgeNumber, /^V\d{5}$/)
    const signIn = writes.find((w) => w.table === "sign_ins" && w.op === "insert")
    assert.ok(signIn)
    assert.equal((signIn.payload as { host_id: string }).host_id, HOST_ID)
    assert.ok(writes.some((w) => w.table === "training_completions" && w.op === "insert"))
  })

  it("allows a QR sign-in when the visitor is cleared by a training link", async () => {
    qrLocation()
    trainingType()
    setOverride("visitors", { list: [{ id: VISITOR_ID, email: "diego@example.com" }] })
    setOverride("training_completions", {
      list: [
        {
          visitor_id: VISITOR_ID,
          completed_at: "2026-10-02T15:00:00.000Z",
          expires_at: "2027-10-02T15:00:00.000Z",
          source: "training_link",
        },
      ],
    })
    const res = await qrSignInPost(
      jsonRequest(
        `/api/checkin/${TOKEN}`,
        qrBody({ via: "link", prior: true, acknowledged: true }),
      ) as never,
      qrParams,
    )
    assert.equal(res.status, 200, await res.clone().text())
    assert.equal(writes.some((w) => w.table === "training_completions" && w.op === "insert"), false)
  })

  it("does not require training proof when the type has no video", async () => {
    qrLocation()
    trainingType(null)
    const res = await qrSignInPost(jsonRequest(`/api/checkin/${TOKEN}`, qrBody()) as never, qrParams)
    assert.equal(res.status, 200, await res.clone().text())
    assert.equal(writes.some((w) => w.table === "training_completions"), false)
  })
})

describe("kiosk training enforcement", () => {
  it("issues a kiosk training ticket", async () => {
    trainingType()
    const res = await kioskTrainingStartPost(jsonRequest("/api/kiosk/training/start", { visitor_type_id: TYPE_ID }))
    assert.equal(res.status, 200, await res.clone().text())
    assert.equal(typeof (await res.json()).ticket, "string")
  })

  it("refuses to record training without a ticket or acknowledgement", async () => {
    trainingType()
    const res = await kioskTrainingPost(
      jsonRequest("/api/kiosk/training", { visitor_id: VISITOR_ID, visitor_type_id: TYPE_ID }),
    )
    assert.equal(res.status, 409)
    assert.equal((await res.json()).code, "training_not_acknowledged")
    assert.equal(writes.some((w) => w.table === "training_completions"), false)
  })

  it("refuses a kiosk ticket that is younger than the training timer", async () => {
    trainingType()
    const ticket = issueTrainingTicket({ visitorTypeId: TYPE_ID, scope: KIOSK_TRAINING_SCOPE, now: Date.now() - 30_000 })
    const res = await kioskTrainingPost(
      jsonRequest("/api/kiosk/training", {
        visitor_id: VISITOR_ID,
        visitor_type_id: TYPE_ID,
        training: { ticket, acknowledged: true },
      }),
    )
    assert.equal(res.status, 409)
    assert.equal((await res.json()).code, "training_too_early")
  })

  it("records training after the full timer plus acknowledgement", async () => {
    trainingType()
    const ticket = issueTrainingTicket({ visitorTypeId: TYPE_ID, scope: KIOSK_TRAINING_SCOPE, now: Date.now() - 200_000 })
    const res = await kioskTrainingPost(
      jsonRequest("/api/kiosk/training", {
        visitor_id: VISITOR_ID,
        visitor_type_id: TYPE_ID,
        training: { ticket, acknowledged: true },
      }),
    )
    assert.equal(res.status, 200, await res.clone().text())
    assert.equal((await res.json()).method, "video")
  })

  it("ignores the old group bypass and requires a signed ticket", async () => {
    trainingType()
    const res = await kioskTrainingPost(
      jsonRequest("/api/kiosk/training", {
        visitor_id: VISITOR_ID,
        visitor_type_id: TYPE_ID,
        training: { bypass: true, acknowledged: true },
      }),
    )
    assert.equal(res.status, 409)
    assert.equal((await res.json()).code, "training_ticket_missing")
    assert.equal(writes.some((w) => w.table === "training_completions"), false)
  })

  it("records training from a still-valid prior completion", async () => {
    trainingType()
    setOverride("visitors", { list: [{ id: VISITOR_ID }] })
    setOverride("training_completions", { list: [{ visitor_id: VISITOR_ID, expires_at: null }] })
    const res = await kioskTrainingPost(
      jsonRequest("/api/kiosk/training", {
        visitor_id: VISITOR_ID,
        visitor_type_id: TYPE_ID,
        email: "jane.doe@talusag.com",
        training: { prior: true, acknowledged: true },
      }),
    )
    assert.equal(res.status, 200, await res.clone().text())
    assert.equal((await res.json()).method, "prior_completion")
  })

  it("refuses a kiosk sign-in for a training type with no valid completion", async () => {
    trainingType()
    setOverride("training_completions", { list: [] })
    setOverride("visitors", { list: [] })
    const res = await kioskSignInPost(
      jsonRequest("/api/kiosk/sign-in", {
        visitor_id: VISITOR_ID,
        location_id: LOCATION_ID,
        host_id: HOST_ID,
        visitor_type_id: TYPE_ID,
        visitor_name: "QA TEST Visitor",
      }),
    )
    assert.equal(res.status, 409)
    assert.equal((await res.json()).code, "training_required")
    assert.equal(writes.some((w) => w.table === "sign_ins"), false)
  })

  it("allows the kiosk sign-in once a completion exists", async () => {
    trainingType()
    setOverride("training_completions", { list: [{ visitor_id: VISITOR_ID, expires_at: null }] })
    const res = await kioskSignInPost(
      jsonRequest("/api/kiosk/sign-in", {
        visitor_id: VISITOR_ID,
        location_id: LOCATION_ID,
        host_id: HOST_ID,
        visitor_type_id: TYPE_ID,
        visitor_name: "QA TEST Visitor",
      }),
    )
    assert.equal(res.status, 200, await res.clone().text())
  })
})
