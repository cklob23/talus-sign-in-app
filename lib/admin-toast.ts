export const DEFAULT_TOAST_ERROR = "Try again in a moment."
export const DEFAULT_TOAST_DURATION_MS = 5000

export type AdminToastPayload = {
  variant?: "destructive"
  title: string
  description?: string
  duration?: number
}

export function safeToastError(error: unknown, fallback = DEFAULT_TOAST_ERROR): string {
  if (typeof error === "string" && error.trim()) return error.trim()
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (error && typeof error === "object") {
    const record = error as { error?: unknown; message?: unknown }
    if (typeof record.error === "string" && record.error.trim()) return record.error.trim()
    if (typeof record.message === "string" && record.message.trim()) return record.message.trim()
  }
  return fallback
}

export function successToast(title: string, description?: string): AdminToastPayload {
  return {
    title,
    description,
    duration: DEFAULT_TOAST_DURATION_MS,
  }
}

export function errorToast(title: string, error?: unknown, fallback?: string): AdminToastPayload {
  return {
    variant: "destructive",
    title,
    description: safeToastError(error, fallback),
    duration: DEFAULT_TOAST_DURATION_MS,
  }
}
