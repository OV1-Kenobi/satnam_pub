-- ============================================================================
-- ADMIN ACCOUNT CONTROL - VERIFICATION AND ROLLBACK UTILITIES
-- ============================================================================
-- Purpose: SQL queries for verifying admin account operations and rollback status
--
-- Usage: Run these queries in Supabase SQL Editor to audit and verify
-- admin account control operations
--
-- Author: Admin Account Control System - Phase 1
-- Date: 2024-12-20
-- ============================================================================

-- ============================================================================
-- 1. PENDING REMOVALS - Accounts awaiting confirmation or in-progress
-- ============================================================================
-- Shows all account removal requests that are not yet completed

SELECT
    id AS removal_log_id,
    admin_type,
    target_account_type,
    removal_reason,
    status,
    requested_at,
    confirmed_at,
    executed_at,
    rollback_expires_at,
    CASE
        WHEN rollback_expires_at > NOW() THEN '✅ Rollback Available'
        WHEN rollback_expires_at IS NULL THEN '⚠️ No Backup'
        ELSE '❌ Rollback Expired'
    END AS rollback_status
FROM public.admin_account_removal_log
WHERE status IN ('pending', 'confirmed', 'executing')
ORDER BY requested_at DESC
LIMIT 50;

-- ============================================================================
-- 2. COMPLETED REMOVALS WITH ROLLBACK WINDOW
-- ============================================================================
-- Shows completed removals that can still be rolled back

SELECT
    id AS removal_log_id,
    admin_type,
    target_account_type,
    removal_reason,
    status,
    completed_at,
    rollback_expires_at,
    rollback_executed,
    records_deleted,
    EXTRACT(DAY FROM (rollback_expires_at - NOW())) AS days_until_expiry
FROM public.admin_account_removal_log
WHERE status = 'completed'
  AND rollback_executed = FALSE
  AND rollback_expires_at > NOW()
ORDER BY rollback_expires_at ASC
LIMIT 50;

-- ============================================================================
-- 3. FAILED REMOVALS - Errors to investigate
-- ============================================================================

SELECT
    id AS removal_log_id,
    admin_user_duid,
    admin_type,
    target_user_duid,
    removal_reason,
    status,
    error_message,
    requested_at,
    executed_at
FROM public.admin_account_removal_log
WHERE status = 'failed'
ORDER BY requested_at DESC
LIMIT 20;

-- ============================================================================
-- 4. ROLLED BACK ACCOUNTS - Restored from backup
-- ============================================================================

SELECT
    id AS removal_log_id,
    admin_type,
    target_account_type,
    removal_reason,
    rollback_executed_at,
    rollback_executed_by,
    rollback_reason,
    records_deleted AS original_records_deleted
FROM public.admin_account_removal_log
WHERE rollback_executed = TRUE
ORDER BY rollback_executed_at DESC
LIMIT 20;

-- ============================================================================
-- 5. ADMIN ACTIVITY SUMMARY - Removal counts by admin
-- ============================================================================

SELECT
    admin_user_duid,
    admin_type,
    admin_federation_id,
    COUNT(*) AS total_removals,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE rollback_executed = TRUE) AS rolled_back,
    MIN(requested_at) AS first_removal,
    MAX(requested_at) AS last_removal
FROM public.admin_account_removal_log
GROUP BY admin_user_duid, admin_type, admin_federation_id
ORDER BY total_removals DESC
LIMIT 20;

-- ============================================================================
-- 6. VERIFY ORPHANED NIP-05 RECORDS
-- ============================================================================
-- Finds nip05_records that have no corresponding user_identities entry
-- These are candidates for cleanup

SELECT
    nr.id,
    nr.user_duid,
    nr.domain,
    nr.entity_type,
    nr.created_at,
    'ORPHAN - No user_identities record' AS status
FROM public.nip05_records nr
LEFT JOIN public.user_identities ui ON nr.user_duid = ui.id
WHERE ui.id IS NULL
  AND nr.created_at < NOW() - INTERVAL '24 hours'
ORDER BY nr.created_at ASC
LIMIT 100;

-- ============================================================================
-- 7. BACKUP SNAPSHOT INTEGRITY CHECK
-- ============================================================================
-- Verifies that backup snapshots contain expected data for rollback

