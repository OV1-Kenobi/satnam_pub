-- ============================================================================
-- ADMIN ACCOUNT CONTROL SYSTEM - Phase 1 Foundation
-- Migration: 20251219_admin_account_control.sql
-- 
-- PURPOSE: Create tables for admin-controlled account removal with audit trail,
-- backup snapshots, and 30-day rollback capability.
--
-- TABLES CREATED:
--   1. admin_account_removal_log - Audit trail for all account removals
--   2. pending_deletion_requests - User-initiated deletion with cooling-off
--
-- SECURITY:
--   - DUID-only storage (no plaintext NIP-05 or npub)
--   - RLS policies for platform and federation admin access
--   - IP/UA hashing for privacy-preserving audit
--
-- PREREQUISITE: user_identities and family_federations tables must exist
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. ADMIN_ACCOUNT_REMOVAL_LOG TABLE
-- ============================================================================
-- Tracks all account removal operations with backup snapshots for rollback

CREATE TABLE IF NOT EXISTS public.admin_account_removal_log (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Admin Information (DUID - no plaintext)
    admin_user_duid TEXT NOT NULL,
    admin_type TEXT NOT NULL CHECK (admin_type IN ('platform', 'federation')),
    admin_federation_id UUID,
    
    -- Target Account Information (DUID - no plaintext)
    target_user_duid TEXT NOT NULL,
    target_nip05_duid TEXT NOT NULL,
    target_account_type TEXT NOT NULL CHECK (target_account_type IN (
        'private', 'offspring', 'adult', 'steward', 'guardian', 'orphan', 'federation'
    )),
    target_federation_id UUID,
    
    -- Removal Context
    removal_reason TEXT NOT NULL CHECK (removal_reason IN (
        'user_requested',
        'gdpr_request',
        'content_moderation',
        'orphan_cleanup',
        'federation_removal',
        'federation_dissolution',
        'security_incident',
        'database_maintenance',
        'admin_removal'
    )),
    removal_notes TEXT,
    
    -- Scope Tracking
    tables_affected JSONB NOT NULL DEFAULT '{}',
    records_deleted INTEGER NOT NULL DEFAULT 0,
    
    -- Backup & Rollback
    backup_snapshot JSONB,
    backup_encryption_key_id TEXT,
    rollback_expires_at TIMESTAMP WITH TIME ZONE,
    rollback_executed BOOLEAN DEFAULT FALSE,
    rollback_executed_by TEXT,
    rollback_executed_at TIMESTAMP WITH TIME ZONE,
    
    -- Request Metadata (privacy-preserving)
    request_id TEXT NOT NULL UNIQUE,
    ip_address_hash TEXT,
    user_agent_hash TEXT,
    
    -- Timestamps
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Status Tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'confirmed',
        'executing',
        'completed',
        'failed',
        'rolled_back',
        'cancelled'
    )),
    error_message TEXT,
    
    -- Constraints
    CONSTRAINT valid_rollback_window CHECK (
        rollback_expires_at IS NULL OR rollback_expires_at > requested_at
    ),
    CONSTRAINT valid_rollback_execution CHECK (
        (rollback_executed = FALSE) OR 
        (rollback_executed = TRUE AND rollback_executed_by IS NOT NULL AND rollback_executed_at IS NOT NULL)
    )
);

-- Add comment for documentation
COMMENT ON TABLE public.admin_account_removal_log IS 
    'Audit log for all admin-initiated account removals with backup snapshots and rollback capability';

-- ============================================================================
-- INDEXES for admin_account_removal_log
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_removal_log_admin 
    ON public.admin_account_removal_log(admin_user_duid);

CREATE INDEX IF NOT EXISTS idx_removal_log_target 
    ON public.admin_account_removal_log(target_user_duid);

CREATE INDEX IF NOT EXISTS idx_removal_log_status 
    ON public.admin_account_removal_log(status);

