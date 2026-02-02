import { NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { createClient } from "@/lib/supabase/server"

// Get SMTP settings from database or environment variables
async function getSmtpSettings() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .is("location_id", null)
    .in("key", ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_email", "company_name", "company_logo"])

  const settings: Record<string, string> = {}
  
  if (data && data.length > 0) {
    for (const setting of data) {
      settings[setting.key] = String(setting.value || "")
    }
  }

  // Fall back to environment variables if DB settings not found
  return {
    host: settings.smtp_host || process.env.SMTP_HOST || "",
    port: Number.parseInt(settings.smtp_port || process.env.SMTP_PORT || "587", 10),
    user: settings.smtp_user || process.env.SMTP_USER || "",
    pass: settings.smtp_pass || process.env.SMTP_PASS || "",
    fromEmail: settings.smtp_from_email || process.env.SMTP_FROM_EMAIL || settings.smtp_user || process.env.SMTP_USER || "",
    companyName: settings.company_name || "TalusAg",
    companyLogo: settings.company_logo || "",
  }
}

// Create reusable transporter
function createTransporter(host: string, port: number, user: string, pass: string) {
  if (!host || !user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      hostEmail, 
      hostName, 
      visitorName, 
      visitorCompany, 
      purpose, 
      badgeNumber, 
      locationName,
      notificationType = "arrived", // "arrived" | "completing_training"
      visitorTypeName,
      visitorPhotoUrl,
    } = body

    if (!hostEmail || !visitorName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const smtpSettings = await getSmtpSettings()
    const transporter = createTransporter(smtpSettings.host, smtpSettings.port, smtpSettings.user, smtpSettings.pass)

    if (!transporter || !smtpSettings.fromEmail) {
      console.log("[Notify Host] SMTP not configured, logging notification instead:")
      console.log(`  To: ${hostEmail}`)
      console.log(`  Visitor: ${visitorName} from ${visitorCompany || "N/A"}`)
      console.log(`  Type: ${notificationType}`)
      return NextResponse.json({ 
        success: true, 
        message: "SMTP not configured - notification logged only",
      })
    }

    const { companyName, companyLogo, fromEmail } = smtpSettings

    // Determine email content based on notification type
    const isTraining = notificationType === "completing_training"
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

    // Build the email HTML
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
                  <!-- Header -->
                  <tr>
                    <td style="background-color: ${isTraining ? "#d97706" : "#059669"}; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                      ${companyLogo ? `<img src="${companyLogo}" alt="${companyName}" style="max-height: 50px; margin-bottom: 15px;" />` : ""}
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">${emailTitle}</h1>
                    </td>
                  </tr>
                  <!-- Body -->
                  <tr>
                    <td style="background-color: #ffffff; padding: 30px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
                      <p style="font-size: 16px; margin: 0 0 20px 0; color: #111827;">Dear ${hostName || "Host"},</p>
                      <p style="font-size: 16px; margin: 0 0 25px 0; color: #374151;">${mainMessage}</p>
                      
                      <!-- Visitor Details Card -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                        <tr>
                          <td style="padding: 20px;">
                            <h3 style="margin: 0 0 15px 0; color: #059669; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Visitor Details</h3>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              ${visitorPhotoUrl ? `
                              <tr>
                                <td colspan="2" style="padding: 0 0 15px 0; text-align: center;">
                                  <img src="${visitorPhotoUrl}" alt="${visitorName}" style="width: 120px; height: 120px; border-radius: 8px; object-fit: cover; border: 3px solid #e5e7eb;" />
                                </td>
                              </tr>
                              ` : ""}
                              <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; width: 100px; vertical-align: top;">Name:</td>
                                <td style="padding: 10px 0; color: #111827; font-size: 14px; font-weight: 600;">${visitorName}</td>
                              </tr>
                              ${visitorCompany ? `
                              <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Company:</td>
                                <td style="padding: 10px 0; color: #111827; font-size: 14px;">${visitorCompany}</td>
                              </tr>
                              ` : ""}
                              ${purpose ? `
                              <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Purpose:</td>
                                <td style="padding: 10px 0; color: #111827; font-size: 14px;">${purpose}</td>
                              </tr>
                              ` : ""}
                              ${badgeNumber ? `
                              <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Badge #:</td>
                                <td style="padding: 10px 0; color: #111827; font-size: 14px; font-weight: 600;">${badgeNumber}</td>
                              </tr>
                              ` : ""}
                              ${locationName ? `
                              <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Location:</td>
                                <td style="padding: 10px 0; color: #111827; font-size: 14px;">${locationName}</td>
                              </tr>
                              ` : ""}
                            </table>
                          </td>
                        </tr>
                      </table>

                      <p style="font-size: 15px; color: #374151; margin: 25px 0 0 0; padding: 15px; background-color: ${isTraining ? "#fffbeb" : "#ecfdf5"}; border-radius: 6px; border-left: 4px solid ${isTraining ? "#d97706" : "#059669"};">${actionMessage}</p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
                      <p style="margin: 0; color: #9ca3af; font-size: 12px;">This is an automated message from ${companyName} Visitor Management System</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `

    // Send the email
    await transporter.sendMail({
      from: `"${companyName} Visitor Management" <${fromEmail}>`,
      to: hostEmail,
      subject: emailSubject,
      html: emailHtml,
      text: `Dear ${hostName || "Host"},\n\n${mainMessage}\n\nName: ${visitorName}\nCompany: ${visitorCompany || "Not specified"}\nPurpose: ${purpose || "Not specified"}\nBadge #: ${badgeNumber || "N/A"}\n${locationName ? `Location: ${locationName}\n` : ""}\n${actionMessage}\n\n- ${companyName} Visitor Management System`,
    })

    console.log(`[Notify Host] Email sent to ${hostEmail} for visitor ${visitorName}`)

    return NextResponse.json({ 
      success: true, 
      message: "Host notification email sent",
    })
  } catch (error) {
    console.error("[Notify Host] Error sending email:", error)
    return NextResponse.json(
      { error: "Failed to send notification email" },
      { status: 500 }
    )
  }
}
