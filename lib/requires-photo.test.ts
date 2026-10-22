import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  fetchVisitorTypesWithPhoto,
  typeRequiresPhoto,
  VISITOR_TYPE_SELECT_WITH_PHOTO,
  VISITOR_TYPE_SELECT_WITHOUT_PHOTO,
} from "./requires-photo.ts"

describe("typeRequiresPhoto", () => {
  it("defaults to required when the column is missing or null", () => {
    assert.equal(typeRequiresPhoto(null), true)
    assert.equal(typeRequiresPhoto({}), true)
    assert.equal(typeRequiresPhoto({ requires_photo: null }), true)
    assert.equal(typeRequiresPhoto({ requires_photo: true }), true)
  })

  it("honours an explicit off switch", () => {
    assert.equal(typeRequiresPhoto({ requires_photo: false }), false)
  })
})

describe("fetchVisitorTypesWithPhoto", () => {
  it("retries without the column on Postgres 42703", async () => {
    const columns: string[] = []
    const result = await fetchVisitorTypesWithPhoto(async (selected) => {
      columns.push(selected)
      if (selected === VISITOR_TYPE_SELECT_WITH_PHOTO) {
        return { data: null, error: { code: "42703", message: "column visitor_types.requires_photo does not exist" } }
      }
      return {
        data: [
          {
            id: "t1",
            name: "Contractor",
            badge_color: "#00854c",
            requires_host: true,
            requires_company: true,
            requires_training: true,
            requires_nda: false,
            training_title: null,
            training_video_url: null,
          },
        ],
        error: null,
      }
    })

    assert.deepEqual(columns, [VISITOR_TYPE_SELECT_WITH_PHOTO, VISITOR_TYPE_SELECT_WITHOUT_PHOTO])
    assert.equal(result.error, null)
    assert.equal(result.data[0]?.requires_photo, true)
  })
})
