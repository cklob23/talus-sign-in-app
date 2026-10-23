import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"
import {
  RECENT_ACTIVITY_DESCRIPTION,
  RECENT_ACTIVITY_EMPTY,
  combineRecentActivity,
} from "./recent-visitors.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("dashboard recent visitors", () => {
  it("includes recent signed-out people and ranks by sign-in time", () => {
    const combined = combineRecentActivity(
      [
        {
          id: "signed-out-visitor",
          sign_in_time: "2026-10-23T16:00:00.000Z",
          sign_out_time: "2026-10-23T16:40:00.000Z",
          visitor: { first_name: "Ada", last_name: "Lovelace" },
          host: { name: "Caleb" },
        },
        {
          id: "on-site-visitor",
          sign_in_time: "2026-10-23T15:00:00.000Z",
          sign_out_time: null,
          visitor: { first_name: "Grace", last_name: "Hopper" },
        },
      ],
      [
        {
          id: "signed-out-employee",
          sign_in_time: "2026-10-23T16:30:00.000Z",
          sign_out_time: "2026-10-23T16:50:00.000Z",
          profile: { full_name: "Alan Turing" },
          auto_signed_in: false,
        },
      ],
      5,
    )

    assert.deepEqual(
      combined.map((row) => row.id),
      ["signed-out-employee", "signed-out-visitor", "on-site-visitor"],
    )
    assert.equal(combined[0].on_site, false)
    assert.equal(combined[1].on_site, false)
    assert.equal(combined[2].on_site, true)
    assert.match(combined[0].subtitle, /Signed out/)
    assert.match(combined[1].subtitle, /Visited Caleb/)
  })

  it("uses accurate dashboard copy and does not filter to on-site only", () => {
    assert.equal(RECENT_ACTIVITY_DESCRIPTION, "Latest visitor and employee sign-ins")
    assert.equal(RECENT_ACTIVITY_EMPTY, "No recent visitor or employee activity")
    assert.doesNotMatch(RECENT_ACTIVITY_DESCRIPTION, /still on site/)
    assert.doesNotMatch(RECENT_ACTIVITY_EMPTY, /No recent sign-ins/)

    const src = readFileSync(join(root, "components/admin/recent-visitors.tsx"), "utf8")
    assert.match(src, /RECENT_ACTIVITY_DESCRIPTION/)
    assert.match(src, /RECENT_ACTIVITY_EMPTY/)
    assert.match(src, /combineRecentActivity/)
    assert.doesNotMatch(src, /\.is\("sign_out_time", null\)/)
    assert.doesNotMatch(src, /still on site/)
    assert.doesNotMatch(src, /No recent sign-ins/)
  })
})
