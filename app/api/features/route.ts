import { NextResponse } from "next/server"
import { isNdaFeatureEnabled } from "@/lib/nda-flag"

/** Client-safe feature flags. No secrets. */
export async function GET() {
  return NextResponse.json({
    ndaEnabled: isNdaFeatureEnabled(),
  })
}
