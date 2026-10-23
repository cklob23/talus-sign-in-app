import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { adhocPeriodLabel, adhocScheduleName, adhocWindow, parseAdhocSendBody } from "./send.ts"

describe("parseAdhocSendBody", () => {
  const base = {
    kind: "visitors",
    period: "all",
    timezone: "America/New_York",
    recipients: ["caleb@talusag.com", "ops@partner.com"],
    format: "both",
  }

  it("accepts any valid email and keeps the current filters", () => {
    const parsed = parseAdhocSendBody(base)
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.equal(parsed.value.kind, "visitors")
    assert.equal(parsed.value.period, "all")
    assert.deepEqual(parsed.value.recipients, ["caleb@talusag.com", "ops@partner.com"])
    assert.equal(parsed.value.durationUnit, "minutes")
    assert.equal(adhocScheduleName("visitors"), "Ad-hoc visitor sign-ins")
    assert.equal(adhocPeriodLabel(parsed.value), "All time")
  })

  it("rejects invalid recipients, empty lists, and inverted custom dates", () => {
    assert.equal(parseAdhocSendBody({ ...base, recipients: [] }).ok, false)
    assert.equal(parseAdhocSendBody({ ...base, recipients: ["not-an-email"] }).ok, false)
    assert.equal(parseAdhocSendBody({ ...base, period: "custom", customStart: "2026-10-20", customEnd: "2026-10-10" }).ok, false)
    assert.equal(parseAdhocSendBody({ ...base, period: "custom", customStart: "2026-10-10", customEnd: "2026-10-20" }).ok, true)
    assert.equal(parseAdhocSendBody({ ...base, timezone: "Not/AZone" }).ok, false)
    assert.equal(parseAdhocSendBody({ ...base, durationUnit: "hours" }).ok, true)
    assert.equal(parseAdhocSendBody({ ...base, durationUnit: "days" }).ok, false)
  })

  it("resolves all-time and custom windows from the send payload", () => {
    const now = new Date("2026-10-22T18:00:00.000Z")
    const all = parseAdhocSendBody(base)
    assert.equal(all.ok, true)
    if (!all.ok) return
    const allWindow = adhocWindow(all.value, now)
    assert.equal(allWindow.start.toISOString(), "1970-01-01T00:00:00.000Z")
    assert.equal(allWindow.end.toISOString(), now.toISOString())

    const custom = parseAdhocSendBody({
      ...base,
      period: "custom",
      customStart: "2026-03-08",
      customEnd: "2026-03-08",
      timezone: "America/Chicago",
    })
    assert.equal(custom.ok, true)
    if (!custom.ok) return
    const customWindow = adhocWindow(custom.value, now)
    assert.equal(customWindow.start.toISOString(), "2026-03-08T06:00:00.000Z")
    assert.equal(customWindow.end.toISOString(), "2026-03-09T05:00:00.000Z")
  })
})
