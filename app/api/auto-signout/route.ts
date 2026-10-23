import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import nodemailer from "nodemailer"
import { smtpTransportOptions } from "@/lib/smtp-transport"
import { isUndefinedColumn, isUndefinedTable } from "@/lib/idempotency"
import {
  autoSignoutEmailKey,
  getLocalTimeParts,
  isWithinTriggerWindow,
  locationOverrideFromRow,
  resolveAutoSignOutSettings,
  resolveAutoSignoutReportEmail,
  selectDueVisitorIds,
} from "@/lib/auto-signout"
import { renderAutoSignoutDigestEmail, renderSignoutSummaryEmail, type AutoSignoutDigestPerson } from "@/lib/signout-mail"
import { resolveAppOrigin } from "@/lib/nda"
import { formatMailClock } from "@/lib/email-shell"
import { resolveDisplayTimeZone } from "@/lib/timezone"
import { applySignOut } from "@/lib/sign-out-source"
import { sendEmail } from "@/lib/email"

export const maxDuration = 60

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Load SMTP + company branding from the settings table */
async function getSmtpSettings(supabase: ReturnType<typeof createAdminClient>) {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .is("location_id", null)
    .in("key", [
      "smtp_host", "smtp_port", "smtp_user", "smtp_pass",
      "smtp_from_email", "company_name", "company_logo",
      "auto_signout_report_email", "admin_alert_email",
    ])

  const s: Record<string, string> = {}
  if (data) for (const row of data) s[row.key] = String(row.value || "")

  return {
    host: s.smtp_host || process.env.SMTP_HOST || "",
    port: Number.parseInt(s.smtp_port || process.env.SMTP_PORT || "587", 10),
    user: s.smtp_user || process.env.SMTP_USER || "",
    pass: s.smtp_pass || process.env.SMTP_PASS || "",
    fromEmail: s.smtp_from_email || process.env.SMTP_FROM_EMAIL || s.smtp_user || process.env.SMTP_USER || "",
    companyName: s.company_name || "Talus Ag",
    companyLogo: s.company_logo || "",
    reportEmail: s.auto_signout_report_email || s.admin_alert_email || "",
  }
}

/**
 * Core auto-signout logic. Called by both GET (Vercel Cron) and POST (manual).
 *
 * The cron runs every 15 minutes. For each location, enable and time resolve
 * as location override, then global settings (location_id IS NULL), then
 * employees 18:00 / visitors 23:45. Times are local wall-clock in that
 * location's timezone. Employees use a 15-minute window after the time plus
 * a 14-hour max-duration safety net. Visitors sign out after the cutoff.
 */
