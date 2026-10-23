"use client"

import { toast } from "@/hooks/use-toast"
import { errorToast, successToast, type AdminToastPayload } from "@/lib/admin-toast"

export function showAdminToast(payload: AdminToastPayload | null | undefined) {
  if (!payload) return
  toast(payload)
}

export function notifySuccess(title: string, description?: string) {
  showAdminToast(successToast(title, description))
}

export function notifyError(title: string, error?: unknown, fallback?: string) {
  showAdminToast(errorToast(title, error, fallback))
}
