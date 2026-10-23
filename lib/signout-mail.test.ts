import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderAutoSignoutDigestEmail, renderSignoutSummaryEmail } from "./signout-mail.ts"
import { DEFAULT_AUTO_SIGNOUT_REPORT_EMAIL, resolveAutoSignoutReportEmail } from "./auto-signout.ts"

describe("host auto sign-out email", () => {
  it("names the visitor, site, and in/out times", () => {
    const mail = renderSignoutSummaryEmail({
      kind: "auto",
      hostName: "Maya Chen",
      locationName: "Houston HQ",
      whenLabel: "Thu, Oct 22, 6:45 PM CDT",
      visitors: [
        {
          name: "Ada Lovelace",
          company: "Analytical",
          badge: "V00012",
          signedInAt: "8:15 AM CDT",
          signedOutAt: "6:45 PM CDT",
        },
      ],
      reviewUrl: "https://signin.talusag.com/admin/history",
    })
    assert.match(mail.subject, /1 visitor auto signed out at Houston HQ/)
    assert.match(mail.html, /Ada Lovelace/)
    assert.match(mail.html, /Houston HQ/)
    assert.match(mail.html, /in at 8:15 AM CDT/)
    assert.match(mail.html, /out at 6:45 PM CDT/)
    assert.match(mail.html, /Automatic sign-out/)
    assert.match(mail.text, /out at 6:45 PM CDT/)
    assert.equal(mail.html.includes("\u2014"), false)
  })
})

describe("admin auto sign-out digest", () => {
  it("lists employees and visitors with site and times", () => {
    const mail = renderAutoSignoutDigestEmail({
      people: [
        {
          kind: "employee",
          name: "Caleb Klob",
          locationName: "Boone",
          signedInAt: "7:02 AM CDT",
          signedOutAt: "6:00 PM CDT",
        },
        {
          kind: "visitor",
          name: "Ada Lovelace",
          locationName: "Houston HQ",
          signedInAt: "8:15 AM CDT",
          signedOutAt: "6:45 PM CDT",
        },
      ],
      runAtLabel: "Thu, Oct 22, 6:45 PM CDT",
      reviewUrl: "https://signin.talusag.com/admin/history",
    })
    assert.match(mail.subject, /2 people signed out/)
    assert.match(mail.html, /Caleb Klob/)
    assert.match(mail.html, /Employee/)
    assert.match(mail.html, /Ada Lovelace/)
    assert.match(mail.html, /Visitor/)
    assert.match(mail.html, /Boone/)
    assert.match(mail.html, /Houston HQ/)
    assert.match(mail.text, /Caleb Klob \(Employee\) at Boone/)
    assert.match(mail.text, /Ada Lovelace \(Visitor\) at Houston HQ/)
  })

  it("resolves the digest recipient from settings, then env, then Caleb's Talus address", () => {
    assert.equal(resolveAutoSignoutReportEmail({ settingsValue: "ops@talusag.com" }), "ops@talusag.com")
    assert.equal(
      resolveAutoSignoutReportEmail({ settingsValue: "", envValue: "alerts@talusag.com" }),
      "alerts@talusag.com",
    )
    assert.equal(resolveAutoSignoutReportEmail({}), DEFAULT_AUTO_SIGNOUT_REPORT_EMAIL)
    assert.equal(DEFAULT_AUTO_SIGNOUT_REPORT_EMAIL, "caleb@talusag.com")
  })
})
