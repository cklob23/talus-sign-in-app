import { getAdminClient } from "@/lib/supabase/server"
import { sanitizeAppUrl, sanitizePlainText } from "@/lib/html-escape"
import { getSharedTransporter, resetSharedTransporter, TWILIO_TIMEOUT_MS } from "@/lib/smtp-transport"
import { HOST_NOTIFY_BUDGET_MS, sendWithNotifyRetry } from "@/lib/host-notify-retry"
import { visitUrlForSignIn } from "@/lib/visit-token"
import { resolveAppOrigin } from "@/lib/nda"
import { renderHostArrivalEmail, renderHostTrainingEmail } from "@/lib/host-mail"
import { resolveDisplayTimeZone } from "@/lib/timezone"
import { hostEntryLabel, inferHostEntrySource, type HostEntrySource } from "@/lib/host-entry"
import { fetchTrainingVideoSeconds, formatReadyAbout, trainingSecondsFromRecord } from "@/lib/training-ready"

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

async function lookupKioskName(locationId: string | null): Promise<string | null> {
  if (!locationId) return null
  try {
    const admin = getAdminClient()
    const { data: locationSetting } = await admin
      .from("settings")
      .select("value")
      .eq("key", "kiosk_name")
      .eq("location_id", locationId)
      .maybeSingle()
    const fromLocation = stringifySetting(locationSetting?.value)
    if (fromLocation) return fromLocation

    const { data: globalSetting } = await admin
      .from("settings")
      .select("value")
      .eq("key", "kiosk_name")
      .is("location_id", null)
      .maybeSingle()
    const fromGlobal = stringifySetting(globalSetting?.value)
    if (fromGlobal) return fromGlobal

    const { data: location } = await admin
      .from("locations")
      .select("*")
      .eq("id", locationId)
      .maybeSingle()
    const fromRow = stringifySetting(
      location && typeof location === "object"
        ? (location as Record<string, unknown>).kiosk_name ?? (location as Record<string, unknown>).kioskName
        : null,
    )
    return fromRow
  } catch {
    return null
  }
}

function stringifySetting(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value && typeof value === "object" && "name" in value && typeof (value as { name?: unknown }).name === "string") {
    return (value as { name: string }).name.trim() || null
  }
  return null
}

async function lookupTrainingDurationSeconds(args: {
  visitorTypeId?: string | null
  visitorTypeName?: string | null
  trainingDurationSeconds?: number | null
}): Promise<number | null> {
  if (args.trainingDurationSeconds && Number.isFinite(args.trainingDurationSeconds) && args.trainingDurationSeconds > 0) {
    return args.trainingDurationSeconds
  }
  if (!args.visitorTypeId && !args.visitorTypeName) return null
  try {
    const admin = getAdminClient()
    let query = admin.from("visitor_types").select("*")
    query = args.visitorTypeId
      ? query.eq("id", args.visitorTypeId)
      : query.eq("name", args.visitorTypeName as string)
    const { data } = await query.maybeSingle()
    const stored = trainingSecondsFromRecord(data as Record<string, unknown> | null)
    if (stored) return stored
    const url = data && typeof data.training_video_url === "string" ? data.training_video_url : null
    if (url) return await fetchTrainingVideoSeconds(url)
  } catch {
    return null
  }
  return null
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
  hostId?: string | null
  signedInBy?: string | null
  locationLabel?: string | null
  entrySource?: HostEntrySource | null
  kioskName?: string | null
  visitorTypeId?: string | null
  trainingDurationSeconds?: number | null
  readyAbout?: string | null
  trainingLine?: string | null
  arrivedAt?: string | Date | null
  timeZone?: string | null
}): Promise<{ email?: string; sms?: string; loggedOnly?: boolean }> {
  const notifSettings = await getNotificationSettings()
  const results: { email?: string; sms?: string; loggedOnly?: boolean } = {}
  const deadlineAt = Date.now() + HOST_NOTIFY_BUDGET_MS
  const retryContext = {
    signInId: args.signInId ?? null,
    notificationType: args.notificationType,
  }

  let timeZone = args.timeZone
  if (!timeZone?.trim() && args.locationId) {
    try {
      const admin = getAdminClient()
      const { data: location } = await admin
        .from("locations")
        .select("timezone")
        .eq("id", args.locationId)
        .maybeSingle()
      if (typeof location?.timezone === "string" && location.timezone.trim()) {
        timeZone = location.timezone
      }
    } catch {
      timeZone = timeZone ?? null
    }
  }
  timeZone = resolveDisplayTimeZone(timeZone)

  const visitorName = sanitizePlainText(args.visitorName, 200)
  const visitorCompany = sanitizePlainText(args.visitorCompany, 200)
  const locationName = sanitizePlainText(args.locationName, 200)
  const badgeNumber = sanitizePlainText(args.badgeNumber, 40)
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

  let visitUrl = ""
  let visitOrigin = ""
  if (args.signInId) {
    try {
      visitOrigin = resolveAppOrigin(null)
      if (visitOrigin) visitUrl = visitUrlForSignIn({ origin: visitOrigin, signInId: args.signInId, hostId: args.hostId })
    } catch {
      visitUrl = ""
    }
  }
  visitUrl = sanitizeAppUrl(visitUrl, visitOrigin)

  const isTraining = args.notificationType === "completing_training"
  const entrySource = inferHostEntrySource(args)
  const kioskName = args.kioskName ?? (await lookupKioskName(args.locationId || null))
  const entryLabel = args.locationLabel || hostEntryLabel(entrySource, kioskName)
  let readyAbout = args.readyAbout ?? formatReadyAbout(args.trainingDurationSeconds)
  if (isTraining && !readyAbout) {
    readyAbout = formatReadyAbout(await lookupTrainingDurationSeconds(args)) ?? null
  }
  const mailArgs = {
    visitorName,
    visitorCompany,
    visitorTypeName,
    visitorPhotoUrl: args.visitorPhotoUrl,
    purpose,
    badgeNumber,
    locationName,
    locationLabel: entryLabel,
    signedInBy: args.signedInBy || entryLabel,
    trainingLine: args.trainingLine || (isTraining ? "In progress. Not cleared yet." : undefined),
    arrivedAt: args.arrivedAt || new Date(),
    timeZone,
    visitUrl,
    logoUrl: notifSettings.companyLogo,
    appOrigin: visitOrigin,
    readyAbout,
  }
  const rendered = isTraining ? renderHostTrainingEmail(mailArgs) : renderHostArrivalEmail(mailArgs)

  const mail = {
    from: `"Talus Ag Visitor Management" <${notifSettings.fromEmail}>`,
    to: args.host.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
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
