import { errorToast, successToast, type AdminToastPayload } from "@/lib/admin-toast"
import { REPORT_KIND_LABELS, type ReportKind } from "@/lib/reports/types"

export function adhocSendToast(
  ok: boolean,
  body: { error?: string; rowCount?: number; recipientCount?: number } | null,
  kind: ReportKind,
  recipientFallback: number,
  networkError = false,
): AdminToastPayload {
  if (ok) {
    const recipients = body?.recipientCount ?? recipientFallback
    const rows = body?.rowCount ?? 0
    return successToast(
      "Report sent",
      `Sent ${REPORT_KIND_LABELS[kind].toLowerCase()} to ${recipients} recipients (${rows} rows).`,
    )
  }
  return errorToast(
    "Could not send report",
    networkError ? "The request did not complete." : body?.error,
    "The request did not complete.",
  )
}

export function scheduleSaveToast(ok: boolean, isEdit: boolean, error?: unknown): AdminToastPayload {
  if (ok) return successToast(isEdit ? "Schedule updated" : "Schedule saved")
  return errorToast("Could not save schedule", error)
}

export function scheduleDeleteToast(ok: boolean, error?: unknown): AdminToastPayload {
  if (ok) return successToast("Schedule deleted")
  return errorToast("Could not delete schedule", error)
}

export function scheduleSendNowToast(ok: boolean, error?: unknown): AdminToastPayload {
  if (ok) return successToast("Report sent")
  return errorToast("Could not send report", error)
}

export function scheduleToggleToast(ok: boolean, enabled: boolean, error?: unknown): AdminToastPayload {
  if (ok) return successToast(enabled ? "Schedule resumed" : "Schedule paused")
  return errorToast("Could not update schedule", error)
}

export function exportCsvFailedToast(error?: unknown): AdminToastPayload {
  return errorToast("Could not export CSV", error)
}
