# Render cron jobs

Production is the dashboard-managed web service `talus-sign-in-app` (`srv-d5t7dkd6ubrc73avi9og`) in the Talus Ag workspace, Oregon. `vercel.json` cron entries are not used.

The cron services live in `render.yaml`. They do not rebuild the Next app. Each run curls the private service URL with `Authorization: Bearer $CRON_SECRET` and exits.

| Service | Schedule (UTC) | Endpoint | curl `--max-time` |
| --- | --- | --- | --- |
| `talus-auto-signout` | every 15 minutes | `/api/auto-signout` | 120s |
| `talus-scheduled-sync` | hourly at minute 0 | `/api/cron/scheduled-sync` | 900s |
| `talus-reports` | every 15 minutes | `POST /api/cron/reports` (also runs booking invites) | 120s |

`TARGET_URL` is the private hostname: `http://talus-sign-in-app-qt7b:10000`. All crons fail closed if `CRON_SECRET` is unset on the web service.

## Reports and booking invites

The dashboard cron `talus-reports` can only call `POST /api/cron/reports`. That endpoint now also runs the booking-invite job in the same request. Booking invites and scheduled reports run independently: if one throws, the other still runs. The JSON body is `{ bookingInvites, reports }`. HTTP status is non-2xx if either job failed, so `curl -f` still flags failures.

`/api/cron/booking-invites` still works on its own. Claim/sent markers (`invite_status` scheduled → sending → sent) keep a later command change that hits both URLs from double-sending.

Create the jobs from the Blueprint or by hand in the dashboard. Attach env group `talus-cron` (`CRON_SECRET` sync:false, `TARGET_URL` as above). The cron process only needs those two values. Provider credentials stay on the web service.

## Hourly scheduled-sync

`GET`/`POST` `/api/cron/scheduled-sync` reads global settings (`location_id` is null):

| Setting | Role |
| --- | --- |
| `sync_schedule_azure` / `sync_schedule_ramp` | `off`, `1h`, `6h`, `12h`, `24h`, `168h` |
| `sync_start_azure` / `sync_start_ramp` | optional start instant; future dates skip |
| `last_azure_sync` / `last_ramp_sync` | last successful write (not updated on dry run) |

Due logic: schedule must be a known interval; start date must have passed; if `last_*_sync` is empty the provider is due; otherwise enough time must have elapsed since the last run.

Providers run in parallel and independently. An Azure failure does not skip Ramp, and the other way around. The JSON body always includes `results.azure` and `results.ramp`.

Audit rows (skipped when `dryRun=1`):

| `audit_logs.action` | When |
| --- | --- |
| `scheduled_sync.azure` | Azure finished (including per-user errors counted in the description) |
| `scheduled_sync.azure_error` | Azure threw before completing |
| `scheduled_sync.ramp` | Ramp finished |
| `scheduled_sync.ramp_error` | Ramp threw before completing |

### Safe production test

Still requires `Authorization: Bearer $CRON_SECRET`.

- `?provider=azure` or `?provider=ramp` runs only that provider and ignores due/off checks.
- `?dryRun=1` (or `dryRun=true`) fetches from the provider and reports counts but does **not** upsert, deactivate, write `last_*_sync`, or insert `audit_logs`.

```bash
curl -fsS --max-time 900 \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$TARGET_URL/api/cron/scheduled-sync?provider=azure&dryRun=1"

curl -fsS --max-time 900 \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$TARGET_URL/api/cron/scheduled-sync?provider=ramp&dryRun=1"
```

Expect HTTP 200 and `"dryRun": true` with `results.<provider>.ran: true` and no new `audit_logs` rows.

### Env vars (do not print values)

Shared by both syncs on the **web** service:

- `CRON_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Azure / Entra (first match wins):

- Settings rows when Microsoft SSO is enabled: `azure_tenant_id`, `azure_client_id`, `azure_client_secret`
- or process env: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (aliases `AZURE_AD_*` accepted)
- optional fallback: `SUPABASE_ACCESS_TOKEN` (Supabase Management API)

Ramp:

- `RAMP_API_TOKEN` **or** `RAMP_CLIENT_ID` + `RAMP_CLIENT_SECRET`
- optional `RAMP_API_BASE` (default `https://api.ramp.com/developer/v1`)

Password-reset emails also require `NEXT_PUBLIC_SITE_URL` on the web service (no Vercel URL or Origin fallback).

### Behavior change: Ramp removals

Scheduled Ramp sync used to upsert only. After a successful non-empty fetch, local vendors with a `ramp_vendor_id` that is missing from the latest Ramp list are set `is_active=false`. Vendors created only in this app (`ramp_vendor_id` null) are left alone. Ramp's own `is_active=false` is still copied on upsert.

Entra already deactivated directory-managed profiles missing from Graph. That sweep is unchanged, but upserts are now pooled and `auth.admin.listUsers` is paged so existing auth users past the first page are reused.

## Validation after deploy

1. Confirm `talus-auto-signout`, `talus-scheduled-sync`, and `talus-reports` exist in Oregon, starter plan, env group `talus-cron`.
2. Trigger a run of `talus-scheduled-sync` (or wait for the hour). Open **Logs**.
3. The curl line must finish with HTTP 200. The JSON includes `results.azure` and `results.ramp`. `ran: false` with `reason: "not_due"` is expected when that schedule is off or the interval has not elapsed.
4. In Supabase SQL:

```sql
select action, description, created_at
from audit_logs
where action like 'scheduled_sync.%'
order by created_at desc
limit 20;
```

A healthy pair of runs shows `scheduled_sync.azure` and `scheduled_sync.ramp`. Failures show `scheduled_sync.azure_error` and/or `scheduled_sync.ramp_error` without blocking the other provider.

5. Optional: the dry-run curls above. Confirm the log JSON has counts and the query in step 4 did not gain new rows.
6. `talus-auto-signout` logs: HTTP 200 from `/api/auto-signout` within 120s. Each location uses its override when set, otherwise the global employee 18:00 / visitor 23:45 settings, in that location's timezone. After `scripts/015-location-auto-signout.sql`, confirm US sites are America/Chicago, Kenya sites are Africa/Nairobi, and Spain Site is Europe/Madrid.
7. `talus-reports` logs: HTTP 200 from `POST /api/cron/reports` within 120s. The JSON includes `bookingInvites` and `reports`.
