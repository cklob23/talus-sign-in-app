import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it, beforeEach } from "node:test"
import {
  HISTORY_SOURCE_COLUMN_HEADER,
  buildHistoryEmployeeCsvRows,
  buildHistoryVisitorCsvRows,
  clearHistoryCache,
  historyCsvText,
  historySiteStamp,
  isHistoryListPending,
  readHistoryCache,
  runHistoryListLoads,
  writeHistoryCache,
} from "./admin-history.ts"
import { formatSiteDateTime } from "./timezone.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("admin history source column", () => {
  it("labels the source column Source, not Sign-out", () => {
    assert.equal(HISTORY_SOURCE_COLUMN_HEADER, "Source")
    const src = readFileSync(join(root, "components/admin/history-content.tsx"), "utf8")
    assert.equal((src.match(/<TableHead>\{HISTORY_SOURCE_COLUMN_HEADER\}<\/TableHead>/g) || []).length, 2)
    assert.doesNotMatch(src, /<TableHead>Sign-out<\/TableHead>/)
    assert.doesNotMatch(src, /<TableHead>Sign out<\/TableHead>/)
    assert.match(src, /runHistoryListLoads/)
    assert.match(src, /isHistoryListPending\(visitorsSettled\)/)
    assert.match(src, /isHistoryListPending\(employeesSettled\)/)
    assert.match(src, /historySiteStamp/)
    assert.match(src, /historySiteZone\(location\)/)
    assert.match(src, /formatHistoryTime\(signIn\.sign_in_time, signIn\.location\)/)
    assert.match(src, /formatHistoryTime\(signIn\.sign_out_time, signIn\.location\)/)
    assert.doesNotMatch(src, /useTimezone/)
    assert.doesNotMatch(src, /userTimezone/)
    assert.doesNotMatch(src, /formatDateTimeLocal/)
  })
})

describe("admin history site timezone stamps", () => {
  it("formats visitor and employee CSV times in the sign-in site timezone", () => {
    const inAt = "2026-10-22T15:30:00.000Z"
    const outAt = "2026-10-22T17:00:00.000Z"
    const visitors = buildHistoryVisitorCsvRows([
      {
        sign_in_time: inAt,
        sign_out_time: outAt,
        sign_out_source: "manual",
        visitor: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com", company: "Analytical" },
        visitor_type: { name: "Contractor" },
        location: { name: "Kenya Farm", timezone: "Africa/Nairobi" },
        host: { name: "Hiro Iwanaga" },
      },
    ])
    const kenyaIn = formatSiteDateTime(inAt, "Africa/Nairobi")
    const kenyaOut = formatSiteDateTime(outAt, "Africa/Nairobi")
    assert.equal(visitors[1][6], kenyaIn)
    assert.equal(visitors[1][7], kenyaOut)
    assert.match(visitors[1][6], /EAT|GMT\+3/)
    assert.match(visitors[1][7], /EAT|GMT\+3/)
    assert.equal(visitors[1][6].includes("EDT"), false)
    assert.equal(historySiteStamp(inAt, "Africa/Nairobi"), kenyaIn)

    const employees = buildHistoryEmployeeCsvRows([
      {
        sign_in_time: inAt,
        sign_out_time: outAt,
        auto_signed_in: true,
        profile: { full_name: "Caleb Klobe", email: "caleb@talusag.com", role: "admin" },
        location: { name: "Houston HQ", timezone: "America/Chicago" },
      },
    ])
    assert.equal(employees[1][4], formatSiteDateTime(inAt, "America/Chicago"))
    assert.equal(employees[1][5], formatSiteDateTime(outAt, "America/Chicago"))
    assert.match(employees[1][4], /CDT/)

    const missingZone = buildHistoryVisitorCsvRows([
      {
        sign_in_time: "2026-01-15T18:00:00.000Z",
        sign_out_time: null,
        visitor: { first_name: "No", last_name: "Zone" },
        location: { name: "Unset Site", timezone: "" },
      },
    ])
    assert.equal(missingZone[1][6], formatSiteDateTime("2026-01-15T18:00:00.000Z", null))
    assert.match(missingZone[1][6], /EST/)
    assert.equal(missingZone[1][7], "")

    const csv = historyCsvText(visitors)
    assert.match(csv, /"Kenya Farm"/)
    assert.match(csv, /EAT|GMT\+3/)
  })
})

describe("admin history first-load race", () => {
  beforeEach(() => {
    clearHistoryCache()
  })

  it("paints a list as soon as it settles, including from cache", () => {
    assert.equal(isHistoryListPending(false), true)
    assert.equal(isHistoryListPending(true), false)
    writeHistoryCache({ visitors: [{ id: "v1" }], employees: [] })
    assert.ok(readHistoryCache())
    assert.equal(isHistoryListPending(readHistoryCache() != null), false)
  })

  it("starts both list fetches before either settles and reports visitors first", async () => {
    let started = 0
    let releaseVisitors!: () => void
    let releaseEmployees!: () => void
    const visitorsGate = new Promise<void>((resolve) => {
      releaseVisitors = resolve
    })
    const employeesGate = new Promise<void>((resolve) => {
      releaseEmployees = resolve
    })
    let visitorsPainted!: () => void
    const visitorsReady = new Promise<void>((resolve) => {
      visitorsPainted = resolve
    })
    const order: string[] = []

    const done = runHistoryListLoads({
      visitors: async () => {
        started += 1
        await visitorsGate
        return [{ id: "v1" }]
      },
      employees: async () => {
        started += 1
        await employeesGate
        return [{ id: "e1" }]
      },
      onVisitors: () => {
        order.push("visitors")
        visitorsPainted()
      },
      onEmployees: () => {
        order.push("employees")
      },
    })

    assert.equal(started, 2, "both list requests must start in the same tick")

    releaseVisitors()
    await visitorsReady
    assert.deepEqual(order, ["visitors"])
    assert.equal(isHistoryListPending(true), false)

    releaseEmployees()
    const result = await done
    assert.deepEqual(result, { visitors: [{ id: "v1" }], employees: [{ id: "e1" }] })
    assert.deepEqual(order, ["visitors", "employees"])
    assert.equal(readHistoryCache()?.visitors.length, 1)
  })

  it("does not wait to clear a list when the other request fails", async () => {
    const seen: string[] = []
    await assert.rejects(
      () =>
        runHistoryListLoads({
          visitors: async () => {
            seen.push("visitors")
            return [{ id: "v1" }]
          },
          employees: async () => {
            seen.push("employees")
            throw new Error("employee list failed")
          },
          onVisitors: () => {
            seen.push("visitors-ready")
          },
        }),
      /employee list failed/,
    )
    assert.ok(seen.includes("visitors"))
    assert.ok(seen.includes("employees"))
    assert.ok(seen.includes("visitors-ready"))
    assert.equal(readHistoryCache()?.visitors.length, 1)
  })

  it("reuses cache so a remount does not sit on Loading after a successful fetch", () => {
    writeHistoryCache({ visitors: [{ id: "cached" }], employees: [{ id: "e" }] })
    const cached = readHistoryCache<{ id: string }, { id: string }>()
    assert.equal(isHistoryListPending(cached != null), false)
    assert.equal(cached?.visitors[0].id, "cached")
  })
})
