import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { getBrandingSettings } from "@/lib/branding"
import { buildCheckinUrl } from "@/lib/qr-code"
import { buildPosterPdf } from "@/lib/poster-pdf"

export const dynamic = "force-dynamic"

/**
 * Download a location's sign-in poster as a print-ready A4 PDF.
 *
 * Admin-only, matching the poster page: the file embeds a live check-in token,
 * so anyone holding it can sign visitors in.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ locationId: string }> }) {
    const { locationId } = await params

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const admin = createAdminClient()
    const [{ data: location }, { data: code }, branding] = await Promise.all([
        admin.from("locations").select("id, name").eq("id", locationId).single(),
        admin
            .from("location_qr_codes")
            .select("token")
            .eq("location_id", locationId)
            .eq("is_active", true)
            .maybeSingle(),
        getBrandingSettings(),
    ])

    if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 })
    if (!code) {
        return NextResponse.json({ error: "This location has no active QR code yet." }, { status: 409 })
    }

    // Match the origin the admin is actually using, so the encoded link resolves.
    const headerList = await headers()
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? ""
    const proto = headerList.get("x-forwarded-proto") ?? "https"
    const checkinUrl = buildCheckinUrl(host ? `${proto}://${host}` : "", code.token)

    // The footer logo is optional: a fetch failure must not break the download,
    // so fall back to the built-in Talus mark instead.
    let logo: { bytes: Uint8Array; type: "png" | "jpg" } | null = null
    if (branding.companyLogo) {
        try {
            const res = await fetch(branding.companyLogo)
            if (res.ok) {
                const contentType = res.headers.get("content-type") ?? ""
                const type = contentType.includes("png")
                    ? "png"
                    : contentType.includes("jpeg") || contentType.includes("jpg")
                        ? "jpg"
                        : null
                if (type) logo = { bytes: new Uint8Array(await res.arrayBuffer()), type }
            }
        } catch {
            logo = null
        }
    }

    const pdf = await buildPosterPdf({
        locationName: location.name,
        checkinUrl,
        companyName: branding.companyName,
        logo,
    })

    const slug = location.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")

    return new NextResponse(Buffer.from(pdf), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="sign-in-poster-${slug || "location"}.pdf"`,
            // Tokens can be rotated, so never let a stale poster be cached.
            "Cache-Control": "no-store",
        },
    })
}