CREATE INDEX IF NOT EXISTS idx_removal_log_requested_at 
    ON public.admin_account_removal_log(requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_removal_log_federation 
    ON public.admin_account_removal_log(target_federation_id) 
    WHERE target_federation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_removal_log_rollback_eligible 
    ON public.admin_account_removal_log(rollback_expires_at) 
    WHERE status = 'completed' AND rollback_executed = FALSE;

CREATE INDEX IF NOT EXISTS idx_removal_log_request_id 
    ON public.admin_account_removal_log(request_id);

-- ============================================================================
-- RLS POLICIES for admin_account_removal_log
-- (Idempotent: DROP IF EXISTS before CREATE)
-- ============================================================================
ALTER TABLE public.admin_account_removal_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for RPC functions)
DROP POLICY IF EXISTS "service_role_full_access" ON public.admin_account_removal_log;
CREATE POLICY "service_role_full_access"
    ON public.admin_account_removal_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Platform admins can view ALL removal logs (read-only for audit)
-- Platform admins are identified by 'guardian' role in user_identities
-- NOTE: user_identities.id IS the DUID (no separate user_duid column)
DROP POLICY IF EXISTS "platform_admin_read_access" ON public.admin_account_removal_log;
CREATE POLICY "platform_admin_read_access"
    ON public.admin_account_removal_log
    FOR SELECT
    TO authenticated
    USING (
        -- Platform admins (guardian role) can see ALL logs for audit purposes
        EXISTS (
            SELECT 1 FROM public.user_identities ui
            WHERE ui.id = (auth.jwt() ->> 'userId')::TEXT
            AND ui.role = 'guardian'
            AND ui.is_active = true
        )
    );

-- Federation admins can view logs for their federation
-- NOTE: family_members.user_duid references user_identities.id (the DUID)
DROP POLICY IF EXISTS "federation_admin_read_access" ON public.admin_account_removal_log;
CREATE POLICY "federation_admin_read_access"
    ON public.admin_account_removal_log
    FOR SELECT
    TO authenticated
    USING (
        -- Federation admins can see logs for their federation
        target_federation_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.family_members fm
            JOIN public.user_identities ui ON ui.id = fm.user_duid
            WHERE fm.family_federation_id = admin_account_removal_log.target_federation_id
            AND fm.family_role IN ('guardian', 'steward')
            AND ui.id = (auth.jwt() ->> 'userId')::TEXT
        )
    );

-- ============================================================================
-- 2. PENDING_DELETION_REQUESTS TABLE
-- ============================================================================
-- User-initiated deletion requests with cooling-off period

CREATE TABLE IF NOT EXISTS public.pending_deletion_requests (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User Information (DUID - no plaintext)
    user_duid TEXT NOT NULL,
    nip05_duid TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN (
        'private', 'offspring', 'adult', 'steward', 'guardian', 'orphan', 'federation'
    )),
    federation_id UUID,

    -- Request Details
    deletion_reason TEXT CHECK (deletion_reason IN (
        'user_requested',
        'gdpr_request',
        'account_migration',
        'privacy_concern',
        'other'
    )),
    deletion_notes TEXT,

    -- Cooling-off Period
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    cooling_off_ends_at TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Confirmation
    confirmed_at TIMESTAMP WITH TIME ZONE,
    confirmation_token_hash TEXT,
    confirmation_expires_at TIMESTAMP WITH TIME ZONE,

    -- Execution
    executed_at TIMESTAMP WITH TIME ZONE,
    executed_by TEXT,
    removal_log_id UUID REFERENCES public.admin_account_removal_log(id) ON DELETE SET NULL,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'confirmed',
        'cancelled',
        'executed',
        'expired'
    )),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancelled_reason TEXT,

    -- Request Metadata (privacy-preserving)
    request_id TEXT NOT NULL UNIQUE,
    ip_address_hash TEXT,
    user_agent_hash TEXT,

    -- Constraints
    CONSTRAINT valid_cooling_off CHECK (cooling_off_ends_at > requested_at),
    CONSTRAINT valid_confirmation CHECK (
        (confirmed_at IS NULL) OR
        (confirmed_at IS NOT NULL AND confirmed_at >= requested_at)
    ),
    CONSTRAINT valid_execution CHECK (
        (executed_at IS NULL) OR
        (executed_at IS NOT NULL AND executed_by IS NOT NULL)
    )
);

-- Add comment for documentation
COMMENT ON TABLE public.pending_deletion_requests IS
    'User-initiated account deletion requests with 7-day cooling-off period';

