"use client"

import { useEffect, useId, useRef, useState } from "react"
import { parseTrainingMedia, type TrainingMedia } from "@/lib/training-media"
import {
  clampSeek,
  recordWatchPosition,
  seekLockIsCoolingDown,
  shouldCorrectSeek,
  watchedToEnd,
  type WatchProgress,
} from "@/lib/checkin-idle"
import {
  applyHtmlMediaUnmute,
  applyVimeoUnmute,
  applyYoutubeUnmute,
  htmlMediaNeedsUnmute,
  htmlMediaShouldPlay,
  logTrainingPlayback,
  shouldInvokeAutoplayUnmute,
  trainingSoundIsOn,
  vimeoUnmutedEmbedUrl,
  youtubeUnmutedPlayerVars,
} from "@/lib/training-playback"

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
  getPlayerState?: () => number
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void
  destroy?: () => void
  unMute?: () => void
  setVolume?: (volume: number) => void
  playVideo?: () => void
  isMuted?: () => boolean
}

interface VimeoPlayer {
  on: (event: string, cb: (data?: { seconds?: number }) => void) => void
  getDuration: () => Promise<number>
  getCurrentTime?: () => Promise<number>
  setCurrentTime?: (seconds: number) => Promise<number>
  destroy?: () => Promise<void>
  setMuted?: (muted: boolean) => Promise<unknown>
  setVolume?: (volume: number) => Promise<unknown>
  play?: () => Promise<unknown>
  getMuted?: () => Promise<boolean>
  getPaused?: () => Promise<boolean>
}

export type TrainingPlaybackControls = {
  unmuteAndPlay: () => Promise<void>
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
  autoPlay = true,
  unmuteLabel = "Turn on sound",
  soundOnLabel = "Sound on",
  soundOffLabel = "Sound off",
  onPlaybackReady,
}: {
  url: string
  title?: string
  onEnded: (videoSeconds: number) => void
  onDuration?: (videoSeconds: number) => void
  onPlayingChange?: (playing: boolean) => void
  autoPlay?: boolean
  unmuteLabel?: string
  soundOnLabel?: string
  soundOffLabel?: string
  onPlaybackReady?: (controls: TrainingPlaybackControls) => void
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
      autoPlay={autoPlay}
      unmuteLabel={unmuteLabel}
      soundOnLabel={soundOnLabel}
      soundOffLabel={soundOffLabel}
      onPlaybackReady={onPlaybackReady}
    />
  )
}

