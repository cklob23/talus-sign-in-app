import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildReportViewPath, buildReportViewUrl, parseReportViewSearch, REPORT_VIEW_PATH } from "./view-url.ts"

const ORIGIN = "https://signin.talusag.com"
const LOC = "11111111-1111-4111-8111-111111111111"
const TYPE = "22222222-2222-4222-8222-222222222222"

describe("report view URL", () => {
  it("builds a filter-only path and round-trips", () => {
    const path = buildReportViewPath({
      kind: "visitors",
      from: "2026-10-26T04:00:00.000Z",
      to: "2026-10-27T04:00:00.000Z",
      locationIds: [LOC],
      visitorTypeIds: [TYPE],
      durationUnit: "hours",
      timezone: "Africa/Nairobi",
      name: "Kenya farm daily",
    })
    assert.equal(path.startsWith(`${REPORT_VIEW_PATH}?`), true)
    assert.equal(path.includes("kind=visitors"), true)
    assert.equal(path.includes(LOC), true)
    assert.equal(path.includes("durationUnit=hours"), true)
    assert.equal(path.includes("tz=Africa%2FNairobi"), true)
    const parsed = parseReportViewSearch(new URL(`https://example.com${path}`).searchParams)
    assert.deepEqual(parsed, {
      kind: "visitors",
      from: "2026-10-26T04:00:00.000Z",
      to: "2026-10-27T04:00:00.000Z",
      locationIds: [LOC],
      visitorTypeIds: [TYPE],
      durationUnit: "hours",
      timezone: "Africa/Nairobi",
      name: "Kenya farm daily",
    })
  })

  it("omits default minutes and empty filters", () => {
    const path = buildReportViewPath({
      kind: "employees",
      from: "2026-10-21T05:00:00.000Z",
      to: "2026-10-22T05:00:00.000Z",
      durationUnit: "minutes",
    })
    assert.equal(path.includes("durationUnit"), false)
    assert.equal(path.includes("locations"), false)
    const parsed = parseReportViewSearch(new URLSearchParams(path.slice(path.indexOf("?") + 1)))
    assert.equal(parsed?.kind, "employees")
    assert.equal(parsed?.durationUnit, "minutes")
    assert.deepEqual(parsed?.locationIds, [])
  })

  it("rejects missing kind, bad dates, and non-UUID filters", () => {
    assert.equal(parseReportViewSearch(new URLSearchParams("from=2026-10-21T00:00:00.000Z&to=2026-10-22T00:00:00.000Z")), null)
    assert.equal(parseReportViewSearch(new URLSearchParams("kind=visitors&from=nope&to=2026-10-22T00:00:00.000Z")), null)
    assert.equal(
      parseReportViewSearch(
        new URLSearchParams("kind=visitors&from=2026-10-22T00:00:00.000Z&to=2026-10-21T00:00:00.000Z"),
      ),
      null,
    )
    const parsed = parseReportViewSearch(
      new URLSearchParams(`kind=training&from=2026-10-21T00:00:00.000Z&to=2026-10-22T00:00:00.000Z&locations=not-a-uuid,${LOC}`),
    )
    assert.deepEqual(parsed?.locationIds, [LOC])
  })

  it("keeps the URL on the app origin and drops off-origin hosts", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = ORIGIN
    try {
      const url = buildReportViewUrl(ORIGIN, {
        kind: "visitors",
        from: "2026-10-21T05:00:00.000Z",
        to: "2026-10-22T05:00:00.000Z",
        name: "Nightly visitor log",
      })
      assert.equal(url.startsWith(`${ORIGIN}${REPORT_VIEW_PATH}?`), true)
      assert.equal(url.includes("name=Nightly+visitor+log"), true)
      assert.equal(buildReportViewUrl("https://evil.example", {
        kind: "visitors",
        from: "2026-10-21T05:00:00.000Z",
        to: "2026-10-22T05:00:00.000Z",
      }), "")
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
      else process.env.NEXT_PUBLIC_SITE_URL = prev
    }
  })
})
