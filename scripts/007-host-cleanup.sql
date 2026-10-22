-- 007-host-cleanup.sql
--
-- Purpose: tidy two host-picker entries QA flagged on Oct 21 2026:
--   1. "Dave Panish" appears twice in the kiosk and QR host lists.
--   2. "Caleb KlobeDev" (department IT) appears as a selectable host.
--
-- This script changes NOTHING as written. Part 1 is read-only. Part 2 is
-- commented out and only deactivates rows (is_active = false). It never
-- deletes, so sign-in history, bookings and audit logs keep pointing at the
-- original host row, and a row can be reactivated from Admin > Hosts.
--
-- Notes on the schema:
--   * hosts has no Entra column of its own. The Entra link is
--     hosts.profile_id -> profiles.azure_object_id, so Part 1 joins profiles.
--   * sign_ins.host_id and bookings.host_id reference hosts(id).
--
-- Does the Azure scheduled sync undo this? No:
--   * The sync never creates hosts rows. Hosts are only created from the
--     admin UI (Admin > Hosts, or the "Is host" toggle on Admin > Users).
--   * The sync only updates hosts rows linked by profile_id, and it only
--     ever sets is_active to FALSE (when the Entra account is disabled or
--     removed). It never sets is_active back to true.
--   * It does overwrite name, email, phone and department on a linked host
--     from Entra, so renaming a linked host here would not stick. That is
--     why Part 2 only touches is_active.
--   * If "Caleb KlobeDev" is a real Entra account, its PROFILE keeps
--     syncing (it stays a staff user who can log in), but its host row stays
--     inactive once deactivated, unless someone re-ticks "Is host" for that
--     user in Admin > Users.


-- =====================================================================
-- PART 1: read-only. Run this first and read the results.
-- =====================================================================

SELECT
    h.id,
    h.name,
    h.email,
    h.department,
    h.profile_id,
    p.email               AS profile_email,
    p.azure_object_id     AS entra_object_id,
    p.directory_status    AS entra_status,
    h.location_id,
    l.name                AS location_name,
    h.is_active,
    h.created_at,
    (SELECT count(*) FROM sign_ins s WHERE s.host_id = h.id) AS sign_in_count,
    (SELECT max(s.sign_in_time) FROM sign_ins s WHERE s.host_id = h.id) AS last_sign_in,
    (SELECT count(*) FROM bookings b WHERE b.host_id = h.id) AS booking_count
FROM hosts h
LEFT JOIN profiles  p ON p.id = h.profile_id
LEFT JOIN locations l ON l.id = h.location_id
WHERE h.name ILIKE '%dave%panish%'
   OR h.name ILIKE '%klobedev%'
   OR h.email ILIKE '%panish%'
   OR h.email ILIKE '%klobedev%'
ORDER BY h.name, h.created_at;

-- Also check the profiles side, to see whether KlobeDev is a real Entra
-- account (azure_object_id set, directory_status 'active') or a local one.
SELECT id, full_name, email, role, azure_object_id, directory_status, is_active, created_at
FROM profiles
WHERE full_name ILIKE '%klobedev%'
   OR email ILIKE '%klobedev%'
   OR full_name ILIKE '%dave%panish%'
   OR email ILIKE '%panish%'
ORDER BY full_name, created_at;


-- =====================================================================
-- PART 2: deactivate. Commented out on purpose.
-- =====================================================================
--
-- Which Dave Panish row to KEEP (first rule that separates them wins):
--   1. The row whose profile_id links to a profile with an entra_object_id.
--      The Azure sync keeps that row's name, email and department current;
--      an unlinked row goes stale.
--   2. Otherwise, the row with the most sign_in_count (then booking_count).
--      Deactivating the other row keeps its history, it just stops showing
--      in the pickers.
--   3. Otherwise, the oldest created_at.
-- Deactivate the other row. If the two rows have different emails, stop:
-- they may be two different people, and that needs Caleb's call.
--
-- Caleb KlobeDev: deactivate unless it is intentionally used as a test host.
-- Its sign_in history (if any) stays attached to the row.
--
-- To apply: replace each <...> with the id from Part 1, uncomment, and run.
-- Each statement is limited to one id and to rows that are still active.

-- BEGIN;
--
-- UPDATE hosts
--    SET is_active = false, updated_at = now()
--  WHERE id = '<DAVE_PANISH_DUPLICATE_HOST_ID>'
--    AND is_active = true;
--
-- UPDATE hosts
--    SET is_active = false, updated_at = now()
--  WHERE id = '<CALEB_KLOBEDEV_HOST_ID>'
--    AND is_active = true;
--
-- -- Expect exactly one active Dave Panish and no active KlobeDev:
-- SELECT id, name, email, is_active FROM hosts
--  WHERE name ILIKE '%dave%panish%' OR name ILIKE '%klobedev%'
--  ORDER BY name;
--
-- COMMIT;   -- or ROLLBACK; if the check above looks wrong
