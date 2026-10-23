import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { attachAndPlayCamera } from "./camera-preview.ts"

describe("camera preview attach", () => {
  it("sets srcObject and calls play before resolving", async () => {
    const stream = {} as MediaStream
    const order: string[] = []
    const video = {
      srcObject: null as MediaStream | null,
      muted: false,
      playsInline: false,
      play: async () => {
        order.push("play")
        assert.equal(video.srcObject, stream)
      },
    }
    const pending = attachAndPlayCamera(video, stream)
    order.push("started")
    await pending
    assert.deepEqual(order, ["started", "play"])
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
