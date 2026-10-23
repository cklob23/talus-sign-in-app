import { parseTrainingMedia } from "@/lib/training-media"

const DURATION_KEYS = [
  "training_duration_seconds",
  "training_video_duration_seconds",
  "training_video_seconds",
  "video_duration_seconds",
] as const

/** Round a video length up to whole minutes for host copy. */
export function formatReadyAbout(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return minutes === 1 ? "about 1 minute" : `about ${minutes} minutes`
}

export function trainingSecondsFromRecord(row: Record<string, unknown> | null | undefined): number | null {
  if (!row) return null
  for (const key of DURATION_KEYS) {
    const value = row[key]
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return null
}

/**
 * Best-effort length of the visitor type's training video. Returns null when
 * the host cannot be sure, so the email can omit the time estimate.
 */
export async function fetchTrainingVideoSeconds(
  url: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const media = parseTrainingMedia(url)
  if (!media) return null
  try {
    if (media.kind === "vimeo" && media.vimeoId) {
      const res = await fetchImpl(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(media.url)}`, {
        signal: AbortSignal.timeout(2500),
      })
      if (!res.ok) return null
      const json = (await res.json()) as { duration?: number }
      return Number.isFinite(json.duration) && (json.duration as number) > 0 ? Number(json.duration) : null
    }
    if (media.kind === "youtube" && media.youtubeId) {
      const res = await fetchImpl(`https://www.youtube.com/watch?v=${media.youtubeId}`, {
        signal: AbortSignal.timeout(2500),
        headers: { "Accept-Language": "en" },
      })
      if (!res.ok) return null
      const html = await res.text()
      const match = html.match(/"lengthSeconds":"(\d+)"/)
      if (!match) return null
      const seconds = Number(match[1])
      return Number.isFinite(seconds) && seconds > 0 ? seconds : null
    }
  } catch {
    return null
  }
  return null
}