function ResolvedTrainingPlayer({
  media,
  title,
  onEnded,
  onDuration,
  onPlayingChange,
  autoPlay,
  unmuteLabel,
  soundOnLabel,
  soundOffLabel,
  onPlaybackReady,
}: {
  media: TrainingMedia
  title?: string
  onEnded: (videoSeconds: number) => void
  onDuration?: (videoSeconds: number) => void
  onPlayingChange?: (playing: boolean) => void
  autoPlay: boolean
  unmuteLabel: string
  soundOnLabel: string
  soundOffLabel: string
  onPlaybackReady?: (controls: TrainingPlaybackControls) => void
}) {
  const shared = {
    title,
    onEnded,
    onDuration,
    onPlayingChange,
    autoPlay,
    unmuteLabel,
    soundOnLabel,
    soundOffLabel,
    onPlaybackReady,
  }
  if (media.kind === "youtube") {
    return <YouTubePlayer videoId={media.youtubeId || ""} {...shared} />
  }
  if (media.kind === "vimeo") {
    return <VimeoPlayer embedUrl={media.embedUrl} {...shared} />
  }
  return <FilePlayer src={media.url} {...shared} />
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

function SoundPrompt({
  visible,
  label,
  onUnmute,
}: {
  visible: boolean
  label: string
  onUnmute: () => void
}) {
  if (!visible) return null
  return (
    <button
      type="button"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/55 px-4"
      onClick={onUnmute}
    >
      <span className="rounded-xl bg-white px-5 py-3 text-base font-semibold text-[#0f1a13]">{label}</span>
    </button>
  )
}

function PlaybackStatusBadge({
  unlocked,
  muted,
  playing,
  soundOnLabel,
  soundOffLabel,
  onRetryUnmute,
}: {
  unlocked: boolean
  muted: boolean
  playing: boolean
  soundOnLabel: string
  soundOffLabel: string
  onRetryUnmute: () => void
}) {
  const soundOn = trainingSoundIsOn({ unlocked, muted })
  return (
    <button
      type="button"
      data-training-sound={soundOn ? "on" : "off"}
      data-training-unlocked={unlocked ? "true" : "false"}
      data-training-muted={muted ? "true" : "false"}
      data-training-playing={playing ? "true" : "false"}
      className={`absolute left-2 top-2 z-20 rounded-md px-2 py-1 text-xs font-semibold shadow ${
        soundOn ? "bg-emerald-600 text-white" : "bg-amber-400 text-[#0f1a13]"
      }`}
      onClick={() => {
        if (!soundOn) onRetryUnmute()
      }}
      aria-live="polite"
    >
      {soundOn ? soundOnLabel : soundOffLabel}
      {playing ? " · Playing" : ""}
    </button>
  )
}

function FilePlayer({
  src,
  title,
  onEnded,
  onDuration,
  onPlayingChange,
  autoPlay,
  unmuteLabel,
  soundOnLabel,
  soundOffLabel,
  onPlaybackReady,
}: {
  src: string
  title?: string
  onEnded: (videoSeconds: number) => void
  onDuration?: (videoSeconds: number) => void
  onPlayingChange?: (playing: boolean) => void
  autoPlay: boolean
  unmuteLabel: string
  soundOnLabel: string
  soundOffLabel: string
  onPlaybackReady?: (controls: TrainingPlaybackControls) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<WatchProgress>({ maxWatched: 0 })
  const durationRef = useRef(0)
  const unlockedRef = useRef(false)
  const soundUnlockedRef = useRef(false)
  const seekLockedAtRef = useRef(0)
  const endedRef = useRef(onEnded)
  const [soundUnlocked, setSoundUnlocked] = useState(false)
  const [playerMuted, setPlayerMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  endedRef.current = onEnded

  function markUnlocked() {
    soundUnlockedRef.current = true
    setSoundUnlocked(true)
  }

  async function unmuteAndPlay() {
    markUnlocked()
    const video = videoRef.current
    if (!video) {
      logTrainingPlayback("unmute_pending", { source: "html5", unlocked: true, muted: true, playing: false })
      return
    }
    applyHtmlMediaUnmute(video)
    try {
      if (htmlMediaShouldPlay(video)) await video.play()
      const muted = htmlMediaNeedsUnmute(video)
      setPlayerMuted(muted)
      setPlaying(!video.paused)
      logTrainingPlayback("unmute_applied", {
        source: "html5",
        unlocked: true,
        muted,
        playing: !video.paused,
      })
    } catch (error) {
      setPlayerMuted(true)
      setPlaying(false)
      logTrainingPlayback("play_blocked", {
        source: "html5",
        unlocked: true,
        muted: true,
        playing: false,
        error: String(error),
      })
    }
  }

  useEffect(() => {
    onPlaybackReady?.({ unmuteAndPlay })
  }, [onPlaybackReady])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    applyHtmlMediaUnmute(video)
    if (!shouldInvokeAutoplayUnmute({ autoPlay, alreadyUnlocked: soundUnlockedRef.current, hasPlayer: true })) {
      return
    }
    if (!htmlMediaShouldPlay(video)) return
    void video.play().then(() => {
      const muted = htmlMediaNeedsUnmute(video)
      setPlayerMuted(muted)
      setPlaying(!video.paused)
      if (!muted) markUnlocked()
      logTrainingPlayback(muted ? "autoplay_muted" : "autoplay_unmuted", {
        source: "html5",
        unlocked: soundUnlockedRef.current,
        muted,
        playing: !video.paused,
      })
    }).catch((error) => {
      setPlayerMuted(true)
      setPlaying(false)
      logTrainingPlayback("autoplay_blocked", {
        source: "html5",
        unlocked: soundUnlockedRef.current,
        muted: true,
        playing: false,
        error: String(error),
      })
    })
  }, [src, autoPlay])

  function onTime(video: HTMLVideoElement) {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : durationRef.current
    durationRef.current = duration
    if (seekLockIsCoolingDown(seekLockedAtRef.current, Date.now())) return
    if (shouldCorrectSeek(progressRef.current, video.currentTime)) {
      seekLockedAtRef.current = Date.now()
      video.currentTime = clampSeek(progressRef.current, video.currentTime)
      logTrainingPlayback("seek_lock", {
        source: "html5",
        unlocked: soundUnlockedRef.current,
        muted: htmlMediaNeedsUnmute(video),
        playing: !video.paused,
        currentTime: video.currentTime,
      })
      return
    }
    recordWatchPosition(progressRef.current, video.currentTime)
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions are baked into the source video */}
      <video
        ref={videoRef}
        src={src}
        title={title || "Safety training"}
        controls
        playsInline
        className="h-full w-full"
        onLoadedMetadata={(event) => {
          applyHtmlMediaUnmute(event.currentTarget)
          const duration = event.currentTarget.duration
          if (Number.isFinite(duration) && duration > 0) {
            durationRef.current = duration
            onDuration?.(duration)
          }
        }}
        onTimeUpdate={(event) => onTime(event.currentTarget)}
        onSeeking={(event) => onTime(event.currentTarget)}
        onSeeked={(event) => onTime(event.currentTarget)}
        onPlay={(event) => {
          applyHtmlMediaUnmute(event.currentTarget)
          setPlayerMuted(htmlMediaNeedsUnmute(event.currentTarget))
          setPlaying(true)
          onPlayingChange?.(true)
        }}
        onVolumeChange={(event) => {
          setPlayerMuted(htmlMediaNeedsUnmute(event.currentTarget))
        }}
        onPause={() => {
          setPlaying(false)
          onPlayingChange?.(false)
        }}
        onEnded={(event) => {
          setPlaying(false)
          onPlayingChange?.(false)
          const duration = event.currentTarget.duration
          if (Number.isFinite(duration) && duration > 0) durationRef.current = duration
          maybeUnlock(true, progressRef.current, durationRef.current, endedRef.current, unlockedRef)
        }}
      />
      <PlaybackStatusBadge
        unlocked={soundUnlocked}
        muted={playerMuted}
        playing={playing}
        soundOnLabel={soundOnLabel}
        soundOffLabel={soundOffLabel}
        onRetryUnmute={() => void unmuteAndPlay()}
      />
      <SoundPrompt visible={!soundUnlocked} label={unmuteLabel} onUnmute={() => void unmuteAndPlay()} />
    </div>
  )
}

