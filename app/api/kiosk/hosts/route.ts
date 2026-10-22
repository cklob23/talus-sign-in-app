import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/server"
import { requireKioskContext } from "@/lib/kiosk-auth"
import { KIOSK_HOST_SELECT, listActiveHosts } from "@/lib/active-hosts"

export async function GET(request: Request) {
  const auth = await requireKioskContext(request)
  if (!auth.ok) return auth.response

  const result = await listActiveHosts(getAdminClient(), KIOSK_HOST_SELECT)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ hosts: result.hosts })
}
