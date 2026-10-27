import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  collectNumberedPages,
  collectPages,
  explainSyncDue,
  formatNextSyncLabel,
  getNextSyncAt,
  graphPageItems,
  isSyncDue,
  mapPool,
  normalizeSchedule,
  parseSyncRequest,
  rampPageItems,
  shouldRunProvider,
  unwrapSettingValue,
} from "./schedule.ts"

describe("isSyncDue", () => {
  const now = Date.parse("2026-10-21T18:00:00.000Z")

  it("is false when the schedule is off or unknown", () => {
    assert.equal(isSyncDue("off", null, null, now), false)
    assert.equal(isSyncDue("weekly", null, null, now), false)
  })

  it("is true when never synced and the start date has passed", () => {
    assert.equal(isSyncDue("1h", null, null, now), true)
    assert.equal(isSyncDue("1h", null, "2026-10-21T12:00:00.000Z", now), true)
  })

  it("is false when the start date is still in the future", () => {
    assert.equal(isSyncDue("1h", null, "2026-10-22T00:00:00.000Z", now), false)
  })

  it("is false until the interval has elapsed", () => {
    assert.equal(isSyncDue("1h", "2026-10-21T17:30:00.000Z", null, now), false)
    assert.equal(isSyncDue("1h", "2026-10-21T16:59:00.000Z", null, now), true)
  })

  it("treats the production daily Entra case as due after missing several 4:30 PM anchors", () => {
    // Stored the way the Sync page writes them: frequency alias "daily",
    // datetime-local start (no timezone), last sync as an ET wall clock.
    // Now is Mon Oct 27, 2026 7:45 AM ET. Last run was Fri Oct 23 7:19 PM ET.
    const now = Date.parse("2026-10-27T07:45:00-04:00")
    const start = "2026-02-16T16:30"
    const last = "2026-10-23T19:19:12"

    assert.equal(normalizeSchedule("daily"), "24h")
    assert.equal(isSyncDue("daily", last, start, now), true)
    assert.equal(isSyncDue("24h", last, start, now), true)
    assert.equal(isSyncDue('"24h"', last, start, now), true)
    assert.equal(isSyncDue("24h", "2026-10-23T23:19:12.000Z", start, now), true)

    const explained = explainSyncDue("daily", last, start, now)
    assert.equal(explained.due, true)
    assert.equal(explained.reason, "due")
    assert.equal(explained.nextDueAt, "2026-10-24T20:30:00.000Z")

    const next = getNextSyncAt("daily", last, start, now)
    assert.equal(next.dueNow, true)
    assert.equal(next.at?.toISOString(), "2026-10-24T20:30:00.000Z")
    assert.match(formatNextSyncLabel("daily", last, start, now), /Overdue since/)
  })

  it("waits for the next 4:30 PM ET slot when the last daily run was yesterday evening", () => {
    const morning = Date.parse("2026-10-24T07:45:00-04:00")
    assert.equal(isSyncDue("24h", "2026-10-23T19:19:12", "2026-02-16T16:30", morning), false)
    const afterAnchor = Date.parse("2026-10-24T16:31:00-04:00")
    assert.equal(isSyncDue("24h", "2026-10-23T19:19:12", "2026-02-16T16:30", afterAnchor), true)
  })
})

describe("unwrapSettingValue / normalizeSchedule", () => {
  it("strips extra jsonb quotes and aliases daily to 24h", () => {
    assert.equal(unwrapSettingValue('"24h"'), "24h")
    assert.equal(unwrapSettingValue(" 24h "), "24h")
    assert.equal(normalizeSchedule('"daily"'), "24h")
    assert.equal(normalizeSchedule("off"), "off")
  })
})

