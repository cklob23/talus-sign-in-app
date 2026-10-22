"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  Store,
  Users,
} from "lucide-react"
import { logAudit } from "@/lib/audit-log"
import { hasFeature } from "@/lib/tier"
import { formatNextSyncLabel } from "@/lib/sync/schedule"
import { SyncLiveCard } from "@/components/admin/sync-live-card"
import { SyncLogsTable } from "@/components/admin/sync-logs-table"
import type { SyncLogEntry } from "@/lib/sync/history"
import type { SyncRunDisplayStatus, SyncRunProvider } from "@/lib/sync/runs"

interface RampSettings {
  ramp_enabled: boolean
  ramp_client_id: string
  ramp_client_secret: string
  ramp_api_base_url: string
}

interface ScheduleSnapshot {
  frequency: string
  lastSync: string | null
  start: string
  dueNow: boolean
  nextAt: string | null
  scheduled: boolean
}

const SYNC_SCHEDULE_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "1h", label: "Every hour" },
  { value: "6h", label: "Every 6 hours" },
  { value: "12h", label: "Every 12 hours" },
  { value: "24h", label: "Daily (every 24 hours)" },
  { value: "168h", label: "Weekly" },
]

function formatLastSync(iso: string | null) {
  if (!iso) return "Never"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "Never"
  return date.toLocaleString()
}

