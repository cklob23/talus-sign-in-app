import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  collectNumberedPages,
  collectPages,
  formatNextSyncLabel,
  getNextSyncAt,
  graphPageItems,
  isSyncDue,
  mapPool,
  parseSyncRequest,
  rampPageItems,
  shouldRunProvider,
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
    assert.equal(formatNextSyncLabel("1h", "2026-10-21T16:59:00.000Z", null, now), "Due on the next hourly cron")
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
