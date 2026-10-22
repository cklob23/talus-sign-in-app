import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  clearanceFromCompletions,
  formatClearanceMessage,
  normalizeVisitorEmail,
  getTrainingClearance,
} from "./training-clearance.ts"

const TYPE = "dddddddd-dddd-dddd-dddd-dddddddddddd"
const T0 = Date.parse("2026-10-22T12:00:00.000Z")

describe("training clearance", () => {
  it("normalizes visitor email", () => {
    assert.equal(normalizeVisitorEmail("  Diego@Example.COM "), "diego@example.com")
    assert.equal(normalizeVisitorEmail("not-an-email"), null)
    assert.equal(normalizeVisitorEmail(""), null)
  })

  it("formats the skip line with month-year expiry", () => {
    const message = formatClearanceMessage("2026-10-02T15:00:00.000Z", "2027-10-02T15:00:00.000Z", "en")
    assert.match(message, /Oct 2/)
    assert.match(message, /Oct 2027/)
    assert.match(message, /You did the safety video/)
  })

  it("treats a training_link completion as skip-without-code", () => {
    const result = clearanceFromCompletions(
      [
        {
          visitor_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          completed_at: "2026-10-02T15:00:00.000Z",
          expires_at: "2027-10-02T15:00:00.000Z",
          source: "training_link",
        },
      ],
      T0,
    )
    assert.equal(result.cleared, true)
    assert.equal(result.skipKind, "link")
    assert.match(result.message || "", /cleared until/)
  })

  it("asks a returning kiosk/QR visitor for a code", () => {
    const result = clearanceFromCompletions(
      [
        {
          visitor_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          completed_at: "2026-10-02T15:00:00.000Z",
          expires_at: "2027-10-02T15:00:00.000Z",
          source: "kiosk",
        },
      ],
      T0,
    )
    assert.equal(result.cleared, true)
    assert.equal(result.skipKind, "code")
  })

  it("treats a missing source as a returning visitor (code)", () => {
    const result = clearanceFromCompletions(
      [
        {
          visitor_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          completed_at: "2026-10-02T15:00:00.000Z",
          expires_at: null,
        },
      ],
      T0,
    )
    assert.equal(result.cleared, true)
    assert.equal(result.skipKind, "code")
  })

  it("ignores an expired completion", () => {
    const result = clearanceFromCompletions(
      [
        {
          visitor_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          completed_at: "2024-10-02T15:00:00.000Z",
          expires_at: "2025-10-02T15:00:00.000Z",
          source: "training_link",
        },
      ],
      T0,
    )
    assert.equal(result.cleared, false)
    assert.equal(result.skipKind, null)
  })

  it("prefers a still-valid link completion over an older kiosk one", () => {
    const result = clearanceFromCompletions(
      [
        {
          visitor_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          completed_at: "2026-01-01T00:00:00.000Z",
          expires_at: "2027-01-01T00:00:00.000Z",
          source: "kiosk",
        },
        {
          visitor_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          completed_at: "2026-10-02T15:00:00.000Z",
          expires_at: "2027-10-02T15:00:00.000Z",
          source: "training_link",
        },
      ],
      T0,
    )
    assert.equal(result.skipKind, "link")
  })

  it("looks up clearance by normalized email", async () => {
    const visitors = [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "Diego@Example.com" }]
    const completions = [
      {
        visitor_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        completed_at: "2026-10-02T15:00:00.000Z",
        expires_at: "2027-10-02T15:00:00.000Z",
        source: "training_link",
      },
    ]
    const admin = {
      from(table: string) {
        return {
          select() {
            return this
          },
          ilike() {
            return this
          },
          in() {
            return this
          },
          eq() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return this
          },
          then(onFulfilled: (value: unknown) => unknown) {
            const data = table === "visitors" ? visitors : completions
            return Promise.resolve({ data, error: null }).then(onFulfilled)
          },
        }
      },
    }
    const clearance = await getTrainingClearance(admin, "  diego@example.com ", TYPE, T0)
    assert.equal(clearance.cleared, true)
    assert.equal(clearance.skipKind, "link")
  })
})