-- ============================================================================
-- INDEXES for pending_deletion_requests
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pending_deletion_user
    ON public.pending_deletion_requests(user_duid);

CREATE INDEX IF NOT EXISTS idx_pending_deletion_status
    ON public.pending_deletion_requests(status);

CREATE INDEX IF NOT EXISTS idx_pending_deletion_cooling_off
    ON public.pending_deletion_requests(cooling_off_ends_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pending_deletion_federation
    ON public.pending_deletion_requests(federation_id)
    WHERE federation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pending_deletion_request_id
    ON public.pending_deletion_requests(request_id);

-- ============================================================================
-- RLS POLICIES for pending_deletion_requests
-- (Idempotent: DROP IF EXISTS before CREATE)
-- ============================================================================
ALTER TABLE public.pending_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "service_role_full_access_pending" ON public.pending_deletion_requests;
CREATE POLICY "service_role_full_access_pending"
    ON public.pending_deletion_requests
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Users can view and manage their own deletion requests
-- NOTE: user_identities.id IS the DUID (no separate user_duid column)
DROP POLICY IF EXISTS "user_own_deletion_requests" ON public.pending_deletion_requests;
CREATE POLICY "user_own_deletion_requests"
    ON public.pending_deletion_requests
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_identities ui
            WHERE ui.id = pending_deletion_requests.user_duid
            AND ui.id = (auth.jwt() ->> 'userId')::TEXT
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_identities ui
            WHERE ui.id = pending_deletion_requests.user_duid
            AND ui.id = (auth.jwt() ->> 'userId')::TEXT
        )
    );

-- Federation guardians can view deletion requests for their federation members
-- NOTE: family_members.user_duid references user_identities.id (the DUID)
DROP POLICY IF EXISTS "federation_guardian_view_requests" ON public.pending_deletion_requests;
CREATE POLICY "federation_guardian_view_requests"
    ON public.pending_deletion_requests
    FOR SELECT
    TO authenticated
    USING (
        federation_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.family_members fm
            JOIN public.user_identities ui ON ui.id = fm.user_duid
            WHERE fm.family_federation_id = pending_deletion_requests.federation_id
            AND fm.family_role = 'guardian'
            AND ui.id = (auth.jwt() ->> 'userId')::TEXT
        )
    );

-- ============================================================================
-- 3. REMOVE_USER_ACCOUNT_BY_NIP05 RPC FUNCTION
-- ============================================================================
-- Cascade deletion with backup snapshot and audit logging
-- Called by platform/federation admins via Netlify Functions

