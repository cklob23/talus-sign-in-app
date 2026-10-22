import { NextResponse } from "next/server"
import { requireAdminApiUser } from "@/lib/admin-auth"
import { hasPermission } from "@/lib/permissions"
import { createAdminClient } from "@/lib/supabase/server"
import { executeProviderSync } from "@/lib/sync/execute"
import type { SyncRunProvider } from "@/lib/sync/runs"

async function upsertSetting(
  adminClient: ReturnType<typeof createAdminClient>,
  key: string,
  value: string,
) {
  const { data: existing } = await adminClient
    .from("settings")
    .select("id")
    .eq("key", key)
    .is("location_id", null)
    .maybeSingle()

  if (existing) {
    await adminClient.from("settings").update({ value }).eq("id", existing.id)
  } else {
    await adminClient.from("settings").insert({ key, value, location_id: null })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiUser()
  if (!auth.ok) return auth.response
  if (!hasPermission(auth.user.permissions, "settings")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const provider: SyncRunProvider | null =
    body.provider === "azure" || body.provider === "ramp" ? body.provider : null
  if (!provider) {
    return NextResponse.json({ error: "provider must be azure or ramp" }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const out = await executeProviderSync(adminClient, {
    provider,
    trigger: "manual",
    dryRun: false,
    syncPhotos: false,
  })

  if (!out.ok || !out.result) {
    const message = out.error || `${provider} sync failed`
    await adminClient.from("audit_logs").insert({
      action: provider === "azure" ? "sync.azure_failed" : "sync.ramp_failed",
      entity_type: "sync",
      user_id: auth.user.userId,
      description: message,
    })
    return NextResponse.json({ error: message, runId: out.runId }, { status: 500 })
  }

  const result = out.result
  const nowIso = new Date().toISOString()
  await upsertSetting(
    adminClient,
    provider === "azure" ? "last_azure_sync" : "last_ramp_sync",
    nowIso,
  )

  const label = provider === "azure" ? "Azure AD" : "Ramp"
  const created = "created" in result ? result.created : 0
  const updated = "updated" in result ? result.updated : 0
  const description =
    provider === "azure"
      ? `${label} sync complete: ${created} created, ${updated} updated, ${result.deactivated} deactivated${result.errors.length ? `, ${result.errors.length} errors` : ""}.`
      : `${label} sync complete: ${result.synced} synced, ${result.deactivated} deactivated${result.errors.length ? `, ${result.errors.length} errors` : ""}.`

  await adminClient.from("audit_logs").insert({
    action: provider === "azure" ? "sync.azure_completed" : "sync.ramp_completed",
    entity_type: "sync",
    user_id: auth.user.userId,
    description,
  })

  return NextResponse.json({
    success: true,
    runId: out.runId,
    provider,
    synced: result.synced,
    total: result.total,
    created,
    updated,
    deactivated: result.deactivated,
    errors: result.errors,
  })
}
