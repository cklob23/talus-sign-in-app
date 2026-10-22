/**
 * Detect and validate training video URLs: direct MP4 (or similar files),
 * YouTube, and Vimeo. Shared by the player, the admin preview, and tickets.
 */

export type TrainingMediaKind = "file" | "youtube" | "vimeo"

export interface TrainingMedia {
  kind: TrainingMediaKind
  url: string
  embedUrl: string
  youtubeId?: string
  vimeoId?: string
}

const FILE_EXT = /\.(mp4|webm|ogg|m4v)(\?|#|$)/i

function youtubeId(value: string): string | null {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, "")
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0]
      return id && /^[\w-]{11}$/.test(id) ? id : null
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (url.pathname.startsWith("/embed/")) {
        const id = url.pathname.split("/")[2]
        return id && /^[\w-]{11}$/.test(id) ? id : null
      }
      if (url.pathname.startsWith("/shorts/")) {
        const id = url.pathname.split("/")[2]
        return id && /^[\w-]{11}$/.test(id) ? id : null
      }
      const id = url.searchParams.get("v")
      return id && /^[\w-]{11}$/.test(id) ? id : null
    }
  } catch {
    return null
  }
  return null
}

function vimeoId(value: string): string | null {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, "")
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const parts = url.pathname.split("/").filter(Boolean)
      const id = parts[0] === "video" ? parts[1] : parts[0]
      return id && /^\d{6,12}$/.test(id) ? id : null
    }
  } catch {
    return null
  }
  return null
}

export function parseTrainingMedia(raw: string | null | undefined): TrainingMedia | null {
  if (!raw || typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 2000) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null

  const yt = youtubeId(url.href)
  if (yt) {
    return {
      kind: "youtube",
      url: url.href,
      embedUrl: `https://www.youtube.com/embed/${yt}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1`,
      youtubeId: yt,
    }
  }

  const vim = vimeoId(url.href)
  if (vim) {
    return {
      kind: "vimeo",
      url: url.href,
      embedUrl: `https://player.vimeo.com/video/${vim}?api=1`,
      vimeoId: vim,
    }
  }

  if (FILE_EXT.test(url.pathname) || url.pathname.toLowerCase().includes("/video")) {
    return { kind: "file", url: url.href, embedUrl: url.href }
  }

  // A direct file URL without a well-known extension still counts if the
  // admin pasted a CDN link. The player will try to load it as a file.
  if (url.protocol === "https:" && !url.hostname.includes("youtube") && !url.hostname.includes("vimeo")) {
    return { kind: "file", url: url.href, embedUrl: url.href }
  }

  return null
}

export function describeTrainingMedia(media: TrainingMedia | null): string {
  if (!media) return "Enter an MP4 link, a YouTube URL, or a Vimeo URL."
  if (media.kind === "youtube") return "YouTube video. The visitor must watch to the end."
  if (media.kind === "vimeo") return "Vimeo video. The visitor must watch to the end."
  return "Video file. The visitor must watch to the end."
}
