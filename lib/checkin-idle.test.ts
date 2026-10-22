import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { CHECKIN_IDLE_MS, clampSeek, recordWatchPosition, shouldIdleReset, watchedToEnd } from "./checkin-idle.ts"

const base = { now: 0, lastActivityAt: 0, mediaPlaying: false, busy: false, done: false }

describe("QR check-in idle reset", () => {
  it("resets after 10 minutes with no activity", () => {
    assert.equal(shouldIdleReset({ ...base, now: CHECKIN_IDLE_MS - 1 }), false)
    assert.equal(shouldIdleReset({ ...base, now: CHECKIN_IDLE_MS }), true)
  })

  it("never resets while the training video is playing (QA Visitor7, 7:33 video)", () => {
    // Visitor tapped play, then did not touch the phone for 11 minutes.
    assert.equal(shouldIdleReset({ ...base, now: 11 * 60 * 1000, mediaPlaying: true }), false)
  })

  it("never resets while the sign-in request is in flight or on the badge screen", () => {
    assert.equal(shouldIdleReset({ ...base, now: 20 * 60 * 1000, busy: true }), false)
    assert.equal(shouldIdleReset({ ...base, now: 20 * 60 * 1000, done: true }), false)
  })
})

describe("training watch progress", () => {
  it("counts normal playback and blocks seeking ahead", () => {
    const progress = { maxWatched: 0 }
    for (let t = 0; t <= 120; t += 0.25) recordWatchPosition(progress, t)
    assert.equal(progress.maxWatched, 120)
    // A jump to the end is not counted and the playhead is pulled back.
    recordWatchPosition(progress, 450)
    assert.equal(progress.maxWatched, 120)
    assert.equal(clampSeek(progress, 450), 120)
    // Rewinding is fine.
    assert.equal(clampSeek(progress, 30), 30)
    assert.equal(watchedToEnd(progress, 453), false)
  })

  it("marks the video watched only once it really reached the end", () => {
    const progress = { maxWatched: 0 }
    for (let t = 0; t <= 453; t += 0.25) recordWatchPosition(progress, t)
    assert.equal(watchedToEnd(progress, 453), true)
    assert.equal(watchedToEnd(progress, Number.NaN), false)
  })
})
