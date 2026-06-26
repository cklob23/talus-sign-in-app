import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import nodemailer from "nodemailer"
import { toIANATimezone } from "@/lib/timezone"

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
  }
}

/**
 * Get the current local time in a timezone.
 * Returns { hour, minute } in the location's local time.
 */
function getLocalTime(timezone: string): { hour: number; minute: number } {
  try {
    // Locations may store Windows timezone names (e.g. "E. Africa Standard
    // Time"), which Intl.DateTimeFormat rejects. Convert to IANA first.
    const ianaTimezone = toIANATimezone(timezone)
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    })
    const parts = formatter.formatToParts(new Date())
    let hour = Number(parts.find(p => p.type === "hour")?.value ?? 0)
    const minute = Number(parts.find(p => p.type === "minute")?.value ?? 0)
    // Intl can emit "24" for midnight in hour12:false mode; normalize to 0.
    if (hour === 24) hour = 0
    return { hour, minute }
  } catch {
    // Invalid timezone — return a time that won't trigger sign-out
    return { hour: 12, minute: 0 }
  }
}

/**
 * Parse a stored "HH:MM" setting value into minutes-of-day.
 * Returns null if the value is missing/invalid.
 */
function parseTimeToMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

/**
 * The cron fires every 15 minutes. Returns true when the current local time
 * falls within the 15-minute window that starts at the configured target time,
 * so a daily target reliably triggers exactly once around that time.
 */
function isWithinTriggerWindow(localMinutes: number, targetMinutes: number): boolean {
  const diff = (localMinutes - targetMinutes + 1440) % 1440
  return diff < 15
}

/** Coerce a stored boolean setting (JSON true or "true") to a boolean. */
function asBool(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "true") return true
  if (value === false || value === "false") return false
  return fallback
}

/**
 * Core auto-signout logic. Called by both GET (Vercel Cron) and POST (manual).
 *
 * The cron runs every 15 minutes. For each location where auto_sign_out is
 * enabled, we check if the local time is in the 23:45–23:59 window (11:45 PM
 * to 11:59 PM). If so, we sign out all active visitors and email their hosts.
 */
