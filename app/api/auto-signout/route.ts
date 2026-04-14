import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import nodemailer from "nodemailer"

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
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    })
    const parts = formatter.formatToParts(new Date())
    const hour = Number(parts.find(p => p.type === "hour")?.value ?? 0)
    const minute = Number(parts.find(p => p.type === "minute")?.value ?? 0)
    return { hour, minute }
  } catch {
    // Invalid timezone — return a time that won't trigger sign-out
    return { hour: 12, minute: 0 }
  }
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

    // Check if auto sign-out is enabled globally
    const { data: autoSignOutSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "auto_sign_out")
      .is("location_id", null)
      .single()

    const autoSignOutEnabled =
      autoSignOutSetting?.value === true || autoSignOutSetting?.value === "true"

    if (!autoSignOutEnabled) {
      return NextResponse.json({
        success: true,
        message: "Auto sign-out is disabled",
        signedOut: 0,
        timestamp: now,
        locations: [],
      })
    }

    for (const location of locations) {
      const tz = location.timezone || "UTC"
      const { hour, minute } = getLocalTime(tz)
      const localTimeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`

      // =====================================================
      // EMPLOYEE AUTO-SIGNOUT - TWO MECHANISMS:
      // 1. At 6 PM local time - daily cleanup
      // 2. Any time - if signed in > 14 hours (safety net)
      // This is a reliable server-side cleanup that doesn't 
      // depend on the kiosk browser being open
      // =====================================================
      
      // Calculate cutoff for max duration (14 hours ago)
      const maxDurationHours = 14
      const maxDurationCutoff = new Date(Date.now() - maxDurationHours * 60 * 60 * 1000).toISOString()
      
      // Get all employees still signed in at this location
      const { data: activeEmployeeSignIns, error: empFetchError } = await supabase
        .from("employee_sign_ins")
        .select(`
          id,
          profile_id,
          sign_in_time,
          profiles!inner ( full_name, email )
        `)
        .eq("location_id", location.id)
        .is("sign_out_time", null)

      if (!empFetchError && activeEmployeeSignIns && activeEmployeeSignIns.length > 0) {
        // Filter employees to sign out:
        // - If 6 PM window (18:00-18:14): sign out ALL employees
        // - Otherwise: sign out only those signed in > 14 hours
        const is6PMWindow = hour === 18 && minute < 15
        
        const employeesToSignOut = is6PMWindow 
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
            const reason = is6PMWindow ? "6 PM daily cleanup" : `exceeded ${maxDurationHours}h max duration`
            
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

      // =====================================================
      // VISITOR AUTO-SIGNOUT at 11:45 PM (23:45-23:59 window)
      // =====================================================
      // Only sign out visitors if local time is in the 23:45–23:59 window
      if (hour !== 23 || minute < 45) {
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

      // Get active visitor sign-ins for this location with host info
      const { data: activeSignIns, error: fetchError } = await supabase
        .from("sign_ins")
        .select(`
          id,
          visitor_id,
          visitors!inner ( full_name, email, company ),
          host_id,
          hosts ( full_name, email )
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
          const host = signIn.hosts as { full_name: string; email: string } | null
          if (!host?.email) continue

          const visitor = signIn.visitors as { full_name: string; email: string; company: string | null } | null
          if (!visitor) continue

          if (!hostVisitors[host.email]) {
            hostVisitors[host.email] = {
              hostName: host.full_name,
              hostEmail: host.email,
              visitors: [],
            }
          }
          hostVisitors[host.email].visitors.push({
            name: visitor.full_name,
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
