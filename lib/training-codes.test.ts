import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  generateTrainingCode,
  hashTrainingCode,
  issueTrainingCode,
  normalizeTrainingCode,
  readTrainingCodeProof,
  verifyTrainingCode,
  verifyTrainingCodeHash,
  TRAINING_CODE_MAX_ATTEMPTS,
  TRAINING_CODE_TTL_MS,
} from "./training-codes.ts"

const SECRET = "test-secret-at-least-16-chars"
const TYPE = "dddddddd-dddd-dddd-dddd-dddddddddddd"
const T0 = 1_760_000_000_000

type Row = {
  id: string
  email_normalized: string
  visitor_type_id: string
  code_hash: string
  expires_at: string
  used_at: string | null
  attempts: number
  created_at: string
}

function memoryStore(seed: Row[] = []) {
  const rows = [...seed]
  const writes: Array<{ op: string; payload: unknown }> = []
  return {
    rows,
    writes,
    from(table: string) {
      if (table !== "training_codes") throw new Error(`unexpected table ${table}`)
      let filters: Array<(row: Row) => boolean> = []
      let payload: Record<string, unknown> = {}
      const self: Record<string, unknown> = {
        select() {
          return self
        },
        insert(value: Record<string, unknown>) {
          payload = value
          writes.push({ op: "insert", payload: value })
          const row: Row = {
            id: "11111111-1111-4111-8111-111111111111",
            email_normalized: String(value.email_normalized),
            visitor_type_id: String(value.visitor_type_id),
            code_hash: String(value.code_hash),
            expires_at: String(value.expires_at),
            used_at: (value.used_at as string | null) ?? null,
            attempts: Number(value.attempts || 0),
            created_at: new Date(T0).toISOString(),
          }
          rows.unshift(row)
          return self
        },
        update(value: Record<string, unknown>) {
          payload = value
          writes.push({ op: "update", payload: value })
          return self
        },
        eq(column: string, value: unknown) {
          filters.push((row) => (row as unknown as Record<string, unknown>)[column] === value)
          return self
        },
        gte(column: string, value: unknown) {
          filters.push((row) => String((row as unknown as Record<string, unknown>)[column]) >= String(value))
          return self
        },
        order() {
          return self
        },
        limit() {
          return self
        },
        single() {
          const row = rows[0]
          return Promise.resolve({ data: row ? { id: row.id } : null, error: null })
        },
        then(onFulfilled: (value: unknown) => unknown) {
          const data = rows.filter((row) => filters.every((fn) => fn(row)))
          if (payload && writes[writes.length - 1]?.op === "update") {
            for (const row of data) {
              Object.assign(row, payload)
            }
          }
          return Promise.resolve({ data, error: null }).then(onFulfilled)
        },
      }
      return self
    },
  }
}

describe("training codes", () => {
  it("hashes and verifies a 6 digit code", () => {
    const code = generateTrainingCode()
    assert.match(code, /^\d{6}$/)
    const stored = hashTrainingCode(code)
    assert.equal(verifyTrainingCodeHash(code, stored), true)
    assert.equal(verifyTrainingCodeHash("000000", stored), false)
    assert.equal(normalizeTrainingCode("482 913"), "482913")
    assert.equal(normalizeTrainingCode("48291"), null)
  })

  it("issues a code and verifies it once", async () => {
    const store = memoryStore()
    const issued = await issueTrainingCode(store, {
      email: "Diego@Example.com",
      visitorTypeId: TYPE,
      now: T0,
      secret: SECRET,
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) return
    const ok = await verifyTrainingCode(store, {
      email: "diego@example.com",
      visitorTypeId: TYPE,
      code: issued.issued.code,
      now: T0 + 1_000,
      secret: SECRET,
    })
    assert.equal(ok.ok, true)
    if (!ok.ok) return
    assert.equal(readTrainingCodeProof(ok.proof, { email: "diego@example.com", visitorTypeId: TYPE, now: T0 + 2_000, secret: SECRET }).ok, true)

    const reused = await verifyTrainingCode(store, {
      email: "diego@example.com",
      visitorTypeId: TYPE,
      code: issued.issued.code,
      now: T0 + 2_000,
      secret: SECRET,
    })
    assert.equal(reused.ok, false)
    if (!reused.ok) assert.equal(reused.reason, "used")
  })

  it("expires a code after 30 minutes", async () => {
    const store = memoryStore()
    const issued = await issueTrainingCode(store, {
      email: "diego@example.com",
      visitorTypeId: TYPE,
      now: T0,
      secret: SECRET,
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) return
    const expired = await verifyTrainingCode(store, {
      email: "diego@example.com",
      visitorTypeId: TYPE,
      code: issued.issued.code,
      now: T0 + TRAINING_CODE_TTL_MS + 1,
      secret: SECRET,
    })
    assert.equal(expired.ok, false)
    if (!expired.ok) assert.equal(expired.reason, "expired")
  })

  it("locks the code after too many wrong tries", async () => {
    const store = memoryStore()
    const issued = await issueTrainingCode(store, {
      email: "diego@example.com",
      visitorTypeId: TYPE,
      now: T0,
      secret: SECRET,
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) return
    let last: Awaited<ReturnType<typeof verifyTrainingCode>> | null = null
    for (let i = 0; i < TRAINING_CODE_MAX_ATTEMPTS; i += 1) {
      last = await verifyTrainingCode(store, {
        email: "diego@example.com",
        visitorTypeId: TYPE,
        code: "000000",
        now: T0 + 1_000,
        secret: SECRET,
      })
    }
    assert.equal(last?.ok, false)
    if (last && !last.ok) assert.equal(last.reason, "locked")
    const evenRight = await verifyTrainingCode(store, {
      email: "diego@example.com",
      visitorTypeId: TYPE,
      code: issued.issued.code,
      now: T0 + 2_000,
      secret: SECRET,
    })
    assert.equal(evenRight.ok, false)
    if (!evenRight.ok) assert.equal(evenRight.reason, "locked")
  })

  it("rate limits issuing more than three codes in 30 minutes", async () => {
    const store = memoryStore()
    for (let i = 0; i < 3; i += 1) {
      const issued = await issueTrainingCode(store, {
        email: "diego@example.com",
        visitorTypeId: TYPE,
        now: T0 + i,
        secret: SECRET,
      })
      assert.equal(issued.ok, true)
    }
    const blocked = await issueTrainingCode(store, {
      email: "diego@example.com",
      visitorTypeId: TYPE,
      now: T0 + 10,
      secret: SECRET,
    })
    assert.equal(blocked.ok, false)
    if (!blocked.ok) assert.equal(blocked.reason, "rate_limited")
  })
})