async function runAutoSignout(request: Request) {
  try {
    // Fail closed when CRON_SECRET is unset. Production on Render is not
    // driven by vercel.json; an external scheduler must send Bearer CRON_SECRET.
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json(
        { error: "Server is not configured: CRON_SECRET is not set." },
        { status: 500 },
      )
    }
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient()
    const nowDate = new Date()
    const now = nowDate.toISOString()

    // Get all locations with timezone and optional per-location overrides.
    // Missing override columns (migration not applied yet) fall back to global.
    let { data: locations, error: locationsError } = await supabase
      .from("locations")
      .select("id, name, timezone, auto_sign_out_employees, auto_sign_out_employees_time, auto_sign_out_visitors, auto_sign_out_visitors_time")

    if (locationsError && isUndefinedColumn(locationsError)) {
      const retry = await supabase.from("locations").select("id, name, timezone")
      locations = retry.data
      locationsError = retry.error
    }

    if (locationsError) {
      console.error("[Auto Sign-out] Error loading locations:", locationsError)
      return NextResponse.json({ error: "Failed to load locations" }, { status: 500 })
    }

    if (!locations || locations.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No locations found",
        signedOut: 0,
      })
    }

    let totalSignedOut = 0
    const digestPeople: AutoSignoutDigestPerson[] = []
    const results: {
      locationId: string
      locationName: string
      timezone: string
      localTime: string
      signedOut: number
      employeesSignedOut: number
      enabled: boolean
      emailsSent: number
    }[] = []

    // Load SMTP settings once for host notification emails
    const smtp = await getSmtpSettings(supabase)
    let transporter: ReturnType<typeof nodemailer.createTransport> | null = null
    if (smtp.host && smtp.user && smtp.pass) {
      transporter = nodemailer.createTransport(smtpTransportOptions({
        host: smtp.host,
        port: smtp.port,
        user: smtp.user,
        pass: smtp.pass,
      }))
    }

    // Load the separate visitor/employee auto sign-out settings (global rows).
    // These are stored with location_id IS NULL. Fall back to the legacy
    // `auto_sign_out` key for the visitor toggle, and to sensible defaults.
    const { data: autoSettings } = await supabase
      .from("settings")
      .select("key, value")
      .is("location_id", null)
      .in("key", [
        "auto_sign_out_visitors",
        "auto_sign_out_visitors_time",
        "auto_sign_out_employees",
        "auto_sign_out_employees_time",
        "auto_sign_out", // legacy fallback
      ])

    const settingsMap: Record<string, unknown> = {}
    if (autoSettings) for (const row of autoSettings) settingsMap[row.key] = row.value

    const globalAutoSignOut = {
      visitorsEnabled: settingsMap.auto_sign_out_visitors,
      visitorsTime: settingsMap.auto_sign_out_visitors_time,
      employeesEnabled: settingsMap.auto_sign_out_employees,
      employeesTime: settingsMap.auto_sign_out_employees_time,
      legacyAutoSignOut: settingsMap.auto_sign_out,
    }

    for (const location of locations) {
      const resolved = resolveAutoSignOutSettings(globalAutoSignOut, locationOverrideFromRow(location))
      const visitorAutoEnabled = resolved.visitorsEnabled
      const employeeAutoEnabled = resolved.employeesEnabled
      const visitorTargetMinutes = resolved.visitorsTargetMinutes
      const employeeTargetMinutes = resolved.employeesTargetMinutes

      const tz = location.timezone || "UTC"
      const { hour, minute, localMinutes } = getLocalTimeParts(tz, nowDate)
      const localTimeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`

      // =====================================================
      // EMPLOYEE AUTO-SIGNOUT - TWO MECHANISMS (when enabled):
      // 1. At the configured local time - daily end-of-day cleanup
      // 2. Any time - if signed in > 14 hours (safety net)
      // This is a reliable server-side cleanup that doesn't
      // depend on the kiosk browser being open.
      // =====================================================
      let employeesSignedOut = 0
      if (employeeAutoEnabled) {
        // Calculate cutoff for max duration (14 hours ago)
        const maxDurationHours = 14
        const maxDurationCutoff = new Date(Date.now() - maxDurationHours * 60 * 60 * 1000).toISOString()

        // Get all employees still signed in at this location
        const { data: activeEmployeeSignIns, error: empFetchError } = await supabase
          .from("employee_sign_ins")
          .select("id, profile_id, sign_in_time, profiles ( full_name, email )")
          .eq("location_id", location.id)
          .is("sign_out_time", null)

        if (!empFetchError && activeEmployeeSignIns && activeEmployeeSignIns.length > 0) {
          // Filter employees to sign out:
          // - If within the configured end-of-day window: sign out ALL employees
          // - Otherwise: sign out only those signed in > 14 hours (safety net)
          const isDailyWindow = isWithinTriggerWindow(localMinutes, employeeTargetMinutes)

          const employeesToSignOut = isDailyWindow
            ? activeEmployeeSignIns
            : activeEmployeeSignIns.filter(e => e.sign_in_time < maxDurationCutoff)

          if (employeesToSignOut.length > 0) {
            const idsToSignOut = employeesToSignOut.map(e => e.id)

            const { error: empUpdateError } = await applySignOut(
              (payload) => supabase.from("employee_sign_ins").update(payload).in("id", idsToSignOut),
              "auto",
              now,
            )

            if (!empUpdateError) {
              const reason = isDailyWindow
                ? "end-of-day cleanup"
                : `exceeded ${maxDurationHours}h max duration`

              employeesSignedOut = employeesToSignOut.length
              totalSignedOut += employeesSignedOut
              const zone = resolveDisplayTimeZone(location.timezone)
              for (const row of employeesToSignOut) {
                const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as
                  | { full_name: string | null; email: string | null }
                  | null
                digestPeople.push({
                  kind: "employee",
                  name: profile?.full_name || profile?.email || "Unknown employee",
                  locationName: location.name,
                  signedInAt: formatMailClock(String(row.sign_in_time), zone),
                  signedOutAt: formatMailClock(now, zone),
                })
              }

              await supabase.from("audit_logs").insert({
                action: "employee.auto_sign_out",
                entity_type: "system",
                description: `Auto sign-out: ${employeesToSignOut.length} employee(s) at ${location.name} (${reason})`,
              })

              console.log(`[Auto Sign-out] ${reason}: Signed out ${employeesToSignOut.length} employee(s) at ${location.name}`)
            }
          }
        }
      }

      // =====================================================
      // VISITOR AUTO-SIGNOUT after the configured end-of-day time
      // =====================================================
      // Sign out anyone still signed in after today's sign-out time, or left
      // over from an earlier day. A missed cron run is picked up on the next
      // run. The update is limited to rows that are still open so a second
      // run cannot send duplicate emails.
      if (!visitorAutoEnabled) {
        results.push({
          locationId: location.id,
          locationName: location.name,
          timezone: tz,
          localTime: localTimeStr,
          signedOut: 0,
          employeesSignedOut,
          enabled: false,
          emailsSent: 0,
        })
        continue
      }

      // Get active visitor sign-ins for this location with host info.
      // NOTE: visitors use first_name/last_name (no full_name), hosts use name.
      const { data: activeSignIns, error: fetchError } = await supabase
        .from("sign_ins")
        .select(`
          id,
          sign_in_time,
          visitor_id,
          badge_number,
          sign_in_time,
          visitors!inner ( first_name, last_name, email, company ),
          host_id,
          hosts ( name, email )
        `)
        .eq("location_id", location.id)
        .is("sign_out_time", null)

      if (fetchError) {
        console.error(`[Auto Sign-out] Error fetching sign-ins for ${location.name}:`, fetchError)
        continue
      }

      const dueIds = selectDueVisitorIds(
        (activeSignIns ?? []).map((row) => ({ id: row.id as string, sign_in_time: String(row.sign_in_time) })),
        nowDate,
        tz,
        visitorTargetMinutes,
      )

      if (dueIds.length === 0) {
        results.push({
          locationId: location.id,
          locationName: location.name,
          timezone: tz,
          localTime: localTimeStr,
          signedOut: 0,
          employeesSignedOut,
          enabled: true,
          emailsSent: 0,
        })
        continue
      }

      const dueSignIns = (activeSignIns ?? []).filter((row) => dueIds.includes(row.id as string))

      const { data: updatedRows, error: updateError } = await applySignOut(
        (payload) =>
          supabase.from("sign_ins").update(payload).in("id", dueIds).is("sign_out_time", null).select("id"),
        "auto",
        now,
      )

      if (updateError) {
        console.error(`[Auto Sign-out] Error signing out visitors at ${location.name}:`, updateError)
        continue
      }

      const updatedIds = new Set((updatedRows ?? []).map((row) => row.id as string))
      const signedOutNow = dueSignIns.filter((row) => updatedIds.has(row.id as string))
      if (signedOutNow.length === 0) {
        results.push({
          locationId: location.id,
          locationName: location.name,
          timezone: tz,
          localTime: localTimeStr,
          signedOut: 0,
          employeesSignedOut,
          enabled: true,
          emailsSent: 0,
        })
        continue
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        action: "visitor.auto_sign_out",
        entity_type: "system",
        description: `Auto sign-out: ${signedOutNow.length} visitor(s) signed out at ${location.name} (${tz}, local time ${localTimeStr})`,
      })

      totalSignedOut += signedOutNow.length
      const visitorZone = resolveDisplayTimeZone(location.timezone)
      for (const signIn of signedOutNow) {
        const visitor = (Array.isArray(signIn.visitors) ? signIn.visitors[0] : signIn.visitors) as
          | { first_name: string; last_name: string; company: string | null }
          | null
        digestPeople.push({
          kind: "visitor",
          name: `${visitor?.first_name ?? ""} ${visitor?.last_name ?? ""}`.trim() || "Unknown visitor",
          locationName: location.name,
          signedInAt: signIn.sign_in_time
            ? formatMailClock(String(signIn.sign_in_time), visitorZone)
            : "",
          signedOutAt: formatMailClock(now, visitorZone),
        })
      }

      const emailable: typeof signedOutNow = []
      for (const signIn of signedOutNow) {
        const key = autoSignoutEmailKey(String(signIn.id))
        const insert = await supabase.from("host_notifications").insert({
          sign_in_id: signIn.id,
          notification_type: "auto_signed_out",
          idempotency_key: key,
          status: "pending",
        })
        if (insert.error && insert.error.code === "23505") continue
        if (insert.error && (isUndefinedTable(insert.error) || isUndefinedColumn(insert.error))) {
          emailable.push(signIn)
          continue
        }
        if (!insert.error) emailable.push(signIn)
      }

      // Email hosts about auto-signed-out visitors
      let emailsSent = 0
      if (transporter) {
        // Group visitors by host email to send one email per host
        const hostVisitors: Record<string, {
          hostName: string
          hostEmail: string
          visitors: { name: string; company: string | null; badge?: string | null; signedInAt?: string | null; signedOutAt?: string | null }[]
        }> = {}

        for (const signIn of emailable) {
          const host = (Array.isArray(signIn.hosts) ? signIn.hosts[0] : signIn.hosts) as
            | { name: string; email: string }
            | null
          if (!host?.email) continue

          const visitor = (Array.isArray(signIn.visitors) ? signIn.visitors[0] : signIn.visitors) as
            | { first_name: string; last_name: string; company: string | null }
            | null
          if (!visitor) continue

          const visitorName = `${visitor.first_name ?? ""} ${visitor.last_name ?? ""}`.trim()

          if (!hostVisitors[host.email]) {
            hostVisitors[host.email] = {
              hostName: host.name,
              hostEmail: host.email,
              visitors: [],
            }
          }
          hostVisitors[host.email].visitors.push({
            name: visitorName,
            company: visitor.company,
            badge: (signIn as { badge_number?: string | null }).badge_number,
            signedInAt: (signIn as { sign_in_time?: string | null }).sign_in_time
              ? formatMailClock((signIn as { sign_in_time: string }).sign_in_time, resolveDisplayTimeZone(location.timezone))
              : null,
            signedOutAt: formatMailClock(now, resolveDisplayTimeZone(location.timezone)),
          })
        }

        for (const hv of Object.values(hostVisitors)) {
          try {
            const origin = resolveAppOrigin(null)
            const rendered = renderSignoutSummaryEmail({
              kind: "auto",
              hostName: hv.hostName,
              locationName: location.name,
              whenLabel: formatMailClock(now, resolveDisplayTimeZone(location.timezone)),
              visitors: hv.visitors,
              reviewUrl: origin ? `${origin.replace(/\/+$/, "")}/admin/history` : null,
              logoUrl: smtp.companyLogo,
              appOrigin: origin,
            })

            await transporter.sendMail({
              from: `"Talus Ag Visitor Management" <${smtp.fromEmail}>`,
              to: hv.hostEmail,
              subject: rendered.subject,
              html: rendered.html,
              text: rendered.text,
            })
            emailsSent++
          } catch (emailErr) {
            console.error(`[Auto Sign-out] Failed to email host ${hv.hostEmail}:`, emailErr)
          }
        }
      }

      results.push({
        locationId: location.id,
        locationName: location.name,
        timezone: tz,
        localTime: localTimeStr,
        signedOut: signedOutNow.length,
        employeesSignedOut,
        enabled: true,
        emailsSent,
      })
    }

    let digestSent = false
    if (digestPeople.length > 0) {
      const origin = resolveAppOrigin(null)
      const recipient = resolveAutoSignoutReportEmail({
        settingsValue: smtp.reportEmail,
        envValue: process.env.AUTO_SIGNOUT_REPORT_EMAIL,
      })
      const digest = renderAutoSignoutDigestEmail({
        people: digestPeople,
        runAtLabel: formatMailClock(now, "America/Chicago"),
        reviewUrl: origin ? `${origin.replace(/\/+$/, "")}/admin/history` : null,
        logoUrl: smtp.companyLogo,
        appOrigin: origin,
      })
      const sent = await sendEmail({
        to: recipient,
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
      })
      digestSent = sent.sent
      if (!sent.sent) {
        console.error("[Auto Sign-out] Admin digest not sent:", sent.reason)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Signed out ${totalSignedOut} person(s) across locations at end of day`,
      signedOut: totalSignedOut,
      digestSent,
      timestamp: now,
      locations: results,
    })
  } catch (error) {
    console.error("[Auto Sign-out] Error:", error)
    return NextResponse.json(
      { error: "Failed to process auto sign-out" },
      { status: 500 }
    )
  }
}

/**
 * GET/POST handler. vercel.json listed this for Vercel Cron, but production
 * runs on Render and ignores vercel.json. Call with
 * Authorization: Bearer $CRON_SECRET from a Render cron or other scheduler.
 */
export async function GET(request: Request) {
  return runAutoSignout(request)
}

/**
 * POST handler -- kept for manual triggers or backward compatibility.
 */
export async function POST(request: Request) {
  return runAutoSignout(request)
}