CREATE OR REPLACE FUNCTION public.remove_user_account_by_nip05(
    p_target_nip05_duid TEXT,
    p_admin_user_duid TEXT,
    p_admin_type TEXT,
    p_admin_federation_id UUID DEFAULT NULL,
    p_removal_reason TEXT DEFAULT 'admin_removal',
    p_removal_notes TEXT DEFAULT NULL,
    p_request_id TEXT DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL,
    p_ua_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_user_duid TEXT;
    v_target_account_type TEXT;
    v_target_federation_id UUID;
    v_backup_snapshot JSONB;
    v_tables_affected JSONB := '{}';
    v_records_deleted INTEGER := 0;
    v_removal_log_id UUID;
    v_request_id TEXT;
    v_rollback_expires_at TIMESTAMP WITH TIME ZONE;
    v_temp_count INTEGER;
BEGIN
    -- Generate request ID if not provided
    v_request_id := COALESCE(p_request_id, 'req_' || gen_random_uuid()::TEXT);

    -- Set rollback expiration (30 days from now)
    v_rollback_expires_at := NOW() + INTERVAL '30 days';

    -- ========================================================================
    -- STEP 1: Lookup target user by NIP-05 user_duid
    -- ========================================================================
    -- NOTE: nip05_records.user_duid stores the SAME value as user_identities.id
    -- Both are computed as HMAC-SHA-256(DUID_SERVER_SECRET, "username@domain")
    -- This enables direct JOINs without any transformation
    SELECT
        nr.user_duid,  -- This IS the user_identities.id value
        COALESCE(fm.family_role, 'private'),
        fm.family_federation_id
    INTO
        v_target_user_duid,
        v_target_account_type,
        v_target_federation_id
    FROM public.nip05_records nr
    LEFT JOIN public.family_members fm ON fm.user_duid = nr.user_duid
    WHERE nr.user_duid = p_target_nip05_duid
    LIMIT 1;

    IF v_target_user_duid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'USER_NOT_FOUND',
            'message', 'No user found with the specified NIP-05 DUID'
        );
    END IF;

    -- ========================================================================
    -- STEP 2: Authorization check for federation admins
    -- ========================================================================
    IF p_admin_type = 'federation' THEN
        -- Federation admins can only remove users from their own federation
        IF v_target_federation_id IS NULL OR v_target_federation_id != p_admin_federation_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'UNAUTHORIZED',
                'message', 'Federation admin can only remove users from their own federation'
            );
        END IF;

        -- Cannot remove guardians (only platform admins can)
        IF v_target_account_type = 'guardian' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'UNAUTHORIZED',
                'message', 'Federation admins cannot remove guardians'
            );
        END IF;
    END IF;

    -- ========================================================================
    -- STEP 3: Create backup snapshot
    -- ========================================================================
    -- NOTE: nip05_records.user_duid = user_identities.id (same DUID value)
    -- privacy_users may not exist (consolidated into user_identities)
    v_backup_snapshot := jsonb_build_object(
        'snapshot_version', '1.0',
        'created_at', NOW(),
        'user_identities', (
            SELECT jsonb_agg(row_to_json(ui.*))
            FROM public.user_identities ui
            WHERE ui.id = v_target_user_duid
        ),
        'family_members', (
            SELECT jsonb_agg(row_to_json(fm.*))
            FROM public.family_members fm
            WHERE fm.user_duid = v_target_user_duid
        ),
        'nip05_records', (
            SELECT jsonb_agg(row_to_json(nr.*))
            FROM public.nip05_records nr
            WHERE nr.user_duid = v_target_user_duid
        ),
        'privacy_users', (
            -- privacy_users may not exist (consolidated into user_identities)
            -- Return NULL if table doesn't exist, otherwise query by hashed_uuid
            SELECT CASE
                WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'privacy_users')
                THEN (SELECT jsonb_agg(row_to_json(pu.*)) FROM public.privacy_users pu WHERE pu.hashed_uuid = v_target_user_duid)
                ELSE NULL
            END
        )
    );

    -- ========================================================================
    -- STEP 4: Create audit log entry (before deletion)
    -- ========================================================================
    INSERT INTO public.admin_account_removal_log (
        admin_user_duid,
        admin_type,
        admin_federation_id,
        target_user_duid,
        target_nip05_duid,
        target_account_type,
        target_federation_id,
        removal_reason,
        removal_notes,
        backup_snapshot,
        rollback_expires_at,
        request_id,
        ip_address_hash,
        user_agent_hash,
        status,
        confirmed_at
    ) VALUES (
        p_admin_user_duid,
        p_admin_type,
        p_admin_federation_id,
        v_target_user_duid,
        p_target_nip05_duid,
        v_target_account_type,
        v_target_federation_id,
        p_removal_reason,
        p_removal_notes,
        v_backup_snapshot,
        v_rollback_expires_at,
        v_request_id,
        p_ip_hash,
        p_ua_hash,
        'executing',
        NOW()
    )
    RETURNING id INTO v_removal_log_id;

    -- ========================================================================
    -- STEP 5: Cascade deletion (order matters for FK constraints)
    -- ========================================================================

    -- 5a. Delete from nip05_records (uses user_duid - same value as user_identities.id)
    DELETE FROM public.nip05_records WHERE user_duid = v_target_user_duid;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_records_deleted := v_records_deleted + v_temp_count;
    v_tables_affected := v_tables_affected || jsonb_build_object('nip05_records', v_temp_count);

    -- 5b. Delete from family_members (uses user_duid column)
    DELETE FROM public.family_members WHERE user_duid = v_target_user_duid;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_records_deleted := v_records_deleted + v_temp_count;
    v_tables_affected := v_tables_affected || jsonb_build_object('family_members', v_temp_count);

    -- 5c. Delete from privacy_users (may not exist - consolidated into user_identities)
    -- Use dynamic SQL to handle table not existing gracefully
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'privacy_users') THEN
            EXECUTE 'DELETE FROM public.privacy_users WHERE hashed_uuid = $1' USING v_target_user_duid;
            GET DIAGNOSTICS v_temp_count = ROW_COUNT;
            v_records_deleted := v_records_deleted + v_temp_count;
            v_tables_affected := v_tables_affected || jsonb_build_object('privacy_users', v_temp_count);
        END IF;
    EXCEPTION WHEN undefined_table THEN
        -- Table doesn't exist, skip silently
        NULL;
    END;

    -- 5d. Delete from user_identities (main identity table - id IS the DUID)
    DELETE FROM public.user_identities WHERE id = v_target_user_duid;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_records_deleted := v_records_deleted + v_temp_count;
    v_tables_affected := v_tables_affected || jsonb_build_object('user_identities', v_temp_count);

    -- ========================================================================
    -- STEP 6: Update audit log with completion status
    -- ========================================================================
    UPDATE public.admin_account_removal_log
    SET
        status = 'completed',
        tables_affected = v_tables_affected,
        records_deleted = v_records_deleted,
        executed_at = NOW(),
        completed_at = NOW()
    WHERE id = v_removal_log_id;

    -- ========================================================================
    -- STEP 7: Return success response
    -- ========================================================================
    RETURN jsonb_build_object(
        'success', true,
        'removal_log_id', v_removal_log_id,
        'request_id', v_request_id,
        'target_user_duid', v_target_user_duid,
        'target_account_type', v_target_account_type,
        'records_deleted', v_records_deleted,
        'tables_affected', v_tables_affected,
        'rollback_expires_at', v_rollback_expires_at,
        'message', 'Account successfully removed'
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Update audit log with failure status
        IF v_removal_log_id IS NOT NULL THEN
            UPDATE public.admin_account_removal_log
            SET
                status = 'failed',
                error_message = SQLERRM,
                executed_at = NOW()
            WHERE id = v_removal_log_id;
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'DELETION_FAILED',
            'message', SQLERRM,
            'removal_log_id', v_removal_log_id
        );