function YouTubePlayer({
  videoId,
  title,
  onEnded,
  onDuration,
  onPlayingChange,
  autoPlay,
  unmuteLabel,
  soundOnLabel,
  soundOffLabel,
  onPlaybackReady,
}: {
  videoId: string
  title?: string
  onEnded: (videoSeconds: number) => void
  onDuration?: (videoSeconds: number) => void
  onPlayingChange?: (playing: boolean) => void
  autoPlay: boolean
  unmuteLabel: string
  soundOnLabel: string
  soundOffLabel: string
  onPlaybackReady?: (controls: TrainingPlaybackControls) => void
}) {
  const hostId = useId()
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YtPlayer | null>(null)
  const pendingPlayRef = useRef(false)
  const endedRef = useRef(onEnded)
  const durationRef = useRef(onDuration)
  const playingRef = useRef(onPlayingChange)
  const autoPlayRef = useRef(autoPlay)
  const soundUnlockedRef = useRef(false)
  const seekLockedAtRef = useRef(0)
  endedRef.current = onEnded
  durationRef.current = onDuration
  playingRef.current = onPlayingChange
  autoPlayRef.current = autoPlay

  const progressRef = useRef<WatchProgress>({ maxWatched: 0 })
  const durationSecondsRef = useRef(0)
  const unlockedRef = useRef(false)
  const [soundUnlocked, setSoundUnlocked] = useState(false)
  const [playerMuted, setPlayerMuted] = useState(true)
  const [playing, setPlaying] = useState(false)

  function markUnlocked() {
    soundUnlockedRef.current = true
    setSoundUnlocked(true)
  }

  async function unmuteAndPlay() {
    pendingPlayRef.current = true
    markUnlocked()
    const player = playerRef.current
    if (!player) {
      logTrainingPlayback("unmute_pending", { source: "youtube", unlocked: true, muted: true, playing: false })
      return
    }
    const muted = applyYoutubeUnmute(player)
    setPlayerMuted(muted)
    logTrainingPlayback("unmute_applied", {
      source: "youtube",
      unlocked: true,
      muted,
      playing: player.getPlayerState?.() === 1,
    })
  }

  useEffect(() => {
    onPlaybackReady?.({ unmuteAndPlay })
  }, [onPlaybackReady])

  useEffect(() => {
    if (!autoPlay) return
    pendingPlayRef.current = true
    if (
      !shouldInvokeAutoplayUnmute({
        autoPlay: true,
        alreadyUnlocked: soundUnlockedRef.current,
        hasPlayer: Boolean(playerRef.current),
      })
    ) {
      return
    }
    void unmuteAndPlay()
  }, [autoPlay])

  useEffect(() => {
    let player: YtPlayer | null = null
    let cancelled = false
    let poll: number | null = null
    const host = mountRef.current
    if (!host || !videoId) return

    const lockTime = (target: YtPlayer) => {
      const state = target.getPlayerState?.()
      if (state === 3 || state === 5 || state === -1) return
      if (seekLockIsCoolingDown(seekLockedAtRef.current, Date.now())) return
      const duration = target.getDuration()
      if (Number.isFinite(duration) && duration > 0) durationSecondsRef.current = duration
      const current = typeof target.getCurrentTime === "function" ? target.getCurrentTime() : 0
      if (shouldCorrectSeek(progressRef.current, current)) {
        seekLockedAtRef.current = Date.now()
        target.seekTo?.(clampSeek(progressRef.current, current), true)
        logTrainingPlayback("seek_lock", {
          source: "youtube",
          unlocked: soundUnlockedRef.current,
          muted: target.isMuted?.() === true,
          playing: state === 1,
          currentTime: current,
        })
        return
      }
      recordWatchPosition(progressRef.current, current)
    }

    const start = () => {
      if (cancelled || !window.YT?.Player || !mountRef.current) return
      player = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: youtubeUnmutedPlayerVars(window.location.origin),
        events: {
          onReady: (event) => {
            playerRef.current = event.target
            const duration = event.target.getDuration()
            if (Number.isFinite(duration) && duration > 0) {
              durationSecondsRef.current = duration
              durationRef.current?.(duration)
            }
            if (pendingPlayRef.current || autoPlayRef.current) {
              const muted = applyYoutubeUnmute(event.target)
              setPlayerMuted(muted)
              if (!muted) markUnlocked()
              logTrainingPlayback(muted ? "ready_muted" : "ready_unmuted", {
                source: "youtube",
                unlocked: soundUnlockedRef.current,
                muted,
                playing: event.target.getPlayerState?.() === 1,
              })
            } else {
              event.target.unMute?.()
              event.target.setVolume?.(100)
              const muted = event.target.isMuted?.() === true
              setPlayerMuted(muted)
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
            if (event.data === 1) {
              playingRef.current?.(true)
              setPlaying(true)
              // Raise volume only — never playVideo() here. A PLAYING re-play
              // restarts under autoplay policy and chops audio until the next tap.
              if (soundUnlockedRef.current) {
                applyYoutubeUnmute(event.target, { play: false })
              }
              const muted = event.target.isMuted?.() === true
              setPlayerMuted(muted)
              logTrainingPlayback("playing", {
                source: "youtube",
                unlocked: soundUnlockedRef.current,
                muted,
                playing: true,
              })
            }
            if (event.data === 2) {
              setPlaying(false)
              playingRef.current?.(false)
            }
            if (event.data === ended) {
              setPlaying(false)
              playingRef.current?.(false)
              const duration = event.target.getDuration()
              if (Number.isFinite(duration) && duration > 0) durationSecondsRef.current = duration
              maybeUnlock(true, progressRef.current, durationSecondsRef.current, endedRef.current, unlockedRef)
            }
          },
        },
      })
      playerRef.current = player
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
      playerRef.current = null
      if (poll != null) window.clearInterval(poll)
      try {
        player?.destroy?.()
      } catch {
        // ignore
      }
    }
  }, [videoId, hostId])

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <div ref={mountRef} title={title || "Safety training"} className="h-full w-full" />
      <PlaybackStatusBadge
        unlocked={soundUnlocked}
        muted={playerMuted}
        playing={playing}
        soundOnLabel={soundOnLabel}
        soundOffLabel={soundOffLabel}
        onRetryUnmute={() => void unmuteAndPlay()}
      />
      <SoundPrompt visible={!soundUnlocked} label={unmuteLabel} onUnmute={() => void unmuteAndPlay()} />
    </div>
  )
}

