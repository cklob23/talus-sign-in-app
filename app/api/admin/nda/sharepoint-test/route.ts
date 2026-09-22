import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { testSharePointConnection } from "@/lib/sharepoint"

async function requireAdmin() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
        return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
    }
    return { ok: true as const }
}

/** Verifies the configured SharePoint site + folder are reachable and writable. */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    let body: { siteUrl?: string; folderPath?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const siteUrl = body.siteUrl?.trim()
    if (!siteUrl) return NextResponse.json({ ok: false, error: "A SharePoint site URL is required." }, { status: 400 })

    const result = await testSharePointConnection({ siteUrl, folderPath: body.folderPath?.trim() || "Signed NDAs" })
    return NextResponse.json(result)
}
