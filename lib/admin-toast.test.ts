import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { DEFAULT_TOAST_ERROR, errorToast, safeToastError, successToast } from "./admin-toast.ts"

describe("safeToastError", () => {
  it("keeps a non-empty string and trims it", () => {
    assert.equal(safeToastError("  SMTP is not configured.  "), "SMTP is not configured.")
  })

  it("reads Error.message and { error } / { message } objects", () => {
    assert.equal(safeToastError(new Error("Could not save schedule")), "Could not save schedule")
    assert.equal(safeToastError({ error: "Row cap exceeded" }), "Row cap exceeded")
    assert.equal(safeToastError({ message: "Unauthorized" }), "Unauthorized")
  })

  it("falls back when the value is empty or unknown", () => {
    assert.equal(safeToastError(""), DEFAULT_TOAST_ERROR)
    assert.equal(safeToastError(null), DEFAULT_TOAST_ERROR)
    assert.equal(safeToastError({}), DEFAULT_TOAST_ERROR)
    assert.equal(safeToastError(undefined, "Could not send report"), "Could not send report")
  })
})

describe("successToast / errorToast", () => {
  it("builds a short success payload", () => {
    const payload = successToast("Schedule saved", "Weekly visitor sign-ins")
    assert.equal(payload.title, "Schedule saved")
    assert.equal(payload.description, "Weekly visitor sign-ins")
    assert.equal(payload.variant, undefined)
  })

  it("builds a destructive error payload with a safe message", () => {
    const payload = errorToast("Could not send report", { error: "No recipients" })
    assert.equal(payload.variant, "destructive")
    assert.equal(payload.title, "Could not send report")
    assert.equal(payload.description, "No recipients")
  })
})