function VimeoPlayer({
  embedUrl,
  title,
  onEnded,
  onDuration,
  onPlayingChange,
  autoPlay,
  unmuteLabel,
  soundOnLabel,
  soundOffLabel,
  onPlaybackReady,
}: {
  embedUrl: string
  title?: string
  onEnded: (videoSeconds: number) => void
  onDuration?: (videoSeconds: number) => void
  onPlayingChange?: (playing: boolean) => void
  autoPlay: boolean
  unmuteLabel: string
  soundOnLabel: string
  soundOffLabel: string
  onPlaybackReady?: (controls: TrainingPlaybackControls) => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const playerRef = useRef<VimeoPlayer | null>(null)
  const pendingPlayRef = useRef(false)
  const endedRef = useRef(onEnded)
  const durationRef = useRef(onDuration)
  const playingRef = useRef(onPlayingChange)
  const autoPlayRef = useRef(autoPlay)
  const soundUnlockedRef = useRef(false)
  const seekLockedAtRef = useRef(0)
  endedRef.current = onEnded
  durationRef.current = onDuration
  playingRef.current = onPlayingChange
  autoPlayRef.current = autoPlay

  const progressRef = useRef<WatchProgress>({ maxWatched: 0 })
  const durationSecondsRef = useRef(0)
  const unlockedRef = useRef(false)
  const [soundUnlocked, setSoundUnlocked] = useState(false)
  const [playerMuted, setPlayerMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  const playbackUrl = vimeoUnmutedEmbedUrl(embedUrl)

  function markUnlocked() {
    soundUnlockedRef.current = true
    setSoundUnlocked(true)
  }

  async function unmuteAndPlay() {
    pendingPlayRef.current = true
    markUnlocked()
    const player = playerRef.current
    if (!player) {
      logTrainingPlayback("unmute_pending", { source: "vimeo", unlocked: true, muted: true, playing: false })
      return
    }
    const muted = await applyVimeoUnmute(player)
    setPlayerMuted(muted)
    logTrainingPlayback("unmute_applied", { source: "vimeo", unlocked: true, muted, playing: true })
  }

  useEffect(() => {
    onPlaybackReady?.({ unmuteAndPlay })
  }, [onPlaybackReady])

  useEffect(() => {
    if (!autoPlay) return
    pendingPlayRef.current = true
    if (
      !shouldInvokeAutoplayUnmute({
        autoPlay: true,
        alreadyUnlocked: soundUnlockedRef.current,
        hasPlayer: Boolean(playerRef.current),
      })
    ) {
      return
    }
    void unmuteAndPlay()
  }, [autoPlay])

  useEffect(() => {
    let player: VimeoPlayer | null = null
    let cancelled = false
    void loadScript("https://player.vimeo.com/api/player.js", "vimeo-player-api")
      .then(() => {
        if (cancelled || !iframeRef.current || !window.Vimeo?.Player) return
        player = new window.Vimeo.Player(iframeRef.current)
        playerRef.current = player
        const lockTime = (seconds?: number) => {
          const apply = (current: number) => {
            if (seekLockIsCoolingDown(seekLockedAtRef.current, Date.now())) return
            if (shouldCorrectSeek(progressRef.current, current)) {
              seekLockedAtRef.current = Date.now()
              void player?.setCurrentTime?.(clampSeek(progressRef.current, current))
              logTrainingPlayback("seek_lock", {
                source: "vimeo",
                unlocked: soundUnlockedRef.current,
                muted: false,
                playing: true,
                currentTime: current,
              })
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
        player.on("play", () => {
          playingRef.current?.(true)
          setPlaying(true)
          void player?.getMuted?.().then((muted) => {
            if (soundUnlockedRef.current) {
              void applyVimeoUnmute(player!, { play: false })
            }
            setPlayerMuted(Boolean(muted))
            logTrainingPlayback("playing", {
              source: "vimeo",
              unlocked: soundUnlockedRef.current,
              muted: Boolean(muted),
              playing: true,
            })
          })
        })
        player.on("pause", () => {
          setPlaying(false)
          playingRef.current?.(false)
        })
        player.on("timeupdate", (data) => lockTime(data?.seconds))
        player.on("seeked", (data) => lockTime(data?.seconds))
        player.on("ended", () => {
          setPlaying(false)
          playingRef.current?.(false)
          player?.getDuration().then((duration) => {
            if (Number.isFinite(duration) && duration > 0) durationSecondsRef.current = duration
            maybeUnlock(true, progressRef.current, durationSecondsRef.current, endedRef.current, unlockedRef)
          })
        })
        if (pendingPlayRef.current || autoPlayRef.current) {
          void applyVimeoUnmute(player).then((muted) => {
            if (cancelled) return
            setPlayerMuted(muted)
            if (!muted) markUnlocked()
            logTrainingPlayback(muted ? "ready_muted" : "ready_unmuted", {
              source: "vimeo",
              unlocked: soundUnlockedRef.current,
              muted,
              playing: true,
            })
          })
        } else {
          void player.setMuted?.(false)
          void player.setVolume?.(1)
        }
      })
      .catch(() => {
        // The iframe still plays; completion will not unlock without the API.
      })
    return () => {
      cancelled = true
      playerRef.current = null
      void player?.destroy?.()
    }
  }, [playbackUrl])

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        ref={iframeRef}
        src={playbackUrl}
        title={title || "Safety training"}
        className="h-full w-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
      <PlaybackStatusBadge
        unlocked={soundUnlocked}
        muted={playerMuted}
        playing={playing}
        soundOnLabel={soundOnLabel}
        soundOffLabel={soundOffLabel}
        onRetryUnmute={() => void unmuteAndPlay()}
      />
      <SoundPrompt visible={!soundUnlocked} label={unmuteLabel} onUnmute={() => void unmuteAndPlay()} />
    </div>
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
            src={media.kind === "vimeo" ? vimeoUnmutedEmbedUrl(media.embedUrl) : media.embedUrl}
            title="Training preview"
            className="aspect-video w-full rounded-lg bg-black"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )
      ) : null}
    </div>
  )
}
