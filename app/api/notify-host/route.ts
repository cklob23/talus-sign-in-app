import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { hostEmail, hostName, visitorName, visitorCompany, purpose, badgeNumber } = body

    if (!hostEmail || !visitorName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // In a production environment, you would integrate with an email service like:
    // - Resend (resend.com)
    // - SendGrid
    // - AWS SES
    // - Postmark
    // 
    // For now, we log the notification details
    console.log("[v0] Host Notification Email would be sent:")
    console.log(`  To: ${hostEmail}`)
    console.log(`  Subject: Visitor Arrival - ${visitorName}`)
    console.log(`  Body:`)
    console.log(`    Dear ${hostName},`)
    console.log(``)
    console.log(`    Your visitor has arrived:`)
    console.log(`    - Name: ${visitorName}`)
    console.log(`    - Company: ${visitorCompany || "Not specified"}`)
    console.log(`    - Purpose: ${purpose || "Not specified"}`)
    console.log(`    - Badge Number: ${badgeNumber}`)
    console.log(``)
    console.log(`    Please meet them at the reception area.`)

    // Return success - in production, this would await the email send
    return NextResponse.json({ 
      success: true, 
      message: "Host notification logged (email service not configured)",
      notification: {
        to: hostEmail,
        subject: `Visitor Arrival - ${visitorName}`,
        visitorName,
        visitorCompany,
        purpose,
        badgeNumber,
      }
    })
  } catch (error) {
    console.error("[v0] Error in notify-host API:", error)
    return NextResponse.json(
      { error: "Failed to process notification" },
      { status: 500 }
    )
  }
}
