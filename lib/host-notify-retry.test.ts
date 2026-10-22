import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isTransientNotifyError,
  notifyErrorMessage,
  sendWithNotifyRetry,
} from "./host-notify-retry.ts"

function smtpError(over: { message?: string; code?: string; command?: string; responseCode?: number }) {
  return Object.assign(new Error(over.message || "SMTP error"), over)
}

describe("isTransientNotifyError", () => {
  it("retries connect timeouts, resets, and SMTP 4xx", () => {
    assert.equal(isTransientNotifyError(smtpError({ code: "ETIMEDOUT", command: "CONN", message: "Timeout" })), true)
    assert.equal(isTransientNotifyError(smtpError({ code: "ECONNRESET" })), true)
    assert.equal(isTransientNotifyError(smtpError({ code: "ESOCKET" })), true)
    assert.equal(isTransientNotifyError(smtpError({ code: "ECONNECTION" })), true)
    assert.equal(isTransientNotifyError(smtpError({ command: "CONN", message: "Greeting never received" })), true)
    assert.equal(isTransientNotifyError(smtpError({ responseCode: 421, message: "Try again later" })), true)
    assert.equal(isTransientNotifyError(smtpError({ responseCode: 450 })), true)
  })

  it("does not retry permanent SMTP 5xx", () => {
    assert.equal(isTransientNotifyError(smtpError({ responseCode: 550, message: "Mailbox unavailable" })), false)
    assert.equal(isTransientNotifyError(smtpError({ responseCode: 553, code: "EENVELOPE" })), false)
  })
})

describe("sendWithNotifyRetry", () => {
  const context = { signInId: "sign-1", notificationType: "arrived" as const, channel: "email" as const }
  const instant = { sleep: async () => {} }

  it("retries a transient SMTP timeout then sends once", async () => {
    const transport = {
      calls: 0,
      async sendMail() {
        this.calls += 1
        if (this.calls === 1) {
          throw smtpError({ code: "ETIMEDOUT", command: "CONN", message: "Timeout" })
        }
        return { messageId: "ok" }
      },
    }

    const result = await sendWithNotifyRetry(context, () => transport.sendMail(), instant)
    assert.deepEqual(result, { messageId: "ok" })
    assert.equal(transport.calls, 2)
  })

  it("fails a permanent 5xx without retrying", async () => {
    const transport = {
      calls: 0,
      async sendMail() {
        this.calls += 1
        throw smtpError({ responseCode: 550, message: "Mailbox unavailable" })
      },
    }

    await assert.rejects(
      () => sendWithNotifyRetry(context, () => transport.sendMail(), instant),
      /Mailbox unavailable/,
    )
    assert.equal(transport.calls, 1)
  })

  it("summarizes errors without leaking credentials", () => {
    const message = notifyErrorMessage(
      smtpError({ code: "ETIMEDOUT", command: "CONN", message: "Timeout of 20000ms exceeded" }),
    )
    assert.match(message, /ETIMEDOUT/)
    assert.match(message, /CONN/)
    assert.equal(/pass|smtp_pass|auth|token/i.test(message), false)
  })
})
