import { NextResponse } from "next/server"
import { getTenant } from "@/lib/tenant"

/**
 * GET /api/tenant
 * Returns this instance's tenant info (plan, addons, status).
 * Used by the kiosk and other client components to load plan features.
 */
export async function GET() {
  const tenant = await getTenant()

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  return NextResponse.json({ tenant })
}