export default function SyncPage() {
  const [rampConfig, setRampConfig] = useState<RampSettings>({
    ramp_enabled: false,
    ramp_client_id: "",
    ramp_client_secret: "",
    ramp_api_base_url: "https://api.ramp.com/developer/v1",
  })
  const [savingRamp, setSavingRamp] = useState(false)
  const [showRampSecret, setShowRampSecret] = useState(false)
  const [rampConfigResult, setRampConfigResult] = useState<{ success: boolean; message: string } | null>(null)

  const [microsoftSsoEnabled, setMicrosoftSsoEnabled] = useState(false)
  const [syncScheduleAzure, setSyncScheduleAzure] = useState("off")
  const [syncScheduleRamp, setSyncScheduleRamp] = useState("off")
  const [syncStartAzure, setSyncStartAzure] = useState("")
  const [syncStartRamp, setSyncStartRamp] = useState("")
  const [lastAzureSync, setLastAzureSync] = useState<string | null>(null)
  const [lastRampSync, setLastRampSync] = useState<string | null>(null)
  const [savingSyncSchedule, setSavingSyncSchedule] = useState(false)
  const [syncScheduleSuccess, setSyncScheduleSuccess] = useState<string | null>(null)
  const [syncScheduleError, setSyncScheduleError] = useState<string | null>(null)
  const [runningSyncAzure, setRunningSyncAzure] = useState(false)
  const [runningSyncRamp, setRunningSyncRamp] = useState(false)

  const [logs, setLogs] = useState<SyncLogEntry[]>([])
  const [active, setActive] = useState<SyncLogEntry[]>([])
  const [schedules, setSchedules] = useState<{ azure: ScheduleSnapshot; ramp: ScheduleSnapshot } | null>(null)
  const [providerFilter, setProviderFilter] = useState<SyncRunProvider | "all">("all")
  const [statusFilter, setStatusFilter] = useState<SyncRunDisplayStatus | "all">("all")
  const [logsLoading, setLogsLoading] = useState(true)
  const hadRunning = useRef(false)

  const loadConnectorSettings = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .is("location_id", null)
      .in("key", [
        "ramp_enabled",
        "ramp_client_id",
        "ramp_client_secret",
        "ramp_api_base_url",
        "microsoft_sso_enabled",
        "sync_schedule_azure",
        "sync_schedule_ramp",
        "sync_start_azure",
        "sync_start_ramp",
        "last_azure_sync",
        "last_ramp_sync",
      ])

    if (!data) return

    const loadedRamp: RampSettings = {
      ramp_enabled: false,
      ramp_client_id: "",
      ramp_client_secret: "",
      ramp_api_base_url: "https://api.ramp.com/developer/v1",
    }

    for (const setting of data) {
      if (setting.key === "ramp_enabled") loadedRamp.ramp_enabled = setting.value === true || setting.value === "true"
      if (setting.key === "ramp_client_id") loadedRamp.ramp_client_id = String(setting.value || "")
      if (setting.key === "ramp_client_secret") loadedRamp.ramp_client_secret = setting.value ? "••••••••" : ""
      if (setting.key === "ramp_api_base_url") {
        loadedRamp.ramp_api_base_url = String(setting.value || "https://api.ramp.com/developer/v1")
      }
      if (setting.key === "microsoft_sso_enabled") {
        setMicrosoftSsoEnabled(setting.value === true || setting.value === "true")
      }
      if (setting.key === "sync_schedule_azure") setSyncScheduleAzure(typeof setting.value === "string" ? setting.value : "off")
      if (setting.key === "sync_schedule_ramp") setSyncScheduleRamp(typeof setting.value === "string" ? setting.value : "off")
      if (setting.key === "sync_start_azure") setSyncStartAzure(typeof setting.value === "string" ? setting.value : "")
      if (setting.key === "sync_start_ramp") setSyncStartRamp(typeof setting.value === "string" ? setting.value : "")
      if (setting.key === "last_azure_sync") setLastAzureSync(typeof setting.value === "string" ? setting.value : null)
      if (setting.key === "last_ramp_sync") setLastRampSync(typeof setting.value === "string" ? setting.value : null)
    }
    setRampConfig(loadedRamp)
  }, [])

  const loadRuns = useCallback(async () => {
    const params = new URLSearchParams()
    if (providerFilter !== "all") params.set("provider", providerFilter)
    if (statusFilter !== "all") params.set("status", statusFilter)
    const res = await fetch(`/api/admin/sync/runs?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setLogsLoading(false)
      return false
    }
    const nextLogs = (data.logs || []) as SyncLogEntry[]
    const nextActive = (data.active || []) as SyncLogEntry[]
    setLogs(nextLogs)
    setActive(nextActive)
    if (data.schedules) setSchedules(data.schedules)
    if (data.schedules?.azure?.lastSync) setLastAzureSync(data.schedules.azure.lastSync)
    if (data.schedules?.ramp?.lastSync) setLastRampSync(data.schedules.ramp.lastSync)
    setLogsLoading(false)
    return nextActive.some((entry) => entry.status === "running" || entry.status === "queued")
  }, [providerFilter, statusFilter])

  useEffect(() => {
    loadConnectorSettings()
  }, [loadConnectorSettings])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    async function tick() {
      const running = await loadRuns()
      if (cancelled) return
      if (hadRunning.current && !running) {
        await loadConnectorSettings()
      }
      hadRunning.current = Boolean(running)
      timer = window.setTimeout(tick, running ? 2500 : 15000)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [loadRuns, loadConnectorSettings])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("sync_runs_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_runs" }, () => {
        loadRuns()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadRuns])

  async function saveRampSettings() {
    setSavingRamp(true)
    setRampConfigResult(null)
    const supabase = createClient()
    const keysToSave: (keyof RampSettings)[] = ["ramp_enabled", "ramp_client_id", "ramp_client_secret", "ramp_api_base_url"]
    for (const key of keysToSave) {
      const value = rampConfig[key]
      if (key === "ramp_client_secret" && value === "••••••••") continue

      const { data: existing } = await supabase
        .from("settings")
        .select("id")
        .eq("key", key)
        .is("location_id", null)
        .single()

      if (existing) {
        await supabase.from("settings").update({ value }).eq("key", key).is("location_id", null)
      } else {
        await supabase.from("settings").insert({ key, value, location_id: null })
      }
    }

    await logAudit({
      action: "settings.updated",
      entityType: "settings",
      description: "Ramp API settings updated",
      metadata: { ramp_api_base_url: rampConfig.ramp_api_base_url },
    })

    setRampConfigResult({ success: true, message: "Ramp API settings saved successfully." })
    setTimeout(() => setRampConfigResult(null), 3000)
    setSavingRamp(false)
  }

  async function saveSyncScheduleSettings() {
    setSavingSyncSchedule(true)
    setSyncScheduleSuccess(null)
    setSyncScheduleError(null)

    try {
      const supabase = createClient()
      const settingsToSave = [
        { key: "sync_schedule_azure", value: syncScheduleAzure },
        { key: "sync_schedule_ramp", value: syncScheduleRamp },
        { key: "sync_start_azure", value: syncStartAzure },
        { key: "sync_start_ramp", value: syncStartRamp },
      ]

      for (const setting of settingsToSave) {
        const { data: existing } = await supabase
          .from("settings")
          .select("id")
          .eq("key", setting.key)
          .is("location_id", null)
          .single()

        if (existing) {
          await supabase.from("settings").update({ value: setting.value }).eq("id", existing.id)
        } else {
          await supabase.from("settings").insert({ key: setting.key, value: setting.value, location_id: null })
        }
      }

      await logAudit({
        action: "settings.sync_schedule_updated",
        entityType: "settings",
        description: `Sync schedules updated: Azure=${syncScheduleAzure} starting ${syncStartAzure || "immediately"}, Ramp=${syncScheduleRamp} starting ${syncStartRamp || "immediately"}`,
      })

      setSyncScheduleSuccess("Sync schedules saved successfully.")
      setTimeout(() => setSyncScheduleSuccess(null), 3000)
      await loadRuns()
    } catch {
      setSyncScheduleError("Failed to save sync schedules.")
    } finally {
      setSavingSyncSchedule(false)
    }
  }

  async function handleManualSync(type: "azure" | "ramp") {
    if (type === "azure") setRunningSyncAzure(true)
    else setRunningSyncRamp(true)
    setSyncScheduleError(null)
    setSyncScheduleSuccess(null)

    const label = type === "azure" ? "Entra ID" : "Ramp"
    await logAudit({
      action: type === "azure" ? "sync.azure_started" : "sync.ramp_started",
      entityType: "sync",
      description: `${label} sync started manually`,
      metadata: { trigger: "manual" },
    })

    try {
      const res = await fetch("/api/admin/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: type }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errMsg = data.error || `${label} sync failed.`
        setSyncScheduleError(errMsg)
        return
      }
      const msg =
        type === "azure"
          ? `${label} sync complete: ${data.created || 0} created, ${data.updated || 0} updated, ${data.deactivated || 0} deactivated.`
          : `${label} sync complete: ${data.synced || 0} synced, ${data.deactivated || 0} deactivated.`
      setSyncScheduleSuccess(msg)
      if (type === "azure") setLastAzureSync(new Date().toISOString())
      else setLastRampSync(new Date().toISOString())
      await loadRuns()
      await loadConnectorSettings()
    } catch (err) {
      setSyncScheduleError(err instanceof Error ? err.message : "Sync failed.")
    } finally {
      if (type === "azure") setRunningSyncAzure(false)
      else setRunningSyncRamp(false)
    }
  }

  const azureLast = schedules?.azure.lastSync ?? lastAzureSync
  const rampLast = schedules?.ramp.lastSync ?? lastRampSync
  const azureNext = formatNextSyncLabel(syncScheduleAzure, azureLast, syncStartAzure)
  const rampNext = formatNextSyncLabel(syncScheduleRamp, rampLast, syncStartRamp)
  const somethingRunning = active.some((entry) => entry.status === "running" || entry.status === "queued")

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Sync</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Connector configuration, schedules, and live run history
        </p>
      </div>

      {active.length > 0 && (
        <div className="space-y-3">
          {active.map((run) => (
            <SyncLiveCard key={run.id} run={run} />
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Entra ID</p>
            <p className="text-sm">Last sync: {formatLastSync(azureLast)}</p>
            <p className="text-sm text-muted-foreground">Next scheduled: {azureNext}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ramp</p>
            <p className="text-sm">Last sync: {formatLastSync(rampLast)}</p>
            <p className="text-sm text-muted-foreground">Next scheduled: {rampNext}</p>
          </CardContent>
        </Card>
      </div>

      {syncScheduleSuccess && (
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          {syncScheduleSuccess}
        </div>
      )}
      {syncScheduleError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {syncScheduleError}
        </div>
      )}

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Microsoft Entra
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Sync user profiles from Microsoft Entra ID. SSO credentials stay in{" "}
            <Link href="/admin/settings" className="underline">
              Settings
            </Link>
            . The hourly cron only runs this provider when the frequency below says it is due.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
          {!hasFeature("ssoIntegration") ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Enable the SSO Integration add-on to connect Entra ID.
            </p>
          ) : !microsoftSsoEnabled ? (
            <p className="text-xs text-muted-foreground italic">
              Requires Microsoft SSO to be configured and enabled in Settings.
            </p>
          ) : (
            <>
              <ScheduleFields
                frequency={syncScheduleAzure}
                start={syncStartAzure}
                lastSync={azureLast}
                onFrequency={setSyncScheduleAzure}
                onStart={setSyncStartAzure}
              />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Button variant="outline" size="sm" asChild className="bg-transparent w-fit">
                  <Link href="/admin/users">Select users to import</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  disabled={runningSyncAzure || somethingRunning}
                  onClick={() => handleManualSync("azure")}
                >
                  {runningSyncAzure ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Sync Now
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {hasFeature("vendorManagement") ? (
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Store className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Ramp Integration
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Configure your Ramp API credentials for vendor synchronization.
              You can use either an OAuth2 client (Client ID + Secret) or set RAMP_API_TOKEN as an environment variable.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-6">
            {rampConfigResult && (
              <div className={`rounded-lg border p-3 text-sm ${rampConfigResult.success
                ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                : "border-destructive/50 bg-destructive/10 text-destructive"
                }`}>
                {rampConfigResult.message}
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <Label className="text-sm">Enable Ramp Integration</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">Connect to Ramp to sync vendors automatically</p>
              </div>
              <Switch
                checked={rampConfig.ramp_enabled}
                onCheckedChange={(checked) => setRampConfig((prev) => ({ ...prev, ramp_enabled: checked }))}
              />
            </div>

            {rampConfig.ramp_enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ramp_client_id">Client ID</Label>
                  <Input
                    id="ramp_client_id"
                    value={rampConfig.ramp_client_id}
                    onChange={(e) => setRampConfig((prev) => ({ ...prev, ramp_client_id: e.target.value }))}
                    placeholder="ramp_client_..."
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ramp_client_secret">Client Secret</Label>
                  <div className="relative">
                    <Input
                      id="ramp_client_secret"
                      type={showRampSecret ? "text" : "password"}
                      value={rampConfig.ramp_client_secret}
                      onChange={(e) => setRampConfig((prev) => ({ ...prev, ramp_client_secret: e.target.value }))}
                      placeholder="Enter client secret"
                      className="font-mono text-sm pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowRampSecret(!showRampSecret)}
                    >
                      {showRampSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The secret is stored encrypted in your database. Leave unchanged to keep the existing value.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ramp_api_base_url">API Base URL</Label>
                  <Input
                    id="ramp_api_base_url"
                    value={rampConfig.ramp_api_base_url}
                    onChange={(e) => setRampConfig((prev) => ({ ...prev, ramp_api_base_url: e.target.value }))}
                    placeholder="https://api.ramp.com/developer/v1"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use <code className="bg-muted px-1 py-0.5 rounded text-xs">https://demo-api.ramp.com/developer/v1</code> for sandbox/testing.
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button onClick={saveRampSettings} disabled={savingRamp}>
                {savingRamp ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Ramp Settings"
                )}
              </Button>
            </div>

            {rampConfig.ramp_enabled && (
              <div className="rounded-lg border p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-medium">Ramp Vendor Sync</h4>
                  <p className="text-xs text-muted-foreground">
                    Sync the vendor list from Ramp for the kiosk company dropdown. Vendors missing upstream stay deactivated.
                  </p>
                </div>
                <ScheduleFields
                  frequency={syncScheduleRamp}
                  start={syncStartRamp}
                  lastSync={rampLast}
                  onFrequency={setSyncScheduleRamp}
                  onStart={setSyncStartRamp}
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
                    disabled={runningSyncRamp || somethingRunning}
                    onClick={() => handleManualSync("ramp")}
                  >
                    {runningSyncRamp ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        Sync Now
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Store className="w-5 h-5 text-muted-foreground" />
              Ramp Integration
              <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <Lock className="w-3.5 h-3.5" /> Add-on
              </span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Enable the Vendor Management add-on or upgrade to Enterprise to connect with Ramp for vendor synchronization
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={saveSyncScheduleSettings} disabled={savingSyncSchedule}>
          {savingSyncSchedule ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Sync Schedules
        </Button>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <RefreshCw className="w-5 h-5" />
            Sync logs
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Recent cron and manual runs. Expand a row to see error details.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {logsLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading sync history...</p>
          ) : (
            <SyncLogsTable
              logs={logs}
              provider={providerFilter}
              status={statusFilter}
              onProviderChange={setProviderFilter}
              onStatusChange={setStatusFilter}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ScheduleFields({
  frequency,
  start,
  lastSync,
  onFrequency,
  onStart,
}: {
  frequency: string
  start: string
  lastSync: string | null
  onFrequency: (value: string) => void
  onStart: (value: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Label className="text-sm w-28 shrink-0">Frequency</Label>
        <Select value={frequency} onValueChange={onFrequency}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SYNC_SCHEDULE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {frequency !== "off" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Label className="text-sm w-28 shrink-0">Start Date</Label>
          <Input
            type="datetime-local"
            value={start}
            onChange={(e) => onStart(e.target.value)}
            className="w-full sm:w-56"
          />
          {start && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={() => onStart("")}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {frequency !== "off" && (
        <p className="text-xs text-muted-foreground pl-0 sm:pl-28">
          Next sync: {formatNextSyncLabel(frequency, lastSync, start)}
        </p>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>Last synced: {formatLastSync(lastSync)}</span>
      </div>
    </div>
  )
}
