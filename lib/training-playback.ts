/**
 * Shared unmute / volume helpers for the training player.
 * YouTube, Vimeo, and MP4 all start with explicit sound on desktop and mobile.
 */

export const YOUTUBE_UNMUTED_PLAYER_VARS: Record<string, number | string> = {
  rel: 0,
  modestbranding: 1,
  playsinline: 1,
  mute: 0,
}

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
}

export function applyHtmlMediaUnmute(media: HtmlMediaUnmuteTarget): void {
  media.muted = false
  if (media.defaultMuted != null) media.defaultMuted = false
  media.volume = 1
}

export function htmlMediaNeedsUnmute(media: Pick<HtmlMediaUnmuteTarget, "muted" | "volume">): boolean {
  return media.muted || media.volume === 0
}

export type YoutubeUnmuteTarget = {
  unMute?: () => void
  setVolume?: (volume: number) => void
  playVideo?: () => void
  isMuted?: () => boolean
}

export function applyYoutubeUnmute(player: YoutubeUnmuteTarget): boolean {
  player.unMute?.()
  player.setVolume?.(100)
  player.playVideo?.()
  return player.isMuted?.() === true
}

export type VimeoUnmuteTarget = {
  setMuted?: (muted: boolean) => Promise<unknown>
  setVolume?: (volume: number) => Promise<unknown>
  play?: () => Promise<unknown>
  getMuted?: () => Promise<boolean>
}

export async function applyVimeoUnmute(player: VimeoUnmuteTarget): Promise<boolean> {
  await player.setMuted?.(false)
  await player.setVolume?.(1)
  await player.play?.()
  if (typeof player.getMuted === "function") {
    return (await player.getMuted()) === true
  }
  return false
}
