import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  claimNotificationOnce,
  createSignInIdempotent,
  parseIdempotencyKey,
  PG_UNDEFINED_COLUMN,
  PG_UNDEFINED_TABLE,
  PG_UNIQUE_VIOLATION,
  type NotificationClaim,
  type SignInIdempotencyStore,
  type SignInRow,
} from "./idempotency.ts"

const KEY = "11111111-1111-4111-8111-111111111111"

function memorySignInStore(seed: SignInRow[] = []): SignInIdempotencyStore & { inserts: number } {
  const rows = [...seed]
  const store: SignInIdempotencyStore & { inserts: number } = {
    inserts: 0,
    async findByIdempotencyKey(key) {
      return rows.find((row) => row.idempotency_key === key) ?? null
    },
    async insert(row) {
      const key = typeof row.idempotency_key === "string" ? row.idempotency_key : null
      if (key && rows.some((existing) => existing.idempotency_key === key)) {
        return { data: null, error: { code: PG_UNIQUE_VIOLATION, message: "duplicate key" } }
      }
      store.inserts += 1
      const created: SignInRow = { id: `sign-in-${store.inserts}`, ...row }
      rows.push(created)
      return { data: created, error: null }
    },
  }
  return store
}

describe("parseIdempotencyKey", () => {
  it("accepts a UUID and rejects junk", () => {
    assert.equal(parseIdempotencyKey(KEY), KEY)
    assert.equal(parseIdempotencyKey(""), null)
    assert.equal(parseIdempotencyKey(null), null)
    assert.equal(parseIdempotencyKey("not-a-uuid"), undefined)
  })
})

describe("createSignInIdempotent", () => {
  it("returns the same row when the key is repeated", async () => {
    const store = memorySignInStore()
    const first = await createSignInIdempotent(store, {
      visitor_id: "v1",
      location_id: "loc1",
      idempotency_key: KEY,
    })
    const second = await createSignInIdempotent(store, {
      visitor_id: "v1",
      location_id: "loc1",
      idempotency_key: KEY,
    })

    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    if (!first.ok || !second.ok) return
    assert.equal(first.replayed, false)
    assert.equal(second.replayed, true)
    assert.equal(first.signIn.id, second.signIn.id)
    assert.equal(store.inserts, 1)
  })

  it("treats a unique-violation race as a replay of the existing row", async () => {
    const existing: SignInRow = { id: "already-there", idempotency_key: KEY }
    let finds = 0
    const store: SignInIdempotencyStore = {
      async findByIdempotencyKey() {
        finds += 1
        return finds === 1 ? null : existing
      },
      async insert() {
        return { data: null, error: { code: PG_UNIQUE_VIOLATION, message: "duplicate key" } }
      },
    }

    const result = await createSignInIdempotent(store, { idempotency_key: KEY })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.replayed, true)
    assert.equal(result.signIn.id, "already-there")
  })

  it("retries without the key when the column is missing", async () => {
    let attempts = 0
    const store: SignInIdempotencyStore = {
      async findByIdempotencyKey() {
        return null
      },
      async insert(row) {
        attempts += 1
        if ("idempotency_key" in row) {
          return { data: null, error: { code: PG_UNDEFINED_COLUMN, message: "column idempotency_key does not exist" } }
        }
        return { data: { id: "legacy-row", ...row }, error: null }
      },
    }

    const result = await createSignInIdempotent(store, { visitor_id: "v1", idempotency_key: KEY })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.replayed, false)
    assert.equal(result.signIn.id, "legacy-row")
    assert.equal(attempts, 2)
  })
})

describe("claimNotificationOnce", () => {
  it("sends one email for a repeated sign-in id and type", async () => {
    const claims: NotificationClaim[] = []
    const store = {
      async findExisting(claim: NotificationClaim) {
        return claims.some(
          (row) =>
            (claim.signInId && row.signInId === claim.signInId && row.notificationType === claim.notificationType) ||
            (claim.idempotencyKey && row.idempotencyKey === claim.idempotencyKey),
        )
      },
      async insert(claim: NotificationClaim) {
        if (await store.findExisting(claim)) {
          return { error: { code: PG_UNIQUE_VIOLATION, message: "duplicate key" } }
        }
        claims.push(claim)
        return { error: null }
      },
    }

    const emails: string[] = []
    async function sendOnce(signInId: string) {
      const claim = await claimNotificationOnce(store, {
        signInId,
        notificationType: "arrived",
        idempotencyKey: KEY,
      })
      if (claim === "duplicate") return
      emails.push(signInId)
    }

    await sendOnce("sign-1")
    await sendOnce("sign-1")
    assert.deepEqual(emails, ["sign-1"])
    assert.equal(claims.length, 1)
  })

  it("allows a send when the notifications table is not created yet", async () => {
    const store = {
      async findExisting() {
        return false
      },
      async insert() {
        return { error: { code: PG_UNDEFINED_TABLE, message: "relation host_notifications does not exist" } }
      },
    }

    const result = await claimNotificationOnce(store, {
      signInId: "sign-1",
      notificationType: "arrived",
    })
    assert.equal(result, "claimed")
  })
})
