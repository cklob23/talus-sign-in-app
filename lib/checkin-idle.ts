/**
 * Idle reset rules for the public QR check-in flow.
 *
 * The flow clears itself after a period with no interaction so a shared phone
 * never leaks the previous visitor's details. Watching the safety video is
 * not "idle", even though the visitor does not touch the screen for its whole
 * length (QA found a 7:33 video plus the time before pressing play crossed the
 * old 10 minute limit and silently threw the visitor back to step 1).
 */

export const CHECKIN_IDLE_MS = 10 * 60 * 1000
/** Kiosk half-finished forms return to welcome after this idle time. */
export const KIOSK_IDLE_MS = 90 * 1000
/** Success screen returns to welcome unless someone taps. */
export const KIOSK_DONE_RESET_MS = 20 * 1000
/** Visible countdown before an idle reset. */
export const KIOSK_IDLE_WARN_MS = 10 * 1000

export function shouldIdleReset(opts: {
  now: number
  lastActivityAt: number
  /** True while the training video is playing. */
  mediaPlaying: boolean
  /** True while a request (such as the final sign-in) is in flight. */
  busy: boolean
  /** The success screen never times out, so a visitor can read their badge. */
  done: boolean
  limitMs?: number
}): boolean {
  if (opts.done || opts.mediaPlaying || opts.busy) return false
  return opts.now - opts.lastActivityAt >= (opts.limitMs ?? CHECKIN_IDLE_MS)
}

export const IDLE_RESET_NOTICE =
  "Your sign-in was cleared after 10 minutes without activity. Please start again."

export function idleSecondsLeft(opts: {
  now: number
  lastActivityAt: number
  limitMs: number
}): number {
  return Math.max(0, Math.ceil((opts.limitMs - (opts.now - opts.lastActivityAt)) / 1000))
}

export function shouldShowIdleWarning(opts: {
  now: number
  lastActivityAt: number
  limitMs: number
  warnMs?: number
}): boolean {
  const leftMs = opts.limitMs - (opts.now - opts.lastActivityAt)
  return leftMs > 0 && leftMs <= (opts.warnMs ?? KIOSK_IDLE_WARN_MS)
}

/**
 * Tracks how far a visitor has genuinely watched a video, so seeking ahead does
 * not count and "ended" only counts when the whole video was played.
 */
export interface WatchProgress {
  maxWatched: number
}

/** Seconds of forward jump tolerated (timeupdate fires every ~250 ms). */
export const SEEK_TOLERANCE_SECONDS = 2

/** Record a playback position. Returns the new furthest-watched point. */
export function recordWatchPosition(progress: WatchProgress, currentTime: number): number {
  if (!Number.isFinite(currentTime) || currentTime < 0) return progress.maxWatched
  if (currentTime <= progress.maxWatched + SEEK_TOLERANCE_SECONDS) {
    progress.maxWatched = Math.max(progress.maxWatched, currentTime)
  }
  return progress.maxWatched
}

/** Where to put the playhead after a seek; clamps forward seeks to what was watched. */
export function clampSeek(progress: WatchProgress, requested: number): number {
  if (!Number.isFinite(requested)) return progress.maxWatched
  return requested > progress.maxWatched + SEEK_TOLERANCE_SECONDS ? progress.maxWatched : requested
}

/** Unlock only after a native ended event and at least 95 percent genuinely watched. */
export const WATCH_COMPLETE_RATIO = 0.95

/** True when the furthest-watched point reaches the end of the video. */
export function watchedToEnd(progress: WatchProgress, duration: number, ended = true): boolean {
  if (!ended) return false
  if (!Number.isFinite(duration) || duration <= 0) return false
  return progress.maxWatched / duration >= WATCH_COMPLETE_RATIO
}
