import { getAdminClient } from "@/lib/supabase/server"
import { escapeHtml, sanitizePlainText } from "@/lib/html-escape"
import { getSharedTransporter, resetSharedTransporter, TWILIO_TIMEOUT_MS } from "@/lib/smtp-transport"
import { HOST_NOTIFY_BUDGET_MS, sendWithNotifyRetry } from "@/lib/host-notify-retry"

export type HostNotificationType = "arrived" | "completing_training"

interface NotificationSettings {
  host: string
  port: number
  user: string
  pass: string
  fromEmail: string
  companyName: string
  companyLogo: string
  twilioSid: string
  twilioToken: string
  twilioFrom: string
}

async function getNotificationSettings(): Promise<NotificationSettings> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .is("location_id", null)
    .in("key", [
      "smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_email",
      "twilio_account_sid", "twilio_auth_token", "twilio_from_number",
      "company_name", "company_logo",
    ])

  const settings: Record<string, string> = {}
  if (data) {
    for (const setting of data) {
      settings[setting.key] = String(setting.value || "")
    }
  }

  return {
    host: settings.smtp_host || process.env.SMTP_HOST || "",
    port: Number.parseInt(settings.smtp_port || process.env.SMTP_PORT || "587", 10),
    user: settings.smtp_user || process.env.SMTP_USER || "",
    pass: settings.smtp_pass || process.env.SMTP_PASS || "",
    fromEmail: settings.smtp_from_email || process.env.SMTP_FROM_EMAIL || settings.smtp_user || process.env.SMTP_USER || "",
    companyName: settings.company_name || "Talus Ag",
    companyLogo: settings.company_logo || "",
    twilioSid: settings.twilio_account_sid || "",
    twilioToken: settings.twilio_auth_token || "",
    twilioFrom: settings.twilio_from_number || "",
  }
}

async function isSmsAddonEnabled(): Promise<boolean> {
  const supabase = getAdminClient()
  const { data: tenant } = await supabase
    .from("tenants")
    .select("plan, addons")
    .eq("status", "active")
    .limit(1)
    .single()

  if (!tenant) return false
  if (tenant.plan === "enterprise") return true
  const addons = tenant.addons as Record<string, boolean> | null
  return addons?.sms === true
}

async function isSmsEnabledForLocation(locationId: string | null): Promise<boolean> {
  if (!locationId) return false
  const addonEnabled = await isSmsAddonEnabled()
  if (!addonEnabled) return false

  const supabase = getAdminClient()
  const { data: locationSetting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "sms_notifications")
    .eq("location_id", locationId)
    .single()

  if (locationSetting) {
    return locationSetting.value === true || locationSetting.value === "true"
  }

  const { data: globalSetting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "sms_notifications")
    .is("location_id", null)
    .single()

  return globalSetting?.value === true || globalSetting?.value === "true"
}

async function sendTwilioSms(sid: string, token: string, from: string, to: string, body: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
  const auth = Buffer.from(`${sid}:${token}`).toString("base64")
  const params = new URLSearchParams({ To: to, From: from, Body: body })
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { message?: string }
    const err = new Error(errorData.message || `Twilio API error: ${response.status}`) as Error & { httpStatus?: number }
    err.httpStatus = response.status
    throw err
  }
  return response.json()
}

export interface ResolvedHost {
  name: string
  email: string | null
  phone: string | null
}

/**
 * Resolve host contact details server-side. Prefer the linked profile
 * so a stale hosts.email row cannot redirect notifications.
 *
 * Any active host is valid (P1-6). location_id is not a filter.
 */
export async function resolveHostContact(
  hostId: string,
  _locationId?: string | null,
): Promise<ResolvedHost | null> {
  const admin = getAdminClient()
  const { data: host } = await admin
    .from("hosts")
    .select("id, name, email, phone, profile_id, is_active, location_id")
    .eq("id", hostId)
    .eq("is_active", true)
    .maybeSingle()
  if (!host) return null

  let name = host.name
  let email = host.email
  let phone = host.phone

  if (host.profile_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", host.profile_id)
      .maybeSingle()

    if (profile) {
      name = profile.full_name || name
      email = profile.email || email
      phone = profile.phone || phone
    }
  }

  if (!email && !phone) return null
  return { name, email, phone }
}

