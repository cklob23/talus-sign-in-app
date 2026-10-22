import type { SignInIdempotencyStore, SignInRow } from "@/lib/idempotency"

export function supabaseSignInStore(admin: any, select = "*"): SignInIdempotencyStore {
  return {
    async findByIdempotencyKey(key: string) {
      const { data } = await admin.from("sign_ins").select(select).eq("idempotency_key", key).maybeSingle()
      return data
    },
    async insert(row: Record<string, unknown>) {
      const { data, error } = await admin.from("sign_ins").insert(row).select(select).single()
      return { data, error }
    },
  }
}