END;
$$;

-- Grant execute permission to service role only
REVOKE ALL ON FUNCTION public.remove_user_account_by_nip05 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_user_account_by_nip05 TO service_role;

COMMENT ON FUNCTION public.remove_user_account_by_nip05 IS
    'Admin RPC to remove a user account by NIP-05 DUID with cascade deletion, backup snapshot, and audit logging';

-- ============================================================================
-- 4. ROLLBACK_ACCOUNT_REMOVAL RPC FUNCTION
-- ============================================================================
-- Restore a removed account from backup snapshot within 30-day window

CREATE OR REPLACE FUNCTION public.rollback_account_removal(
    p_removal_log_id UUID,
    p_admin_user_duid TEXT,
    p_rollback_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_record RECORD;
    v_snapshot JSONB;
    v_restored_count INTEGER := 0;
    v_restore_details JSONB := '{}';
    v_temp_count INTEGER;
BEGIN
    -- ========================================================================
    -- STEP 1: Fetch and validate the removal log entry
    -- ========================================================================
    SELECT * INTO v_log_record
    FROM public.admin_account_removal_log
    WHERE id = p_removal_log_id;

    IF v_log_record IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'LOG_NOT_FOUND',
            'message', 'No removal log found with the specified ID'
        );
    END IF;

    -- Check if already rolled back
    IF v_log_record.rollback_executed THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ALREADY_ROLLED_BACK',
            'message', 'This removal has already been rolled back',
            'rollback_executed_at', v_log_record.rollback_executed_at
        );
    END IF;

    -- Check if status allows rollback
    IF v_log_record.status != 'completed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_STATUS',
            'message', 'Only completed removals can be rolled back',
            'current_status', v_log_record.status
        );
    END IF;

    -- Check if rollback window has expired
    IF v_log_record.rollback_expires_at < NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ROLLBACK_EXPIRED',
            'message', 'The 30-day rollback window has expired',
            'expired_at', v_log_record.rollback_expires_at
        );
    END IF;

    -- Check if backup snapshot exists
    v_snapshot := v_log_record.backup_snapshot;
    IF v_snapshot IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'NO_BACKUP',
            'message', 'No backup snapshot available for this removal'
        );
    END IF;

    -- ========================================================================
    -- STEP 2: Restore data from backup snapshot
    -- ========================================================================

    -- 2a. Restore user_identities
    IF v_snapshot->'user_identities' IS NOT NULL AND jsonb_array_length(v_snapshot->'user_identities') > 0 THEN
        INSERT INTO public.user_identities
        SELECT * FROM jsonb_populate_recordset(null::public.user_identities, v_snapshot->'user_identities')
        ON CONFLICT (id) DO NOTHING;
        GET DIAGNOSTICS v_temp_count = ROW_COUNT;
        v_restored_count := v_restored_count + v_temp_count;
        v_restore_details := v_restore_details || jsonb_build_object('user_identities', v_temp_count);
    END IF;

    -- 2b. Restore privacy_users (may not exist - consolidated into user_identities)
    IF v_snapshot->'privacy_users' IS NOT NULL AND jsonb_array_length(v_snapshot->'privacy_users') > 0 THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'privacy_users') THEN
                INSERT INTO public.privacy_users
                SELECT * FROM jsonb_populate_recordset(null::public.privacy_users, v_snapshot->'privacy_users')
                ON CONFLICT (id) DO NOTHING;
                GET DIAGNOSTICS v_temp_count = ROW_COUNT;
                v_restored_count := v_restored_count + v_temp_count;
                v_restore_details := v_restore_details || jsonb_build_object('privacy_users', v_temp_count);
            END IF;
        EXCEPTION WHEN undefined_table THEN
            -- Table doesn't exist, skip silently
            NULL;
        END;
    END IF;

    -- 2c. Restore family_members
    IF v_snapshot->'family_members' IS NOT NULL AND jsonb_array_length(v_snapshot->'family_members') > 0 THEN
        INSERT INTO public.family_members
        SELECT * FROM jsonb_populate_recordset(null::public.family_members, v_snapshot->'family_members')
        ON CONFLICT (id) DO NOTHING;
        GET DIAGNOSTICS v_temp_count = ROW_COUNT;
        v_restored_count := v_restored_count + v_temp_count;
        v_restore_details := v_restore_details || jsonb_build_object('family_members', v_temp_count);
    END IF;

    -- 2d. Restore nip05_records
    IF v_snapshot->'nip05_records' IS NOT NULL AND jsonb_array_length(v_snapshot->'nip05_records') > 0 THEN
        INSERT INTO public.nip05_records
        SELECT * FROM jsonb_populate_recordset(null::public.nip05_records, v_snapshot->'nip05_records')
        ON CONFLICT (id) DO NOTHING;
        GET DIAGNOSTICS v_temp_count = ROW_COUNT;
        v_restored_count := v_restored_count + v_temp_count;
        v_restore_details := v_restore_details || jsonb_build_object('nip05_records', v_temp_count);
    END IF;

    -- ========================================================================
    -- STEP 3: Update the removal log to mark as rolled back
    -- ========================================================================
    UPDATE public.admin_account_removal_log
    SET
        status = 'rolled_back',
        rollback_executed = TRUE,
        rollback_executed_by = p_admin_user_duid,
        rollback_executed_at = NOW()
    WHERE id = p_removal_log_id;

    -- ========================================================================
    -- STEP 4: Return success response
    -- ========================================================================
    RETURN jsonb_build_object(
        'success', true,
        'removal_log_id', p_removal_log_id,
        'target_user_duid', v_log_record.target_user_duid,
        'records_restored', v_restored_count,
        'restore_details', v_restore_details,
        'rollback_reason', p_rollback_reason,
        'message', 'Account successfully restored from backup'
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ROLLBACK_FAILED',
            'message', SQLERRM,
            'removal_log_id', p_removal_log_id
        );
END;
$$;

-- Grant execute permission to service role only
REVOKE ALL ON FUNCTION public.rollback_account_removal FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_account_removal TO service_role;

COMMENT ON FUNCTION public.rollback_account_removal IS
    'Admin RPC to restore a removed account from backup snapshot within 30-day rollback window';
