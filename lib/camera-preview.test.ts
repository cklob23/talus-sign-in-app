import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { attachAndPlayCamera } from "./camera-preview.ts"

describe("camera preview attach", () => {
  it("sets srcObject and calls play before resolving", async () => {
    const stream = {} as MediaStream
    let played = false
    const video = {
      srcObject: null as MediaStream | null,
      muted: false,
      playsInline: false,
      play: async () => {
        played = true
        assert.equal(video.srcObject, stream)
      },
    }
    await attachAndPlayCamera(video, stream)
    assert.equal(played, true)
    assert.equal(video.srcObject, stream)
    assert.equal(video.muted, true)
    assert.equal(video.playsInline, true)
  })

  it("rejects when play fails so the UI can keep Starting camera", async () => {
    const video = {
      srcObject: null as MediaStream | null,
      muted: false,
      playsInline: false,
      play: async () => {
        throw new Error("play blocked")
      },
    }
    await assert.rejects(() => attachAndPlayCamera(video, {} as MediaStream), /play blocked/)
    assert.equal(video.srcObject != null, true)
  })
})
