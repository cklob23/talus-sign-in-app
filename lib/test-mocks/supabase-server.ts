export type MockWrite = { table: string; op: string; payload: unknown }

export const writes: MockWrite[] = []

const VISITOR_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const SIGN_IN_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"

function rowFor(table: string, payload: unknown) {
  if (table === "visitors") {
    return { id: VISITOR_ID, ...(payload && typeof payload === "object" ? payload : {}) }
  }
  if (table === "sign_ins") {
    return {
      id: SIGN_IN_ID,
      host_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      location_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      ...(payload && typeof payload === "object" ? payload : {}),
    }
  }
  if (table === "training_completions") {
    return { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", ...(payload && typeof payload === "object" ? payload : {}) }
  }
  return { id: SIGN_IN_ID, ...(payload && typeof payload === "object" ? payload : {}) }
}

function createChain(table: string) {
  let lastPayload: unknown = {}
  const result = () => ({ data: rowFor(table, lastPayload), error: null })
  const self: Record<string, unknown> = {
    insert(payload: unknown) {
      lastPayload = payload
      writes.push({ table, op: "insert", payload })
      return self
    },
    update(payload: unknown) {
      lastPayload = payload
      writes.push({ table, op: "update", payload })
      return self
    },
    select() {
      return self
    },
    eq() {
      return self
    },
    is() {
      return self
    },
    in() {
      return self
    },
    order() {
      return self
    },
    limit() {
      return self
    },
    maybeSingle() {
      return Promise.resolve(result())
    },
    single() {
      return Promise.resolve(result())
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      const row = result().data
      return Promise.resolve({ data: [row], error: null }).then(onFulfilled, onRejected)
    },
  }
  return self
}

export function resetWrites() {
  writes.length = 0
}

export function getAdminClient() {
  return {
    from(table: string) {
      return createChain(table)
    },
  }
}

export const createAdminClient = getAdminClient

export async function createClient() {
  return getAdminClient()
}
