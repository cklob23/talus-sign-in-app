"use client"

import { useEffect, useId, useRef, useState } from "react"
import { parseTrainingMedia, type TrainingMedia } from "@/lib/training-media"
import { clampSeek, recordWatchPosition, watchedToEnd, type WatchProgress } from "@/lib/checkin-idle"

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        opts: {
          videoId: string
          host?: string
          playerVars?: Record<string, number | string>
          events?: {
            onReady?: (event: { target: YtPlayer }) => void
            onStateChange?: (event: { data: number; target: YtPlayer }) => void
          }
        },
      ) => YtPlayer
      PlayerState?: { ENDED: number }
    }
    onYouTubeIframeAPIReady?: () => void
    Vimeo?: {
      Player: new (
        element: HTMLIFrameElement | HTMLElement,
        opts?: Record<string, unknown>,
      ) => VimeoPlayer
    }
  }
}

interface YtPlayer {
  getDuration: () => number
  getCurrentTime?: () => number
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void
  destroy?: () => void
}

interface VimeoPlayer {
  on: (event: string, cb: (data?: { seconds?: number }) => void) => void
  getDuration: () => Promise<number>
  getCurrentTime?: () => Promise<number>
  setCurrentTime?: (seconds: number) => Promise<number>
  destroy?: () => Promise<void>
}

