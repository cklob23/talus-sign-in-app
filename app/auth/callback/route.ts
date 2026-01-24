// app/auth/callback/route.ts
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")

  if (code) {
    const supabase = createClient()
    await (await supabase).auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_SITE_URL}/admin`
  )
}
