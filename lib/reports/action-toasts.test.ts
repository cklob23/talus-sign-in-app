import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { DEFAULT_TOAST_ERROR } from "../admin-toast.ts"
import {
  adhocSendToast,
  exportCsvFailedToast,
  scheduleDeleteToast,
  scheduleSaveToast,
  scheduleSendNowToast,
  scheduleToggleToast,
} from "./action-toasts.ts"

function assertToast(
  payload: { variant?: string; title: string; description?: string },
  expected: { variant?: string; title: string; description?: string },
) {
  assert.equal(payload.title, expected.title)
  assert.equal(payload.description, expected.description)
  assert.equal(payload.variant, expected.variant)
}

describe("reports action toasts", () => {
  it("toasts ad-hoc send success and request-level failures", () => {
    assertToast(adhocSendToast(true, { recipientCount: 2, rowCount: 18 }, "visitors", 2), {
      title: "Report sent",
      description: "Sent visitor sign-ins to 2 recipients (18 rows).",
    })

    assertToast(adhocSendToast(false, { error: "No data for this period" }, "employees", 1), {
      variant: "destructive",
      title: "Could not send report",
      description: "No data for this period",
    })

    assertToast(adhocSendToast(false, null, "training", 1, true), {
      variant: "destructive",
      title: "Could not send report",
      description: "The request did not complete.",
    })
  })

  it("toasts schedule create, update, and save failures", () => {
    assertToast(scheduleSaveToast(true, false), { title: "Schedule saved" })
    assertToast(scheduleSaveToast(true, true), { title: "Schedule updated" })
    assertToast(scheduleSaveToast(false, false, "Name is required"), {
      variant: "destructive",
      title: "Could not save schedule",
      description: "Name is required",
    })
  })

  it("toasts send now, delete, and pause or resume", () => {
    assertToast(scheduleSendNowToast(true), { title: "Report sent" })
    assertToast(scheduleSendNowToast(false, { error: "SMTP is not configured" }), {
      variant: "destructive",
      title: "Could not send report",
      description: "SMTP is not configured",
    })

    assertToast(scheduleDeleteToast(true), { title: "Schedule deleted" })
    assertToast(scheduleDeleteToast(false), {
      variant: "destructive",
      title: "Could not delete schedule",
      description: DEFAULT_TOAST_ERROR,
    })

    assertToast(scheduleToggleToast(true, false), { title: "Schedule paused" })
    assertToast(scheduleToggleToast(true, true), { title: "Schedule resumed" })
    assertToast(scheduleToggleToast(false, true, "Could not update schedule"), {
      variant: "destructive",
      title: "Could not update schedule",
      description: "Could not update schedule",
    })
  })

  it("toasts export failures with the known error", () => {
    assertToast(exportCsvFailedToast(new Error("Could not export CSV")), {
      variant: "destructive",
      title: "Could not export CSV",
      description: "Could not export CSV",
    })
  })
})
