import { type NextRequest, NextResponse } from "next/server"
import { createClient, getAdminClient } from "@/lib/supabase/server"
import { NDA_BUCKET } from "@/lib/nda"

/** Only signed-in admins may manage NDA documents. */
async function requireAdmin() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

    const { data: profile } = await supabase.from("profiles").select("id, role, full_name").eq("id", user.id).maybeSingle()
    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
        return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
    }
    return { ok: true as const, profile }
}

/** Lists every NDA version, newest first, for the admin settings UI. */
export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const admin = getAdminClient()
    const { data, error } = await admin
        .from("nda_documents")
        .select("id, location_id, version, title, file_name, byte_size, is_current, created_at, locations(name)")
        .order("created_at", { ascending: false })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ documents: data ?? [] })
}

/**
 * Uploads a new NDA version.
 *
 * Never overwrites: each upload becomes a new immutable version so existing
 * acknowledgements stay bound to the exact text their signer read.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    let form: FormData
    try {
        form = await request.formData()
    } catch {
        return NextResponse.json({ error: "Invalid upload" }, { status: 400 })
    }

    const file = form.get("file")
    const title = String(form.get("title") ?? "").trim() || "Non-Disclosure Agreement"
    const rawLocationId = String(form.get("locationId") ?? "").trim()
    const locationId = rawLocationId && rawLocationId !== "all" ? rawLocationId : null

    if (!(file instanceof File)) {
        return NextResponse.json({ error: "A PDF file is required" }, { status: 400 })
    }
    if (file.type !== "application/pdf") {
        return NextResponse.json({ error: "The NDA must be a PDF" }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "The PDF must be 10MB or smaller" }, { status: 400 })
    }

    const admin = getAdminClient()

    // Next version number for this scope.
    const versionQuery = admin.from("nda_documents").select("version").order("version", { ascending: false }).limit(1)
    const { data: latest } = locationId
        ? await versionQuery.eq("location_id", locationId).maybeSingle()
        : await versionQuery.is("location_id", null).maybeSingle()
    const nextVersion = (latest?.version ?? 0) + 1

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60)
    const storagePath = `templates/${locationId ?? "global"}/v${nextVersion}-${Date.now()}-${safeName}`

    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error: uploadError } = await admin.storage
        .from(NDA_BUCKET)
        .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false })
    if (uploadError) {
        console.log("[v0] NDA template upload failed:", uploadError.message)
        return NextResponse.json({ error: "Could not store the PDF" }, { status: 500 })
    }

    // Retire the previous current version for this scope before promoting the new
    // one, so exactly one row is ever current.
    const retire = admin.from("nda_documents").update({ is_current: false }).eq("is_current", true)
    if (locationId) await retire.eq("location_id", locationId)
    else await retire.is("location_id", null)

    const { data: inserted, error: insertError } = await admin
        .from("nda_documents")
        .insert({
            location_id: locationId,
            version: nextVersion,
            title,
            storage_path: storagePath,
            file_name: file.name,
            byte_size: file.size,
            is_current: true,
            uploaded_by: auth.profile.id,
        })
        .select("id, version, title, created_at")
        .single()

    if (insertError || !inserted) {
        await admin.storage.from(NDA_BUCKET).remove([storagePath])
        console.log("[v0] NDA document insert failed:", insertError?.message)
        return NextResponse.json({ error: "Could not save the NDA" }, { status: 500 })
    }

    await admin.from("audit_logs").insert({
        user_id: auth.profile.id,
        action: "nda.uploaded",
        entity_type: "nda",
        entity_id: inserted.id,
        description: `Uploaded NDA "${title}" version ${nextVersion}`,
        metadata: { location_id: locationId, version: nextVersion, file_name: file.name },
    })

    return NextResponse.json({ success: true, document: inserted })
}