function loadScript(src: string, id: string): Promise<void> {
  if (document.getElementById(id)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.id = id
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Could not load ${src}`))
    document.body.appendChild(script)
  })
}

export function TrainingPlayer({
  url,
  title,
  onEnded,
  onDuration,
  onPlayingChange,
}: {
  url: string
  title?: string
  onEnded: (videoSeconds: number) => void
  onDuration?: (videoSeconds: number) => void
  onPlayingChange?: (playing: boolean) => void
}) {
  const media = parseTrainingMedia(url)
  if (!media) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">
        This training video link is not a supported MP4, YouTube, or Vimeo URL.
      </div>
    )
  }
  return (
    <ResolvedTrainingPlayer
      media={media}
      title={title}
      onEnded={onEnded}
      onDuration={onDuration}
      onPlayingChange={onPlayingChange}
    />
  )
}

function ResolvedTrainingPlayer({
  media,
  title,
  onEnded,
  onDuration,
  onPlayingChange,
}: {
  media: TrainingMedia
  title?: string
  onEnded: (videoSeconds: number) => void
  onDuration?: (videoSeconds: number) => void
  onPlayingChange?: (playing: boolean) => void
}) {
  if (media.kind === "youtube") {
    return (
      <YouTubePlayer
        videoId={media.youtubeId || ""}
        title={title}
        onEnded={onEnded}
        onDuration={onDuration}
        onPlayingChange={onPlayingChange}
      />
    )
  }
  if (media.kind === "vimeo") {
    return (
      <VimeoPlayer
        embedUrl={media.embedUrl}
        title={title}
        onEnded={onEnded}
        onDuration={onDuration}
        onPlayingChange={onPlayingChange}
      />
    )
  }
  return (
    <FilePlayer
      src={media.url}
      title={title}
      onEnded={onEnded}
      onDuration={onDuration}
      onPlayingChange={onPlayingChange}
    />
  )
}

function maybeUnlock(
  ended: boolean,
  progress: WatchProgress,
  durationSeconds: number,
  onEnded: (videoSeconds: number) => void,
  unlockedRef: { current: boolean },
) {
  if (unlockedRef.current) return
  if (!watchedToEnd(progress, durationSeconds, ended)) return
  unlockedRef.current = true
  onEnded(durationSeconds)
}

function FilePlayer({
  src,
  title,
  onEnded,
  onDuration,
  onPlayingChange,
}: {
  src: string
  title?: string
  onEnded: (videoSeconds: number) => void
  onDuration?: (videoSeconds: number) => void
  onPlayingChange?: (playing: boolean) => void
}) {
  const progressRef = useRef<WatchProgress>({ maxWatched: 0 })
  const durationRef = useRef(0)
  const unlockedRef = useRef(false)
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded

  function onTime(video: HTMLVideoElement) {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : durationRef.current
    durationRef.current = duration
    const clamped = clampSeek(progressRef.current, video.currentTime)
    if (clamped < video.currentTime) {
      video.currentTime = clamped
      return
    }
    recordWatchPosition(progressRef.current, video.currentTime)
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- captions are baked into the source video
    <video
      src={src}
      title={title || "Safety training"}
      controls
      playsInline
      className="aspect-video w-full rounded-lg bg-black"
      onLoadedMetadata={(event) => {
        const duration = event.currentTarget.duration
        if (Number.isFinite(duration) && duration > 0) {
          durationRef.current = duration
          onDuration?.(duration)
        }
      }}
      onTimeUpdate={(event) => onTime(event.currentTarget)}
      onSeeking={(event) => onTime(event.currentTarget)}
      onSeeked={(event) => onTime(event.currentTarget)}
      onPlay={() => onPlayingChange?.(true)}
      onPause={() => onPlayingChange?.(false)}
      onEnded={(event) => {
        onPlayingChange?.(false)
        const duration = event.currentTarget.duration
        if (Number.isFinite(duration) && duration > 0) durationRef.current = duration
        maybeUnlock(true, progressRef.current, durationRef.current, endedRef.current, unlockedRef)
      }}
    />
  )
}

function YouTubePlayer({
  videoId,
  title,
  onEnded,
  onDuration,
  onPlayingChange,
}: {
  videoId: string
  title?: string
  onEnded: (videoSeconds: number) => void
  onDuration?: (videoSeconds: number) => void
  onPlayingChange?: (playing: boolean) => void
}) {
  const hostId = useId()
  const mountRef = useRef<HTMLDivElement>(null)
  const endedRef = useRef(onEnded)
  const durationRef = useRef(onDuration)
  const playingRef = useRef(onPlayingChange)
  endedRef.current = onEnded
  durationRef.current = onDuration
  playingRef.current = onPlayingChange

  const progressRef = useRef<WatchProgress>({ maxWatched: 0 })
  const durationSecondsRef = useRef(0)
  const unlockedRef = useRef(false)

  useEffect(() => {
    let player: YtPlayer | null = null
    let cancelled = false
    let poll: number | null = null
    const host = mountRef.current
    if (!host || !videoId) return

    const lockTime = (target: YtPlayer) => {
      const duration = target.getDuration()
      if (Number.isFinite(duration) && duration > 0) durationSecondsRef.current = duration
      const current = typeof target.getCurrentTime === "function" ? target.getCurrentTime() : 0
      const clamped = clampSeek(progressRef.current, current)
      if (clamped < current && typeof target.seekTo === "function") {
        target.seekTo(clamped, true)
        return
      }
      recordWatchPosition(progressRef.current, current)
    }

    const start = () => {
      if (cancelled || !window.YT?.Player || !mountRef.current) return
      player = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: (event) => {
            const duration = event.target.getDuration()
            if (Number.isFinite(duration) && duration > 0) {
              durationSecondsRef.current = duration
              durationRef.current?.(duration)
            }
            if (poll == null) {
              poll = window.setInterval(() => {
                if (player) lockTime(player)
              }, 400)
            }
          },
          onStateChange: (event) => {
            lockTime(event.target)
            const ended = window.YT?.PlayerState?.ENDED ?? 0
            if (event.data === 1) playingRef.current?.(true)
            if (event.data === 2) playingRef.current?.(false)
            if (event.data === ended) {
              playingRef.current?.(false)
              const duration = event.target.getDuration()
              if (Number.isFinite(duration) && duration > 0) durationSecondsRef.current = duration
              maybeUnlock(true, progressRef.current, durationSecondsRef.current, endedRef.current, unlockedRef)
            }
          },
        },
      })
    }

    const previous = window.onYouTubeIframeAPIReady
    void loadScript("https://www.youtube.com/iframe_api", "yt-iframe-api")
      .then(() => {
        if (window.YT?.Player) {
          start()
          return
        }
        window.onYouTubeIframeAPIReady = () => {
          previous?.()
          start()
        }
      })
      .catch(() => {
        // The host stays empty; the visitor can ask reception.
      })

    return () => {
      cancelled = true
      if (poll != null) window.clearInterval(poll)
      try {
        player?.destroy?.()
      } catch {
        // ignore
      }
    }
  }, [videoId, hostId])

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <div ref={mountRef} title={title || "Safety training"} className="h-full w-full" />
    </div>
  )
}

function VimeoPlayer({
  embedUrl,
  title,
  onEnded,
  onDuration,
  onPlayingChange,
}: {
  embedUrl: string
  title?: string
  onEnded: (videoSeconds: number) => void
  onDuration?: (videoSeconds: number) => void
  onPlayingChange?: (playing: boolean) => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const endedRef = useRef(onEnded)
  const durationRef = useRef(onDuration)
  const playingRef = useRef(onPlayingChange)
  endedRef.current = onEnded
  durationRef.current = onDuration
  playingRef.current = onPlayingChange

  const progressRef = useRef<WatchProgress>({ maxWatched: 0 })
  const durationSecondsRef = useRef(0)
  const unlockedRef = useRef(false)

  useEffect(() => {
    let player: VimeoPlayer | null = null
    let cancelled = false
    void loadScript("https://player.vimeo.com/api/player.js", "vimeo-player-api")
      .then(() => {
        if (cancelled || !iframeRef.current || !window.Vimeo?.Player) return
        player = new window.Vimeo.Player(iframeRef.current)
        const lockTime = (seconds?: number) => {
          const apply = (current: number) => {
            const clamped = clampSeek(progressRef.current, current)
            if (clamped < current && typeof player?.setCurrentTime === "function") {
              void player.setCurrentTime(clamped)
              return
            }
            recordWatchPosition(progressRef.current, current)
          }
          if (typeof seconds === "number") {
            apply(seconds)
            return
          }
          void player?.getCurrentTime?.().then(apply)
        }
        player.getDuration().then((duration) => {
          if (Number.isFinite(duration) && duration > 0) {
            durationSecondsRef.current = duration
            durationRef.current?.(duration)
          }
        })
        player.on("play", () => playingRef.current?.(true))
        player.on("pause", () => playingRef.current?.(false))
        player.on("timeupdate", (data) => lockTime(data?.seconds))
        player.on("seeked", (data) => lockTime(data?.seconds))
        player.on("ended", () => {
          playingRef.current?.(false)
          player?.getDuration().then((duration) => {
            if (Number.isFinite(duration) && duration > 0) durationSecondsRef.current = duration
            maybeUnlock(true, progressRef.current, durationSecondsRef.current, endedRef.current, unlockedRef)
          })
        })
      })
      .catch(() => {
        // The iframe still plays; completion will not unlock without the API.
      })
    return () => {
      cancelled = true
      void player?.destroy?.()
    }
  }, [embedUrl])

  return (
    <iframe
      ref={iframeRef}
      src={embedUrl}
      title={title || "Safety training"}
      className="aspect-video w-full rounded-lg bg-black"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
    />
  )
}

export function TrainingUrlPreview({ url }: { url: string }) {
  const media = parseTrainingMedia(url)
  const [open, setOpen] = useState(false)
  if (!url.trim()) return null
  if (!media) {
    return <p className="text-sm text-destructive">Enter an https MP4, YouTube, or Vimeo URL.</p>
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {media.kind === "youtube" ? "YouTube" : media.kind === "vimeo" ? "Vimeo" : "Video file"} link looks valid.
      </p>
      <button
        type="button"
        className="text-sm font-medium text-[#00703f] underline"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide preview" : "Show preview"}
      </button>
      {open ? (
        media.kind === "file" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={media.url} controls className="aspect-video w-full rounded-lg bg-black" />
        ) : (
          <iframe
            src={media.embedUrl}
            title="Training preview"
            className="aspect-video w-full rounded-lg bg-black"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )
      ) : null}
    </div>
  )
}
