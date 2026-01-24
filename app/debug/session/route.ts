import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = createClient()
  const { data } = await (await supabase).auth.getSession()

  return NextResponse.json({
    hasSession: !!data.session,
    user: data.session?.user ?? null,
  })
}
