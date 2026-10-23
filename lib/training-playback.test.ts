import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applyHtmlMediaUnmute,
  applyVimeoUnmute,
  applyYoutubeUnmute,
  htmlMediaNeedsUnmute,
  htmlMediaShouldPlay,
  shouldInvokeAutoplayUnmute,
  trainingSoundIsOn,
  vimeoUnmutedEmbedUrl,
  youtubePlayerIsPlaying,
  youtubeUnmutedPlayerVars,
  YOUTUBE_PLAYING_STATE,
} from "./training-playback.ts"

describe("training playback sound", () => {
  it("asks YouTube for an unmuted player on every platform", () => {
    const vars = youtubeUnmutedPlayerVars("https://signin.talusag.com")
    assert.equal(vars.mute, 0)
    assert.equal(vars.playsinline, 1)
    assert.equal(vars.origin, "https://signin.talusag.com")
    assert.equal("autoplay" in vars, false)
  })

  it("forces Vimeo embeds off mute even if the source URL asked for it", () => {
    const url = vimeoUnmutedEmbedUrl("https://player.vimeo.com/video/123456789?api=1&muted=1&mute=1")
    const parsed = new URL(url)
    assert.equal(parsed.searchParams.get("muted"), "0")
    assert.equal(parsed.searchParams.get("mute"), null)
  })

  it("clears HTML media mute and zero volume", () => {
    const media = { muted: true, defaultMuted: true, volume: 0, paused: true }
    assert.equal(htmlMediaNeedsUnmute(media), true)
    assert.equal(htmlMediaShouldPlay(media), true)
    applyHtmlMediaUnmute(media)
    assert.equal(media.muted, false)
    assert.equal(media.defaultMuted, false)
    assert.equal(media.volume, 1)
    assert.equal(htmlMediaNeedsUnmute(media), false)
    assert.equal(htmlMediaShouldPlay({ paused: false }), false)
  })

  it("unmutes a YouTube player and starts playback", () => {
    const calls: string[] = []
    let muted = true
    const stillMuted = applyYoutubeUnmute({
      unMute: () => {
        muted = false
        calls.push("unMute")
      },
      setVolume: (volume) => {
        assert.equal(volume, 100)
        calls.push("setVolume")
      },
      playVideo: () => {
        calls.push("playVideo")
      },
      isMuted: () => muted,
    })
    assert.deepEqual(calls, ["unMute", "setVolume", "playVideo"])
    assert.equal(stillMuted, false)
  })

  it("does not restart a YouTube video that is already playing", () => {
    const calls: string[] = []
    applyYoutubeUnmute({
      unMute: () => calls.push("unMute"),
      setVolume: () => calls.push("setVolume"),
      playVideo: () => calls.push("playVideo"),
      isMuted: () => false,
      getPlayerState: () => YOUTUBE_PLAYING_STATE,
    })
    assert.deepEqual(calls, ["unMute", "setVolume"])
    assert.equal(
      youtubePlayerIsPlaying({ getPlayerState: () => YOUTUBE_PLAYING_STATE }),
      true,
    )
  })

  it("can raise YouTube volume without calling playVideo", () => {
    const calls: string[] = []
    applyYoutubeUnmute({
      unMute: () => calls.push("unMute"),
      setVolume: () => calls.push("setVolume"),
      playVideo: () => calls.push("playVideo"),
      isMuted: () => false,
    }, { play: false })
    assert.deepEqual(calls, ["unMute", "setVolume"])
  })

  it("unmutes a Vimeo player and starts playback", async () => {
    const calls: string[] = []
    let muted = true
    const stillMuted = await applyVimeoUnmute({
      setMuted: async (value) => {
        muted = value
        calls.push("setMuted")
      },
      setVolume: async (volume) => {
        assert.equal(volume, 1)
        calls.push("setVolume")
      },
      play: async () => {
        calls.push("play")
      },
      getMuted: async () => muted,
    })
    assert.deepEqual(calls, ["setMuted", "setVolume", "play"])
    assert.equal(stillMuted, false)
  })

  it("does not re-call Vimeo play when the player is already playing", async () => {
    const calls: string[] = []
    await applyVimeoUnmute({
      setMuted: async () => calls.push("setMuted"),
      setVolume: async () => calls.push("setVolume"),
      play: async () => calls.push("play"),
      getMuted: async () => false,
      getPaused: async () => false,
    })
    assert.deepEqual(calls, ["setMuted", "setVolume"])
  })

  it("can raise Vimeo volume without calling play", async () => {
    const calls: string[] = []
    await applyVimeoUnmute({
      setMuted: async () => calls.push("setMuted"),
      setVolume: async () => calls.push("setVolume"),
      play: async () => calls.push("play"),
      getMuted: async () => false,
    }, { play: false })
    assert.deepEqual(calls, ["setMuted", "setVolume"])
  })

  it("skips a second autoplay unmute after the visitor already unlocked sound", () => {
    assert.equal(
      shouldInvokeAutoplayUnmute({ autoPlay: true, alreadyUnlocked: true, hasPlayer: true }),
      false,
    )
    assert.equal(
      shouldInvokeAutoplayUnmute({ autoPlay: true, alreadyUnlocked: false, hasPlayer: true }),
      true,
    )
    assert.equal(
      shouldInvokeAutoplayUnmute({ autoPlay: true, alreadyUnlocked: false, hasPlayer: false }),
      false,
    )
    assert.equal(
      shouldInvokeAutoplayUnmute({ autoPlay: false, alreadyUnlocked: false, hasPlayer: true }),
      false,
    )
  })

  it("treats sound as on only after a gesture unlock that is not muted", () => {
    assert.equal(trainingSoundIsOn({ unlocked: true, muted: false }), true)
    assert.equal(trainingSoundIsOn({ unlocked: true, muted: true }), false)
    assert.equal(trainingSoundIsOn({ unlocked: false, muted: false }), false)
  })
})
