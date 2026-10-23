import { isUndefinedColumn } from "@/lib/idempotency"

export const SIGN_OUT_SOURCES = ["manual", "auto"] as const
export type SignOutSource = (typeof SIGN_OUT_SOURCES)[number]

export const SIGN_OUT_SOURCE_LABELS: Record<SignOutSource, string> = {
  manual: "Manual",
  auto: "Auto",
}

export function isSignOutSource(value: unknown): value is SignOutSource {
  return value === "manual" || value === "auto"
}

export function signOutSourceLabel(value: unknown): string {
  if (isSignOutSource(value)) return SIGN_OUT_SOURCE_LABELS[value]
  return ""
}

export function signOutUpdatePayload(source: SignOutSource, at: string): {
  sign_out_time: string
  sign_out_source: SignOutSource
} {
  return { sign_out_time: at, sign_out_source: source }
}

export async function applySignOut<T extends { error: { code?: string; message?: string } | null }>(
  apply: (payload: Record<string, unknown>) => PromiseLike<T>,
  source: SignOutSource,
  at: string,
): Promise<T> {
  const first = await apply(signOutUpdatePayload(source, at))
  if (first.error && isUndefinedColumn(first.error)) {
    return apply({ sign_out_time: at })
  }
  return first
}
