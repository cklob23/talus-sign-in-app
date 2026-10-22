import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { hostEntryLabel, inferHostEntrySource } from "./host-entry.ts"
import { fetchTrainingVideoSeconds, formatReadyAbout, trainingSecondsFromRecord } from "./training-ready.ts"

describe("host entry label", () => {
  it("uses QR code for QR sign-ins and a kiosk name or Kiosk otherwise", () => {
    assert.equal(hostEntryLabel("qr"), "QR code")
    assert.equal(hostEntryLabel("qr", "Main lobby"), "QR code")
    assert.equal(hostEntryLabel("kiosk", "North gate tablet"), "North gate tablet")
    assert.equal(hostEntryLabel("kiosk", "  "), "Kiosk")
    assert.equal(hostEntryLabel("kiosk"), "Kiosk")
    assert.equal(hostEntryLabel(null), "Kiosk")
  })

  it("infers QR from signed-in-by when the source was not passed", () => {
    assert.equal(inferHostEntrySource({ signedInBy: "QR" }), "qr")
    assert.equal(inferHostEntrySource({ signedInBy: "QR code" }), "qr")
    assert.equal(inferHostEntrySource({ signedInBy: "Kiosk" }), "kiosk")
    assert.equal(inferHostEntrySource({ entrySource: "qr", signedInBy: "Kiosk" }), "qr")
  })
})

describe("training ready copy", () => {
  it("rounds video length up to minutes and omits unknown times", () => {
    assert.equal(formatReadyAbout(453), "about 8 minutes")
    assert.equal(formatReadyAbout(7 * 60 + 33), "about 8 minutes")
    assert.equal(formatReadyAbout(60), "about 1 minute")
    assert.equal(formatReadyAbout(61), "about 2 minutes")
    assert.equal(formatReadyAbout(null), null)
    assert.equal(formatReadyAbout(0), null)
    assert.equal(formatReadyAbout(-1), null)
  })

  it("reads a stored duration from the visitor type or location row", () => {
    assert.equal(trainingSecondsFromRecord({ training_video_duration_seconds: 453 }), 453)
    assert.equal(trainingSecondsFromRecord({ training_duration_seconds: "180" }), 180)
    assert.equal(trainingSecondsFromRecord({ training_video_url: "https://cdn.example.com/safety.mp4" }), null)
  })

  it("parses YouTube and Vimeo durations from a mocked fetch", async () => {
    const youtube = await fetchTrainingVideoSeconds(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      async () => new Response('"lengthSeconds":"453"'),
    )
    assert.equal(youtube, 453)
    const vimeo = await fetchTrainingVideoSeconds(
      "https://vimeo.com/123456789",
      async () => new Response(JSON.stringify({ duration: 453 })),
    )
    assert.equal(vimeo, 453)
    const unknown = await fetchTrainingVideoSeconds("https://cdn.example.com/safety.mp4")
    assert.equal(unknown, null)
  })
})