describe("parseSyncRequest", () => {
  it("defaults to all providers and no dry run", () => {
    assert.deepEqual(
      parseSyncRequest("https://example.com/api/cron/scheduled-sync"),
      { provider: "all", dryRun: false },
    )
  })

  it("accepts provider and dryRun query flags", () => {
    assert.deepEqual(
      parseSyncRequest("https://example.com/api/cron/scheduled-sync?provider=azure&dryRun=1"),
      { provider: "azure", dryRun: true },
    )
    assert.deepEqual(
      parseSyncRequest("https://example.com/api/cron/scheduled-sync?provider=ramp&dryRun=true"),
      { provider: "ramp", dryRun: true },
    )
  })
})

describe("shouldRunProvider", () => {
  it("runs only due providers when no provider filter is set", () => {
    assert.equal(shouldRunProvider("all", "azure", true), true)
    assert.equal(shouldRunProvider("all", "ramp", false), false)
  })

  it("forces the selected provider even when it is not due", () => {
    assert.equal(shouldRunProvider("azure", "azure", false), true)
    assert.equal(shouldRunProvider("azure", "ramp", true), false)
    assert.equal(shouldRunProvider("ramp", "ramp", false), true)
    assert.equal(shouldRunProvider("ramp", "azure", true), false)
  })
})

describe("pagination helpers", () => {
  it("follows Graph @odata.nextLink across pages", async () => {
    const pages: Record<string, { value: string[]; "@odata.nextLink"?: string }> = {
      "https://graph/users?$top=2": {
        value: ["a", "b"],
        "@odata.nextLink": "https://graph/users?$skiptoken=2",
      },
      "https://graph/users?$skiptoken=2": { value: ["c"] },
    }

    const users = await collectPages("https://graph/users?$top=2", async (url) =>
      graphPageItems(pages[url]),
    )
    assert.deepEqual(users, ["a", "b", "c"])
  })

  it("follows Ramp page.next across pages", async () => {
    const pages: Record<string, { data: string[]; page: { next: string | null } }> = {
      "https://api.ramp.com/vendors?page_size=2": {
        data: ["acme", "beta"],
        page: { next: "https://api.ramp.com/vendors?start=2" },
      },
      "https://api.ramp.com/vendors?start=2": {
        data: ["gamma"],
        page: { next: null },
      },
    }

    const vendors = await collectPages("https://api.ramp.com/vendors?page_size=2", async (url) =>
      rampPageItems(pages[url]),
    )
    assert.deepEqual(vendors, ["acme", "beta", "gamma"])
  })

  it("stops numbered pages when a short page is returned", async () => {
    const pages: Record<number, string[]> = {
      1: ["a", "b"],
      2: ["c"],
    }
    const users = await collectNumberedPages(async (page) => pages[page] || [], 2)
    assert.deepEqual(users, ["a", "b", "c"])
  })
})

describe("getNextSyncAt", () => {
  const now = Date.parse("2026-10-21T18:00:00.000Z")

  it("is unscheduled when the frequency is off", () => {
    assert.deepEqual(getNextSyncAt("off", null, null, now), {
      dueNow: false,
      at: null,
      scheduled: false,
    })
    assert.equal(formatNextSyncLabel("off", null, null, now), "Not scheduled")
  })

  it("is due now when the interval has elapsed", () => {
    const next = getNextSyncAt("1h", "2026-10-21T16:59:00.000Z", null, now)
    assert.equal(next.dueNow, true)
    assert.equal(next.at?.toISOString(), "2026-10-21T17:59:00.000Z")
    assert.match(formatNextSyncLabel("1h", "2026-10-21T16:59:00.000Z", null, now), /Overdue since/)
  })

  it("returns the next clock time when the interval has not elapsed", () => {
    const next = getNextSyncAt("1h", "2026-10-21T17:30:00.000Z", null, now)
    assert.equal(next.dueNow, false)
    assert.equal(next.at?.toISOString(), "2026-10-21T18:30:00.000Z")
  })
})

describe("mapPool", () => {
  it("preserves order with concurrent workers", async () => {
    const out = await mapPool([1, 2, 3, 4], 2, async (n) => n * 10)
    assert.deepEqual(out, [10, 20, 30, 40])
  })
})
