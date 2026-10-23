/**
 * Shared unmute / volume helpers for the training player.
 * YouTube, Vimeo, and MP4 unlock sound on one user gesture and then stay
 * unmuted. Later PLAYING / autoPlay handlers must not call play() again —
 * that remutes under autoplay policy and makes audio gesture-tied.
 */

export const YOUTUBE_UNMUTED_PLAYER_VARS: Record<string, number | string> = {
  rel: 0,
  modestbranding: 1,
  playsinline: 1,
  mute: 0,
}

/** YouTube IFrame API PlayerState.PLAYING */
export const YOUTUBE_PLAYING_STATE = 1

export function youtubeUnmutedPlayerVars(origin?: string): Record<string, number | string> {
  return origin ? { ...YOUTUBE_UNMUTED_PLAYER_VARS, origin } : { ...YOUTUBE_UNMUTED_PLAYER_VARS }
}

/** Keep Vimeo embeds unmuted. Never add muted=1. */
export function vimeoUnmutedEmbedUrl(embedUrl: string): string {
  try {
    const url = new URL(embedUrl)
    url.searchParams.delete("mute")
    url.searchParams.set("muted", "0")
    return url.toString()
  } catch {
    return embedUrl
  }
}

export type HtmlMediaUnmuteTarget = {
  muted: boolean
  defaultMuted?: boolean
  volume: number
  paused?: boolean
}

export function applyHtmlMediaUnmute(media: HtmlMediaUnmuteTarget): void {
  media.muted = false
  if (media.defaultMuted != null) media.defaultMuted = false
  media.volume = 1
}

export function htmlMediaNeedsUnmute(media: Pick<HtmlMediaUnmuteTarget, "muted" | "volume">): boolean {
  return media.muted || media.volume === 0
}

export function htmlMediaShouldPlay(media: Pick<HtmlMediaUnmuteTarget, "paused">): boolean {
  return media.paused !== false
}

export type YoutubeUnmuteTarget = {
  unMute?: () => void
  setVolume?: (volume: number) => void
  playVideo?: () => void
  isMuted?: () => boolean
  getPlayerState?: () => number
}

export type UnmutePlayOptions = {
  /** When false, only raise volume — never restart a playing video. Default true. */
  play?: boolean
}

export function youtubePlayerIsPlaying(player: Pick<YoutubeUnmuteTarget, "getPlayerState">): boolean {
  return player.getPlayerState?.() === YOUTUBE_PLAYING_STATE
}

export function applyYoutubeUnmute(player: YoutubeUnmuteTarget, options?: UnmutePlayOptions): boolean {
  player.unMute?.()
  player.setVolume?.(100)
  const alreadyPlaying = youtubePlayerIsPlaying(player)
  if (options?.play !== false && !alreadyPlaying) {
    player.playVideo?.()
  }
  return player.isMuted?.() === true
}

export type VimeoUnmuteTarget = {
  setMuted?: (muted: boolean) => Promise<unknown>
  setVolume?: (volume: number) => Promise<unknown>
  play?: () => Promise<unknown>
  getMuted?: () => Promise<boolean>
  getPaused?: () => Promise<boolean>
}

export async function applyVimeoUnmute(player: VimeoUnmuteTarget, options?: UnmutePlayOptions): Promise<boolean> {
  await player.setMuted?.(false)
  await player.setVolume?.(1)
  let paused = true
  if (typeof player.getPaused === "function") {
    paused = await player.getPaused()
  }
  if (options?.play !== false && paused) {
    await player.play?.()
  }
  if (typeof player.getMuted === "function") {
    return (await player.getMuted()) === true
  }
  return false
}

/** After the visitor unlocks sound, autoPlay must not call play() again. */
export function shouldInvokeAutoplayUnmute(opts: {
  autoPlay: boolean
  alreadyUnlocked: boolean
  hasPlayer: boolean
}): boolean {
  return opts.autoPlay && opts.hasPlayer && !opts.alreadyUnlocked
}

export type TrainingPlaybackSource = "html5" | "youtube" | "vimeo"

export type TrainingPlaybackSnapshot = {
  source: TrainingPlaybackSource
  unlocked: boolean
  muted: boolean
  playing: boolean
}

export function trainingSoundIsOn(snapshot: Pick<TrainingPlaybackSnapshot, "unlocked" | "muted">): boolean {
  return snapshot.unlocked && !snapshot.muted
}

export function logTrainingPlayback(
  event: string,
  snapshot: TrainingPlaybackSnapshot & Record<string, unknown>,
): void {
  const { source, unlocked, muted, playing, ...rest } = snapshot
  const payload = {
    source,
    unlocked,
    muted,
    playing,
    soundOn: trainingSoundIsOn({ unlocked, muted }),
    ...rest,
  }
  console.info("[training-playback]", event, payload)
}
