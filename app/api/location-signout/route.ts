import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import nodemailer from "nodemailer"

export const maxDuration = 60

function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
    )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Load SMTP + company branding from the settings table (global rows). */
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
 * Manual, on-demand sign-out for a SINGLE location.
 *
 * Unlike /api/auto-signout (which only acts inside a configured time window and
 * loops every location), this endpoint immediately signs out ALL active
 * visitors and employees at ONE location, regardless of the current time. It is
 * designed to be called by an external scheduler (e.g. Windows Task Scheduler
 * running at 6 PM in that location's local timezone).
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>`.
 * Location: pass `?location=<id-or-name>` (query) or { location } in the body.
 */
async function handleLocationSignout(request: Request) {
    try {
        // ---- Auth ----
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

        // ---- Resolve the location identifier + options from query or body ----
        const url = new URL(request.url)
        let locationParam = url.searchParams.get("location") || url.searchParams.get("locationId")
        // dryRun (a.k.a. -WhatIf): report who WOULD be signed out without committing.
        const truthy = (v: unknown) => v === true || v === "true" || v === "1"
        let dryRun = truthy(url.searchParams.get("dryRun")) || truthy(url.searchParams.get("whatIf"))
        if (!locationParam && request.method === "POST") {
            const body = await request.json().catch(() => ({}))
            locationParam = body.location || body.locationId || body.locationName || null
            if (truthy(body.dryRun) || truthy(body.whatIf)) dryRun = true
        }
        if (!locationParam) {
            return NextResponse.json(
                { error: "Missing 'location' parameter (location id or name)." },
                { status: 400 },
            )
        }

        const supabase = createAdminClient()
        const now = new Date().toISOString()

        // Look up the location by id (uuid) or by name (case-insensitive exact match)
        const locationQuery = supabase.from("locations").select("id, name, timezone")
        const { data: locationRows } = UUID_RE.test(locationParam)
            ? await locationQuery.eq("id", locationParam)
            : await locationQuery.ilike("name", locationParam)

        if (!locationRows || locationRows.length === 0) {
            return NextResponse.json(
                { error: `No location found matching '${locationParam}'.` },
                { status: 404 },
            )
        }
        if (locationRows.length > 1) {
            return NextResponse.json(
                {
                    error: `Multiple locations match '${locationParam}'. Use the exact name or the location id.`,
                    matches: locationRows.map((l) => ({ id: l.id, name: l.name })),
                },
                { status: 400 },
            )
        }

        const location = locationRows[0]

        // ---- Sign out active EMPLOYEES at this location ----
        const { data: activeEmployees } = await supabase
            .from("employee_sign_ins")
            .select("id, sign_in_time, profiles ( full_name, email )")
            .eq("location_id", location.id)
            .is("sign_out_time", null)

        const employeeNames = (activeEmployees ?? []).map((e) => {
            const p = (Array.isArray(e.profiles) ? e.profiles[0] : e.profiles) as
                | { full_name: string | null; email: string | null }
                | null
            return p?.full_name || p?.email || "Unknown employee"
        })

        let employeesSignedOut = 0
        if (activeEmployees && activeEmployees.length > 0 && !dryRun) {
            const { error: empErr } = await supabase
                .from("employee_sign_ins")
                .update({ sign_out_time: now })
                .eq("location_id", location.id)
                .is("sign_out_time", null)
            if (!empErr) {
                employeesSignedOut = activeEmployees.length
                await supabase.from("audit_logs").insert({
                    action: "employee.auto_sign_out",
                    entity_type: "system",
                    description: `Manual end-of-day sign-out: ${employeesSignedOut} employee(s) at ${location.name}`,
                })
            }
        }

        // ---- Sign out active VISITORS at this location ----
        const { data: activeVisitors } = await supabase
            .from("sign_ins")
            .select(`
        id,
        visitors!inner ( first_name, last_name, company ),
        host_id,
        hosts ( name, email )
      `)
            .eq("location_id", location.id)
            .is("sign_out_time", null)

        const visitorNames = (activeVisitors ?? []).map((s) => {
            const v = (Array.isArray(s.visitors) ? s.visitors[0] : s.visitors) as
                | { first_name: string; last_name: string; company: string | null }
                | null
            return `${v?.first_name ?? ""} ${v?.last_name ?? ""}`.trim() || "Unknown visitor"
        })

        let visitorsSignedOut = 0
        if (activeVisitors && activeVisitors.length > 0 && !dryRun) {
            const { error: visErr } = await supabase
                .from("sign_ins")
                .update({ sign_out_time: now })
                .eq("location_id", location.id)
                .is("sign_out_time", null)
            if (!visErr) {
                visitorsSignedOut = activeVisitors.length
                await supabase.from("audit_logs").insert({
                    action: "visitor.auto_sign_out",
                    entity_type: "system",
                    description: `Manual end-of-day sign-out: ${visitorsSignedOut} visitor(s) at ${location.name}`,
                })
            }
        }

        // ---- Notify hosts of signed-out visitors (best effort; skipped on dry-run) ----
        let emailsSent = 0
        if (!dryRun && visitorsSignedOut > 0 && activeVisitors) {
            const smtp = await getSmtpSettings(supabase)
            if (smtp.host && smtp.user && smtp.pass) {
                const transporter = nodemailer.createTransport({
                    host: smtp.host,
                    port: smtp.port,
                    secure: smtp.port === 465,
                    auth: { user: smtp.user, pass: smtp.pass },
                })

                // Group visitors by host email so each host gets a single email.
                const hostVisitors: Record<string, {
                    hostName: string
                    hostEmail: string
                    visitors: { name: string; company: string | null }[]
                }> = {}

                for (const signIn of activeVisitors) {
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
                        hostVisitors[host.email] = { hostName: host.name, hostEmail: host.email, visitors: [] }
                    }
                    hostVisitors[host.email].visitors.push({ name: visitorName, company: visitor.company })
                }

                for (const hv of Object.values(hostVisitors)) {
                    try {
                        const visitorList = hv.visitors
                            .map((v) => `<li style="padding:4px 0;color:#333;">${v.name}${v.company ? ` <span style="color:#888;">(${v.company})</span>` : ""}</li>`)
                            .join("")
                        const htmlBody = `
                            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                                ${smtp.companyLogo ? `<img src="${smtp.companyLogo}" alt="${smtp.companyName}" style="height:40px;margin-bottom:24px;" />` : `<h2 style="margin-bottom:24px;color:#333;">${smtp.companyName}</h2>`}
                                <p style="font-size:14px;color:#333;">Hi ${hv.hostName},</p>
                                <p style="font-size:14px;color:#555;line-height:1.6;">
                                The following visitor${hv.visitors.length > 1 ? "s were" : " was"} automatically signed out at <strong>${location.name}</strong> at end of day:
                                </p>
                                <ul style="font-size:14px;line-height:1.8;padding-left:20px;margin:16px 0;">${visitorList}</ul>
                                <p style="font-size:13px;color:#888;line-height:1.5;">
                                This is an automated notification. If any of these visitors are still on-site, please contact [it_support@talusag.com](mailto:it_support@talusag.com) to have their sign-out time updated.
                                </p>
                                <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
                                <p style="font-size:11px;color:#aaa;">${smtp.companyName} Visitor Management</p>
                            </div>`
                        await transporter.sendMail({
                            from: `"${smtp.companyName}" <${smtp.fromEmail}>`,
                            to: hv.hostEmail,
                            subject: `${smtp.companyName} - Visitor${hv.visitors.length > 1 ? "s" : ""} Signed Out at ${location.name}`,
                            html: htmlBody,
                        })
                        emailsSent++
                    } catch (emailErr) {
                        console.error(`[Location Sign-out] Failed to email host ${hv.hostEmail}:`, emailErr)
                    }
                }
            }
        }

        // On a dry-run nothing is committed, so report the counts that WOULD apply.
        const visitorCount = dryRun ? visitorNames.length : visitorsSignedOut
        const employeeCount = dryRun ? employeeNames.length : employeesSignedOut

        return NextResponse.json({
            success: true,
            dryRun,
            location: { id: location.id, name: location.name, timezone: location.timezone },
            employeesSignedOut: employeeCount,
            visitorsSignedOut: visitorCount,
            emailsSent,
            employees: employeeNames,
            visitors: visitorNames,
            timestamp: now,
            message: dryRun
                ? `[DRY RUN] Would sign out ${visitorCount} visitor(s) and ${employeeCount} employee(s) at ${location.name}. No changes were made.`
                : `Signed out ${visitorCount} visitor(s) and ${employeeCount} employee(s) at ${location.name}.`,
        })
    } catch (error) {
        console.error("[Location Sign-out] Error:", error)
        return NextResponse.json({ error: "Failed to process location sign-out" }, { status: 500 })
    }
}

export async function POST(request: Request) {
    return handleLocationSignout(request)
}

// GET is supported too, so the endpoint can be triggered by simple tools.
export async function GET(request: Request) {
    return handleLocationSignout(request)
}