async function runAutoSignout(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    // Get all locations with their timezone
    const { data: locations } = await supabase
      .from("locations")
      .select("id, name, timezone")

    if (!locations || locations.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No locations found",
        signedOut: 0,
      })
    }

    let totalSignedOut = 0
    const results: {
      locationId: string
      locationName: string
      timezone: string
      localTime: string
      signedOut: number
      enabled: boolean
      emailsSent: number
    }[] = []

    // Load SMTP settings once for host notification emails
    const smtp = await getSmtpSettings(supabase)
    let transporter: nodemailer.Transporter | null = null
    if (smtp.host && smtp.user && smtp.pass) {
      transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      })
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

    const visitorAutoEnabled = asBool(
      settingsMap.auto_sign_out_visitors ?? settingsMap.auto_sign_out,
      true,
    )
    const employeeAutoEnabled = asBool(settingsMap.auto_sign_out_employees, true)
    const visitorTargetMinutes =
      parseTimeToMinutes(settingsMap.auto_sign_out_visitors_time) ?? 23 * 60 + 45 // 23:45
    const employeeTargetMinutes =
      parseTimeToMinutes(settingsMap.auto_sign_out_employees_time) ?? 18 * 60 // 18:00

    if (!visitorAutoEnabled && !employeeAutoEnabled) {
      return NextResponse.json({
        success: true,
        message: "Auto sign-out is disabled for both visitors and employees",
        signedOut: 0,
        timestamp: now,
        locations: [],
      })
    }

    for (const location of locations) {
      const tz = location.timezone || "UTC"
      const { hour, minute } = getLocalTime(tz)
      const localMinutes = hour * 60 + minute
      const localTimeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`

      // =====================================================
      // EMPLOYEE AUTO-SIGNOUT - TWO MECHANISMS (when enabled):
      // 1. At the configured local time - daily end-of-day cleanup
      // 2. Any time - if signed in > 14 hours (safety net)
      // This is a reliable server-side cleanup that doesn't
      // depend on the kiosk browser being open.
      // =====================================================
      if (employeeAutoEnabled) {
        // Calculate cutoff for max duration (14 hours ago)
        const maxDurationHours = 14
        const maxDurationCutoff = new Date(Date.now() - maxDurationHours * 60 * 60 * 1000).toISOString()

        // Get all employees still signed in at this location
        const { data: activeEmployeeSignIns, error: empFetchError } = await supabase
          .from("employee_sign_ins")
          .select("id, profile_id, sign_in_time")
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

            // Sign out the selected employees
            const { error: empUpdateError } = await supabase
              .from("employee_sign_ins")
              .update({ sign_out_time: now })
              .in("id", idsToSignOut)

            if (!empUpdateError) {
              const reason = isDailyWindow
                ? "end-of-day cleanup"
                : `exceeded ${maxDurationHours}h max duration`

              // Audit log for employee auto-signout
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
      // VISITOR AUTO-SIGNOUT at the configured end-of-day time (when enabled)
      // =====================================================
      // Only sign out visitors if enabled AND local time is within the
      // configured trigger window.
      if (!visitorAutoEnabled || !isWithinTriggerWindow(localMinutes, visitorTargetMinutes)) {
        results.push({
          locationId: location.id,
          locationName: location.name,
          timezone: tz,
          localTime: localTimeStr,
          signedOut: 0,
          enabled: visitorAutoEnabled,
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
          visitor_id,
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

      if (!activeSignIns || activeSignIns.length === 0) {
        results.push({
          locationId: location.id,
          locationName: location.name,
          timezone: tz,
          localTime: localTimeStr,
          signedOut: 0,
          enabled: true,
          emailsSent: 0,
        })
        continue
      }

      // Sign out all active visitors at this location
      const { error: updateError } = await supabase
        .from("sign_ins")
        .update({ sign_out_time: now })
        .eq("location_id", location.id)
        .is("sign_out_time", null)

      if (updateError) {
        console.error(`[Auto Sign-out] Error signing out visitors at ${location.name}:`, updateError)
        continue
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        action: "visitor.auto_sign_out",
        entity_type: "system",
        description: `Auto sign-out: ${activeSignIns.length} visitor(s) signed out at ${location.name} (${tz}, local time ${localTimeStr})`,
      })

      totalSignedOut += activeSignIns.length

      // Email hosts about auto-signed-out visitors
      let emailsSent = 0
      if (transporter) {
        // Group visitors by host email to send one email per host
        const hostVisitors: Record<string, {
          hostName: string
          hostEmail: string
          visitors: { name: string; company: string | null }[]
        }> = {}

        for (const signIn of activeSignIns) {
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
          })
        }

        for (const hv of Object.values(hostVisitors)) {
          try {
            const visitorList = hv.visitors
              .map(v => `<li style="padding:4px 0;color:#333;">${v.name}${v.company ? ` <span style="color:#888;">(${v.company})</span>` : ""}</li>`)
              .join("")

            const htmlBody = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                ${smtp.companyLogo ? `<img src="${smtp.companyLogo}" alt="${smtp.companyName}" style="height:40px;margin-bottom:24px;" />` : `<h2 style="margin-bottom:24px;color:#333;">${smtp.companyName}</h2>`}
                <p style="font-size:16px;color:#333;">Hi ${hv.hostName},</p>
                <p style="font-size:14px;color:#555;line-height:1.6;">
                  The following visitor${hv.visitors.length > 1 ? "s were" : " was"} automatically signed out at <strong>${location.name}</strong> at end of day (${localTimeStr} ${tz}):
                </p>
                <ul style="font-size:14px;line-height:1.8;padding-left:20px;margin:16px 0;">
                  ${visitorList}
                </ul>
                <p style="font-size:13px;color:#888;line-height:1.5;">
                  This is an automated notification. If any of these visitors are still on-site, please have them sign in again tomorrow.
                </p>
                <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
                <p style="font-size:11px;color:#aaa;">${smtp.companyName} Visitor Management</p>
              </div>
            `

            await transporter.sendMail({
              from: `"${smtp.companyName}" <${smtp.fromEmail}>`,
              to: hv.hostEmail,
              subject: `${smtp.companyName} - Visitor${hv.visitors.length > 1 ? "s" : ""} Auto Signed Out at ${location.name}`,
              html: htmlBody,
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
        signedOut: activeSignIns.length,
        enabled: true,
        emailsSent,
      })
    }

    return NextResponse.json({
      success: true,
      message: `Signed out ${totalSignedOut} visitor(s) across locations at end of day`,
      signedOut: totalSignedOut,
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
 * GET handler -- called by Vercel Cron every 15 minutes.
 * Vercel Crons always send GET requests.
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
