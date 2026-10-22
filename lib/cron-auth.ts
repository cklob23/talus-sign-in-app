import { NextResponse } from "next/server"

/**
 * Fail closed: if CRON_SECRET is unset, refuse the request.
 * Production on Render is not driven by vercel.json, so this secret
 * must be set on the Render service and sent by whatever scheduler hits
 * /api/auto-signout and /api/cron/scheduled-sync.
 */
export function requireCronSecret(request: Request): NextResponse | null {
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
  return null
}
