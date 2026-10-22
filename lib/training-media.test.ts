import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseTrainingMedia } from "./training-media.ts"

describe("training media URLs", () => {
  it("accepts YouTube watch, embed, and short links", () => {
    const watch = parseTrainingMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert.equal(watch?.kind, "youtube")
    assert.equal(watch?.youtubeId, "dQw4w9WgXcQ")
    const embed = parseTrainingMedia("https://www.youtube.com/embed/dQw4w9WgXcQ")
    assert.equal(embed?.kind, "youtube")
    const short = parseTrainingMedia("https://youtu.be/dQw4w9WgXcQ")
    assert.equal(short?.kind, "youtube")
  })

  it("accepts Vimeo and MP4 links", () => {
    const vimeo = parseTrainingMedia("https://vimeo.com/123456789")
    assert.equal(vimeo?.kind, "vimeo")
    assert.equal(vimeo?.vimeoId, "123456789")
    const mp4 = parseTrainingMedia("https://cdn.example.com/safety.mp4")
    assert.equal(mp4?.kind, "file")
  })

  it("rejects junk", () => {
    assert.equal(parseTrainingMedia("not a url"), null)
    assert.equal(parseTrainingMedia("ftp://files.example.com/a.mp4"), null)
    assert.equal(parseTrainingMedia(""), null)
  })
})
