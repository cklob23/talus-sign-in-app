import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  CHECKIN_IDLE_MS,
  KIOSK_DONE_RESET_MS,
  KIOSK_IDLE_MS,
  clampSeek,
  recordWatchPosition,
  SEEK_LOCK_COOLDOWN_MS,
  seekLockIsCoolingDown,
  shouldCorrectSeek,
  shouldIdleReset,
  shouldShowIdleWarning,
  watchedToEnd,
} from "./checkin-idle.ts"

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

describe("kiosk idle reset", () => {
  it("resets a half-finished form after 90 seconds", () => {
    assert.equal(shouldIdleReset({ ...base, now: KIOSK_IDLE_MS - 1, limitMs: KIOSK_IDLE_MS }), false)
    assert.equal(shouldIdleReset({ ...base, now: KIOSK_IDLE_MS, limitMs: KIOSK_IDLE_MS }), true)
  })

  it("does not interrupt training video playback", () => {
    assert.equal(
      shouldIdleReset({ ...base, now: 5 * 60 * 1000, mediaPlaying: true, limitMs: KIOSK_IDLE_MS }),
      false,
    )
  })

  it("resets the done screen after 20 seconds and warns in the last 10", () => {
    assert.equal(shouldIdleReset({ ...base, now: KIOSK_DONE_RESET_MS, limitMs: KIOSK_DONE_RESET_MS }), true)
    assert.equal(
      shouldShowIdleWarning({ now: 15_000, lastActivityAt: 0, limitMs: KIOSK_DONE_RESET_MS }),
      true,
    )
    assert.equal(
      shouldShowIdleWarning({ now: 5_000, lastActivityAt: 0, limitMs: KIOSK_DONE_RESET_MS }),
      false,
    )
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
    assert.equal(shouldCorrectSeek(progress, 450), true)
    assert.equal(shouldCorrectSeek(progress, 121.5), false)
    assert.equal(seekLockIsCoolingDown(1_000, 1_000 + SEEK_LOCK_COOLDOWN_MS - 1), true)
    assert.equal(seekLockIsCoolingDown(1_000, 1_000 + SEEK_LOCK_COOLDOWN_MS), false)
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

  it("does not unlock from a seek-to-end without 95 percent watched", () => {
    assert.equal(watchedToEnd({ maxWatched: 12 }, 180, true), false)
    assert.equal(watchedToEnd({ maxWatched: 171 }, 180, true), true)
    assert.equal(watchedToEnd({ maxWatched: 180 }, 180, false), false)
  })
})