export async function sendResolvedHostNotification(args: {
  host: ResolvedHost
  locationId?: string | null
  locationName?: string | null
  notificationType: HostNotificationType
  visitorName: string
  visitorCompany?: string | null
  visitorTypeName?: string | null
  badgeNumber?: string | null
  visitorPhotoUrl?: string | null
  purpose?: string | null
  signInId?: string | null
}): Promise<{ email?: string; sms?: string; loggedOnly?: boolean }> {
  const notifSettings = await getNotificationSettings()
  const results: { email?: string; sms?: string; loggedOnly?: boolean } = {}
  const deadlineAt = Date.now() + HOST_NOTIFY_BUDGET_MS
  const retryContext = {
    signInId: args.signInId ?? null,
    notificationType: args.notificationType,
  }

  const visitorName = sanitizePlainText(args.visitorName, 200)
  const visitorCompany = sanitizePlainText(args.visitorCompany, 200)
  const locationName = sanitizePlainText(args.locationName, 200)
  const badgeNumber = sanitizePlainText(args.badgeNumber, 40)
  const hostName = sanitizePlainText(args.host.name || "Host", 200)
  const purpose = sanitizePlainText(args.purpose, 300)
  const visitorTypeName = sanitizePlainText(args.visitorTypeName, 120)

  const smsEnabled = await isSmsEnabledForLocation(args.locationId || null)
  if (smsEnabled && args.host.phone && notifSettings.twilioSid && notifSettings.twilioToken && notifSettings.twilioFrom) {
    try {
      const isTraining = args.notificationType === "completing_training"
      const companyNameSms = sanitizePlainText(notifSettings.companyName, 80)
      const smsBody = isTraining
        ? `${companyNameSms} Visitor Alert: ${visitorName}${visitorCompany ? ` from ${visitorCompany}` : ""} is checking in and completing training. They'll be ready shortly.`
        : `${companyNameSms} Visitor Alert: ${visitorName}${visitorCompany ? ` from ${visitorCompany}` : ""} has arrived${locationName ? ` at ${locationName}` : ""}.${badgeNumber ? ` Badge #${badgeNumber}.` : ""} Please proceed to reception.`

      await sendWithNotifyRetry(
        { ...retryContext, channel: "sms" },
        () => sendTwilioSms(
          notifSettings.twilioSid,
          notifSettings.twilioToken,
          notifSettings.twilioFrom,
          args.host.phone,
          smsBody,
        ),
        { deadlineAt },
      )
      results.sms = "sent"
    } catch (smsErr) {
      console.error("[Host Notify] SMS error:", smsErr instanceof Error ? smsErr.message : smsErr)
      results.sms = "failed"
    }
  } else if (smsEnabled && args.host.phone) {
    results.sms = "twilio_not_configured"
  }

  const safe = {
    companyName: escapeHtml(notifSettings.companyName),
    companyLogo: escapeHtml(notifSettings.companyLogo),
    hostName: escapeHtml(hostName),
    visitorName: escapeHtml(visitorName),
    visitorCompany: escapeHtml(visitorCompany),
    purpose: escapeHtml(purpose),
    badgeNumber: escapeHtml(badgeNumber),
    locationName: escapeHtml(locationName),
    visitorTypeName: escapeHtml(visitorTypeName),
    visitorPhotoUrl: /^https?:\/\//i.test(String(args.visitorPhotoUrl || ""))
      ? escapeHtml(args.visitorPhotoUrl)
      : "",
  }

  const smtpCfg = {
    host: notifSettings.host,
    port: notifSettings.port,
    user: notifSettings.user,
    pass: notifSettings.pass,
  }
  const transporter = getSharedTransporter(smtpCfg)

  if (!transporter || !notifSettings.fromEmail || !args.host.email) {
    console.log("[Host Notify] SMTP not configured or host has no email, logging only")
    results.loggedOnly = true
    return results
  }

  const isTraining = args.notificationType === "completing_training"
  const emailTitle = isTraining ? "Visitor Checking In - Training Required" : "Visitor Arrival"
  const emailSubject = isTraining
    ? `Visitor Checking In: ${visitorName}${visitorCompany ? ` from ${visitorCompany}` : ""} - Completing Training`
    : `Visitor Arrival: ${visitorName}${visitorCompany ? ` from ${visitorCompany}` : ""}`
  const mainMessage = isTraining
    ? `Your visitor is checking in and completing the required ${visitorTypeName || "safety"} training. They will be ready to meet you shortly.`
    : "Your visitor has arrived and is waiting for you at the reception area."
  const actionMessage = isTraining
    ? "Your visitor will proceed to reception after completing their training."
    : "Please proceed to reception to meet your visitor."

  const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
                  <tr>
                    <td style="background-color: ${isTraining ? "#d97706" : "#059669"}; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                      ${safe.companyLogo ? `<img src="${safe.companyLogo}" alt="${safe.companyName}" style="max-height: 50px; margin-bottom: 15px; border-radius: 8px" />` : ""}
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">${escapeHtml(emailTitle)}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #ffffff; padding: 30px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
                      <p style="font-size: 16px; margin: 0 0 20px 0; color: #111827;">Dear ${safe.hostName},</p>
                      <p style="font-size: 16px; margin: 0 0 25px 0; color: #374151;">${escapeHtml(mainMessage)}</p>
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                        <tr>
                          <td style="padding: 20px;">
                            <h3 style="margin: 0 0 15px 0; color: #059669; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Visitor Details</h3>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              ${safe.visitorPhotoUrl ? `
                              <tr>
                                <td colspan="2" style="padding: 0 0 15px 0; text-align: center;">
                                  <img src="${safe.visitorPhotoUrl}" alt="${safe.visitorName}" style="width: 120px; height: 120px; border-radius: 8px; object-fit: cover; border: 3px solid #e5e7eb;" />
                                </td>
                              </tr>
                              ` : ""}
                              <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; width: 100px; vertical-align: top;">Name:</td>
                                <td style="padding: 10px 0; color: #111827; font-size: 14px; font-weight: 600;">${safe.visitorName}</td>
                              </tr>
                              ${safe.visitorCompany ? `
                              <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Company:</td>
                                <td style="padding: 10px 0; color: #111827; font-size: 14px;">${safe.visitorCompany}</td>
                              </tr>
                              ` : ""}
                              ${safe.purpose ? `
                              <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Purpose:</td>
                                <td style="padding: 10px 0; color: #111827; font-size: 14px;">${safe.purpose}</td>
                              </tr>
                              ` : ""}
                              ${safe.badgeNumber ? `
                              <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Badge #:</td>
                                <td style="padding: 10px 0; color: #111827; font-size: 14px; font-weight: 600;">${safe.badgeNumber}</td>
                              </tr>
                              ` : ""}
                              ${safe.locationName ? `
                              <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Location:</td>
                                <td style="padding: 10px 0; color: #111827; font-size: 14px;">${safe.locationName}</td>
                              </tr>
                              ` : ""}
                            </table>
                          </td>
                        </tr>
                      </table>
                      <p style="font-size: 15px; color: #374151; margin: 25px 0 0 0; padding: 15px; background-color: ${isTraining ? "#fffbeb" : "#ecfdf5"}; border-radius: 6px; border-left: 4px solid ${isTraining ? "#d97706" : "#059669"};">${escapeHtml(actionMessage)}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
                      <p style="margin: 0; color: #9ca3af; font-size: 12px;">This is an automated message from ${safe.companyName} Visitor Management System</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `

  const mail = {
    from: `"${notifSettings.companyName} Visitor Management" <${notifSettings.fromEmail}>`,
    to: args.host.email,
    subject: emailSubject,
    html: emailHtml,
    text: `Dear ${hostName},\n\n${mainMessage}\n\nName: ${visitorName}\nCompany: ${visitorCompany || "Not specified"}\nPurpose: ${purpose || "Not specified"}\nBadge #: ${badgeNumber || "N/A"}\n${locationName ? `Location: ${locationName}\n` : ""}\n${actionMessage}\n\n- ${sanitizePlainText(notifSettings.companyName, 80)} Visitor Management System`,
  }

  await sendWithNotifyRetry(
    { ...retryContext, channel: "email" },
    async () => {
      const active = getSharedTransporter(smtpCfg)
      if (!active) {
        throw new Error("SMTP not configured")
      }
      return active.sendMail(mail)
    },
    {
      deadlineAt,
      onTransient: () => resetSharedTransporter(),
    },
  )

  results.email = "sent"
  return results
}