SELECT
    id AS removal_log_id,
    status,
    backup_snapshot IS NOT NULL AS has_backup,
    backup_snapshot ? 'user_identities' AS has_user_identity_backup,
    backup_snapshot ? 'nip05_records' AS has_nip05_backup,
    backup_snapshot ? 'family_members' AS has_family_member_backup,
    rollback_expires_at,
    CASE
        WHEN backup_snapshot IS NULL THEN '❌ No backup - cannot rollback'
        WHEN NOT (backup_snapshot ? 'user_identities') THEN '⚠️ Missing user_identities'
        ELSE '✅ Backup complete'
    END AS backup_status
FROM public.admin_account_removal_log
WHERE status = 'completed'
  AND rollback_executed = FALSE
ORDER BY requested_at DESC
LIMIT 50;

-- ============================================================================
-- 8. REMOVAL LOG DETAIL - Get full details for a specific removal
-- ============================================================================
-- Replace 'YOUR_REMOVAL_LOG_ID' with the actual UUID

-- SELECT
--     *,
--     CASE
--         WHEN rollback_expires_at > NOW() AND rollback_executed = FALSE THEN
--             'Rollback available for ' || EXTRACT(DAY FROM (rollback_expires_at - NOW())) || ' more days'
--         WHEN rollback_executed THEN
--             'Already rolled back at ' || rollback_executed_at
--         ELSE
--             'Rollback window expired'
--     END AS rollback_info
-- FROM public.admin_account_removal_log
-- WHERE id = 'YOUR_REMOVAL_LOG_ID';

-- ============================================================================
-- 9. DAILY REMOVAL STATISTICS
-- ============================================================================

SELECT
    DATE(requested_at) AS removal_date,
    COUNT(*) AS total_requests,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE rollback_executed = TRUE) AS rolled_back,
    SUM(records_deleted) AS total_records_deleted
FROM public.admin_account_removal_log
WHERE requested_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(requested_at)
ORDER BY removal_date DESC;

-- ============================================================================
-- 10. FEDERATION ADMIN SCOPE CHECK
-- ============================================================================
-- Verifies federation admins only removed accounts in their federation

SELECT
    arl.id AS removal_log_id,
    arl.admin_type,
    arl.admin_federation_id,
    arl.target_federation_id,
    CASE
        WHEN arl.admin_type = 'platform' THEN '✅ Platform admin - full access'
        WHEN arl.admin_federation_id = arl.target_federation_id THEN '✅ Same federation'
        WHEN arl.target_federation_id IS NULL THEN '✅ Private user (no federation)'
        ELSE '⚠️ Cross-federation removal'
    END AS scope_validation
FROM public.admin_account_removal_log arl
WHERE arl.admin_type = 'federation'
ORDER BY arl.requested_at DESC
LIMIT 50;

-- ============================================================================
-- 11. EXPIRING ROLLBACK WINDOWS - Alert for soon-to-expire backups
-- ============================================================================

SELECT
    id AS removal_log_id,
    target_account_type,
    removal_reason,
    completed_at,
    rollback_expires_at,
    EXTRACT(HOUR FROM (rollback_expires_at - NOW())) AS hours_remaining
FROM public.admin_account_removal_log
WHERE status = 'completed'
  AND rollback_executed = FALSE
  AND rollback_expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY rollback_expires_at ASC;

-- ============================================================================
-- 12. ACCOUNT REMOVAL BY REASON - Statistics by removal reason
-- ============================================================================

SELECT
    removal_reason,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE rollback_executed = TRUE) AS rolled_back,
    ROUND(100.0 * COUNT(*) FILTER (WHERE rollback_executed = TRUE) / NULLIF(COUNT(*), 0), 1) AS rollback_pct
FROM public.admin_account_removal_log
GROUP BY removal_reason
ORDER BY total DESC;

-- ============================================================================
-- 13. VERIFY PENDING DELETION REQUESTS (User-initiated)
-- ============================================================================

SELECT
    id,
    user_duid,
    request_type,
    status,
    cooling_off_expires_at,
    CASE
        WHEN cooling_off_expires_at > NOW() THEN
            'Cooling off: ' || EXTRACT(DAY FROM (cooling_off_expires_at - NOW())) || ' days remaining'
        ELSE
            'Ready for execution'
    END AS status_detail,
    requested_at
FROM public.pending_deletion_requests
WHERE status IN ('pending', 'cooling_off')
ORDER BY requested_at DESC
LIMIT 20;
