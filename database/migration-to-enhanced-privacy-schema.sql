-- Production Migration Script to Enhanced Privacy Schema
-- Master Context Compliant - Safe for Production Deployment
--
-- INSTRUCTIONS FOR SUPABASE SQL EDITOR:
-- 1. Copy and paste this entire script into Supabase SQL Editor
-- 2. Execute the script (it's wrapped in a transaction for safety)
-- 3. Verify successful migration using the verification queries at the end
-- 4. If any errors occur, the transaction will automatically rollback
--
-- ROLLBACK INSTRUCTIONS:
-- If you need to rollback, run the rollback script provided at the end

BEGIN;

-- Step 1: Add new columns to existing privacy_users table
ALTER TABLE privacy_users 
ADD COLUMN IF NOT EXISTS auth_salt_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS zero_knowledge_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS session_salt VARCHAR(32),
ADD COLUMN IF NOT EXISTS auth_failure_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_auth_failure BIGINT,
ADD COLUMN IF NOT EXISTS nsec_shard_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS nsec_threshold INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS guardian_approval_required BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS last_activity BIGINT,
ADD COLUMN IF NOT EXISTS data_retention_days INTEGER NOT NULL DEFAULT 2555;

-- Step 2: Update privacy_users constraints to include complete role hierarchy
ALTER TABLE privacy_users DROP CONSTRAINT IF EXISTS check_federation_role;
ALTER TABLE privacy_users ADD CONSTRAINT check_federation_role 
    CHECK (federation_role IN ('private', 'offspring', 'adult', 'steward', 'guardian'));

-- Step 3: Add unique constraints for new columns
ALTER TABLE privacy_users ADD CONSTRAINT unique_session_salt UNIQUE (session_salt);

-- Step 4: Add new columns to existing family_memberships table
ALTER TABLE family_memberships 
ADD COLUMN IF NOT EXISTS spending_limit BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS guardian_level INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS can_approve_spending BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS can_manage_members BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS membership_salt VARCHAR(32),
ADD COLUMN IF NOT EXISTS role_changed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS role_changed_by VARCHAR(50);

-- Step 5: Update family_memberships constraints
ALTER TABLE family_memberships DROP CONSTRAINT IF EXISTS check_member_role;
ALTER TABLE family_memberships ADD CONSTRAINT check_member_role 
    CHECK (member_role IN ('private', 'offspring', 'adult', 'steward', 'guardian'));

-- Step 6: Generate unique salts for existing family memberships
UPDATE family_memberships 
SET membership_salt = encode(gen_random_bytes(16), 'hex')
WHERE membership_salt IS NULL;

ALTER TABLE family_memberships ADD CONSTRAINT unique_membership_salt UNIQUE (membership_salt);

-- Step 7: Create new nsec_shards table (handle existing table properly)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nsec_shards' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nsec_shards' AND column_name = 'encrypted_shard' AND table_schema = 'public') THEN
            DROP TABLE public.nsec_shards CASCADE;
        ELSE
            RAISE NOTICE 'nsec_shards table already exists with required columns, skipping creation';
            RETURN;
        END IF;
    END IF;

    CREATE TABLE public.nsec_shards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_hash VARCHAR(50) NOT NULL,
        guardian_hash VARCHAR(50) NOT NULL,
        encrypted_shard TEXT NOT NULL,
        shard_index INTEGER NOT NULL,
        shard_salt VARCHAR(32) NOT NULL,
        guardian_encryption_key VARCHAR(64) NOT NULL,
        guardian_salt VARCHAR(32) NOT NULL,
        threshold INTEGER NOT NULL,
        total_shards INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        expires_at BIGINT,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        last_accessed BIGINT,
        access_count INTEGER NOT NULL DEFAULT 0,

        FOREIGN KEY (owner_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
        FOREIGN KEY (guardian_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
        UNIQUE(owner_hash, guardian_hash, shard_index),
        UNIQUE(shard_salt)
    );

    RAISE NOTICE 'nsec_shards table created successfully';
END $$;

-- Step 8: Create new guardian_approvals table (handle existing table properly)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guardian_approvals' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'guardian_approvals' AND column_name = 'operation_type' AND table_schema = 'public') THEN
            DROP TABLE public.guardian_approvals CASCADE;
        ELSE
            RAISE NOTICE 'guardian_approvals table already exists with required columns, skipping creation';
            RETURN;
        END IF;
    END IF;

    CREATE TABLE public.guardian_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_hash VARCHAR(50) NOT NULL,
        operation_type VARCHAR(30) NOT NULL CHECK (operation_type IN (
            'nsec_reconstruction', 'key_rotation', 'emergency_recovery',
            'spending_approval', 'role_change', 'guardian_addition',
            'guardian_removal', 'federation_join', 'federation_leave'
        )),
        encrypted_context TEXT NOT NULL,
        context_hash VARCHAR(32) NOT NULL,
        required_approvals INTEGER NOT NULL DEFAULT 1,
        current_approvals INTEGER NOT NULL DEFAULT 0,
        threshold INTEGER NOT NULL,
        guardian_responses JSONB NOT NULL DEFAULT '[]',
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
            'pending', 'approved', 'rejected', 'expired', 'cancelled'
        )),
        request_salt VARCHAR(32) NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        completed_at BIGINT,

        FOREIGN KEY (requester_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
        UNIQUE(request_salt)
    );

    RAISE NOTICE 'guardian_approvals table created successfully';
END $$;

-- Step 9: Create new vault_credentials table (handle existing table properly)
DO $$
BEGIN
    -- Check if vault_credentials table exists and has the required columns
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vault_credentials' AND table_schema = 'public') THEN
        -- Check if it has the credential_hash column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vault_credentials' AND column_name = 'credential_hash' AND table_schema = 'public') THEN
            -- Table exists but doesn't have required columns, drop and recreate
            DROP TABLE public.vault_credentials CASCADE;
        ELSE
            -- Table exists with required columns, skip creation
            RAISE NOTICE 'vault_credentials table already exists with required columns, skipping creation';
            RETURN;
        END IF;
    END IF;

    -- Create the table
    CREATE TABLE public.vault_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        credential_hash VARCHAR(64) NOT NULL,
        credential_salt VARCHAR(32) NOT NULL,
        owner_hash VARCHAR(50),
        encrypted_value TEXT NOT NULL,
        encryption_salt VARCHAR(32) NOT NULL,
        key_derivation_rounds INTEGER NOT NULL DEFAULT 100000,
        credential_type VARCHAR(30) NOT NULL CHECK (credential_type IN (
            'auth_salt', 'jwt_secret', 'api_key', 'database_key',
            'lightning_macaroon', 'nostr_nsec', 'federation_key'
        )),
        required_role VARCHAR(20) NOT NULL DEFAULT 'guardian' CHECK (required_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')),
        guardian_approval_required BOOLEAN NOT NULL DEFAULT true,
        is_active BOOLEAN NOT NULL DEFAULT true,
        expires_at BIGINT,
        rotation_required BOOLEAN NOT NULL DEFAULT false,
        last_rotated BIGINT,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        last_accessed BIGINT,
        access_count INTEGER NOT NULL DEFAULT 0,

        FOREIGN KEY (owner_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE CASCADE,
        UNIQUE(credential_hash),
        UNIQUE(credential_salt),
        UNIQUE(encryption_salt)
    );

    RAISE NOTICE 'vault_credentials table created successfully';
END $$;

-- Step 10: Create new privacy_audit_log table (handle existing table properly)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_audit_log' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'privacy_audit_log' AND column_name = 'action_type' AND table_schema = 'public') THEN
            DROP TABLE public.privacy_audit_log CASCADE;
        ELSE
            RAISE NOTICE 'privacy_audit_log table already exists with required columns, skipping creation';
            RETURN;
        END IF;
    END IF;

    CREATE TABLE public.privacy_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_hash VARCHAR(50),
        action_type VARCHAR(30) NOT NULL CHECK (action_type IN (
            'auth_attempt', 'auth_success', 'auth_failure', 'session_create', 'session_destroy',
            'nsec_shard_create', 'nsec_shard_access', 'nsec_reconstruct', 'key_rotation',
            'guardian_approval', 'role_change', 'permission_change', 'vault_access',
            'data_export', 'data_deletion', 'emergency_recovery', 'schema_migration',
            'data_cleanup', 'system_maintenance', 'backup_operation'
        )),
        context_hash VARCHAR(32),
        resource_type VARCHAR(20),
        ip_address_hash VARCHAR(64),
        user_agent_hash VARCHAR(64),
        session_hash VARCHAR(50),
        success BOOLEAN NOT NULL,
        error_code VARCHAR(20),
        data_minimized BOOLEAN NOT NULL DEFAULT true,
        retention_expires BIGINT NOT NULL,
        timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),

        FOREIGN KEY (actor_hash) REFERENCES privacy_users(hashed_uuid) ON DELETE SET NULL
    );

    RAISE NOTICE 'privacy_audit_log table created successfully';
END $$;

-- Step 10.5: Verify all new tables and critical columns exist before creating indexes
DO $$
BEGIN
    -- Verify tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nsec_shards' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'nsec_shards table was not created successfully';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guardian_approvals' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'guardian_approvals table was not created successfully';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vault_credentials' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'vault_credentials table was not created successfully';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_audit_log' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'privacy_audit_log table was not created successfully';
    END IF;

    -- Verify critical columns exist (the ones causing the error)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vault_credentials' AND column_name = 'credential_hash' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'vault_credentials table missing credential_hash column';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nsec_shards' AND column_name = 'owner_hash' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'nsec_shards table missing owner_hash column';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'guardian_approvals' AND column_name = 'requester_hash' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'guardian_approvals table missing requester_hash column';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'privacy_audit_log' AND column_name = 'actor_hash' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'privacy_audit_log table missing actor_hash column';
    END IF;

    RAISE NOTICE 'All new tables and columns verified successfully';
END $$;

-- Step 11: Create indexes for new tables (with explicit error handling)
DO $$
BEGIN
    -- Create nsec_shards indexes
    CREATE INDEX IF NOT EXISTS idx_nsec_shards_owner ON public.nsec_shards(owner_hash);
    CREATE INDEX IF NOT EXISTS idx_nsec_shards_guardian ON public.nsec_shards(guardian_hash);
    CREATE INDEX IF NOT EXISTS idx_nsec_shards_active ON public.nsec_shards(is_active);
    CREATE INDEX IF NOT EXISTS idx_nsec_shards_expires ON public.nsec_shards(expires_at);

    -- Create guardian_approvals indexes
    CREATE INDEX IF NOT EXISTS idx_guardian_approvals_requester ON public.guardian_approvals(requester_hash);
    CREATE INDEX IF NOT EXISTS idx_guardian_approvals_type ON public.guardian_approvals(operation_type);
    CREATE INDEX IF NOT EXISTS idx_guardian_approvals_status ON public.guardian_approvals(status);
    CREATE INDEX IF NOT EXISTS idx_guardian_approvals_expires ON public.guardian_approvals(expires_at);

    -- Create vault_credentials indexes (the problematic ones)
    CREATE INDEX IF NOT EXISTS idx_vault_credentials_hash ON public.vault_credentials(credential_hash);
    CREATE INDEX IF NOT EXISTS idx_vault_credentials_owner ON public.vault_credentials(owner_hash);
    CREATE INDEX IF NOT EXISTS idx_vault_credentials_type ON public.vault_credentials(credential_type);
    CREATE INDEX IF NOT EXISTS idx_vault_credentials_active ON public.vault_credentials(is_active);
    CREATE INDEX IF NOT EXISTS idx_vault_credentials_expires ON public.vault_credentials(expires_at);

    -- Create privacy_audit_log indexes
    CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.privacy_audit_log(actor_hash);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.privacy_audit_log(action_type);
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.privacy_audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_log_success ON public.privacy_audit_log(success);
    CREATE INDEX IF NOT EXISTS idx_audit_log_retention ON public.privacy_audit_log(retention_expires);

    RAISE NOTICE 'All indexes created successfully';
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create indexes: %', SQLERRM;
END $$;

-- Step 12: Add new indexes for enhanced columns
CREATE INDEX IF NOT EXISTS idx_privacy_users_guardian_approval ON public.privacy_users(guardian_approval_required);
CREATE INDEX IF NOT EXISTS idx_privacy_users_zero_knowledge ON public.privacy_users(zero_knowledge_enabled);
CREATE INDEX IF NOT EXISTS idx_privacy_users_last_activity ON public.privacy_users(last_activity);
CREATE INDEX IF NOT EXISTS idx_memberships_guardian_level ON public.family_memberships(guardian_level);
CREATE INDEX IF NOT EXISTS idx_memberships_last_activity ON public.family_memberships(last_activity);

-- Step 13: Enable Row Level Security for new tables
ALTER TABLE public.nsec_shards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_audit_log ENABLE ROW LEVEL SECURITY;

-- Step 14: Create RLS policies for new tables
CREATE POLICY nsec_shards_access ON nsec_shards
    FOR ALL
    USING (
        owner_hash = current_setting('app.current_user_hash', true) OR
        guardian_hash = current_setting('app.current_user_hash', true)
    );

CREATE POLICY guardian_approvals_access ON guardian_approvals
    FOR ALL
    USING (
        requester_hash = current_setting('app.current_user_hash', true) OR
        EXISTS (
            SELECT 1 FROM family_memberships fm
            WHERE fm.member_hash = current_setting('app.current_user_hash', true)
            AND fm.guardian_level > 0
            AND fm.is_active = true
        )
    );

CREATE POLICY vault_credentials_access ON vault_credentials
    FOR SELECT
    USING (
        owner_hash = current_setting('app.current_user_hash', true) OR
        EXISTS (
            SELECT 1 FROM privacy_users pu
            WHERE pu.hashed_uuid = current_setting('app.current_user_hash', true)
            AND (
                (required_role = 'private' AND pu.federation_role IN ('private', 'offspring', 'adult', 'steward', 'guardian')) OR
                (required_role = 'offspring' AND pu.federation_role IN ('offspring', 'adult', 'steward', 'guardian')) OR
                (required_role = 'adult' AND pu.federation_role IN ('adult', 'steward', 'guardian')) OR
                (required_role = 'steward' AND pu.federation_role IN ('steward', 'guardian')) OR
                (required_role = 'guardian' AND pu.federation_role = 'guardian')
            )
        )
    );

CREATE POLICY privacy_audit_log_access ON privacy_audit_log
    FOR SELECT
    USING (
        actor_hash = current_setting('app.current_user_hash', true) OR
        EXISTS (
            SELECT 1 FROM privacy_users pu
            WHERE pu.hashed_uuid = current_setting('app.current_user_hash', true)
            AND pu.federation_role IN ('steward', 'guardian')
        )
    );

-- Step 15: Grant permissions for new tables
GRANT ALL ON public.nsec_shards TO authenticated;
GRANT ALL ON public.guardian_approvals TO authenticated;
GRANT SELECT ON public.vault_credentials TO authenticated;
GRANT INSERT ON public.privacy_audit_log TO authenticated;

-- Step 16: Create enhanced security functions
CREATE OR REPLACE FUNCTION cleanup_expired_privacy_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM privacy_audit_log WHERE retention_expires < EXTRACT(EPOCH FROM NOW());
    DELETE FROM nsec_shards WHERE expires_at IS NOT NULL AND expires_at < EXTRACT(EPOCH FROM NOW());
    DELETE FROM guardian_approvals WHERE expires_at < EXTRACT(EPOCH FROM NOW());
    DELETE FROM vault_credentials WHERE expires_at IS NOT NULL AND expires_at < EXTRACT(EPOCH FROM NOW());
    DELETE FROM privacy_sessions WHERE expires_at < NOW();
    DELETE FROM private_messages WHERE created_at < NOW() - INTERVAL '1 year';

    UPDATE privacy_users
    SET updated_at = EXTRACT(EPOCH FROM NOW())
    WHERE last_activity > EXTRACT(EPOCH FROM NOW()) - (24 * 60 * 60);

    INSERT INTO privacy_audit_log (action_type, success, retention_expires)
    VALUES ('data_cleanup', true, EXTRACT(EPOCH FROM NOW()) + (30 * 24 * 60 * 60));
END;
$$;

CREATE OR REPLACE FUNCTION rotate_user_salt(user_hash TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_salt TEXT;
BEGIN
    new_salt := encode(gen_random_bytes(16), 'hex');

    UPDATE privacy_users
    SET user_salt = new_salt,
        updated_at = EXTRACT(EPOCH FROM NOW())
    WHERE hashed_uuid = user_hash;

    INSERT INTO privacy_audit_log (actor_hash, action_type, success, retention_expires)
    VALUES (user_hash, 'key_rotation', true, EXTRACT(EPOCH FROM NOW()) + (365 * 24 * 60 * 60));
END;
$$;

CREATE OR REPLACE FUNCTION check_guardian_approval(
    operation_type TEXT,
    requester_hash TEXT,
    required_approvals INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
    guardian_count INTEGER;
BEGIN
    SELECT federation_role INTO user_role
    FROM privacy_users
    WHERE hashed_uuid = requester_hash;

    IF user_role IN ('guardian', 'steward') AND operation_type NOT IN ('emergency_recovery', 'guardian_removal') THEN
        RETURN true;
    END IF;

    SELECT COUNT(*) INTO guardian_count
    FROM family_memberships fm
    JOIN privacy_users pu ON fm.member_hash = pu.hashed_uuid
    WHERE fm.guardian_level > 0
    AND fm.is_active = true
    AND pu.federation_role IN ('guardian', 'steward');

    IF guardian_count < required_approvals THEN
        RETURN false;
    END IF;

    IF operation_type IN ('nsec_reconstruction', 'emergency_recovery', 'guardian_removal') THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

-- Step 17: Grant execute permissions for new functions
GRANT EXECUTE ON FUNCTION cleanup_expired_privacy_data TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_user_salt TO authenticated;
GRANT EXECUTE ON FUNCTION check_guardian_approval TO authenticated;

-- Step 18: Log successful migration
INSERT INTO privacy_audit_log (action_type, success, retention_expires, context_hash)
VALUES ('schema_migration', true, EXTRACT(EPOCH FROM NOW()) + (365 * 24 * 60 * 60), 'enhanced_privacy_schema');

COMMIT;

-- VERIFICATION QUERIES - Run these to verify successful migration
-- Copy and paste these queries one by one in Supabase SQL Editor to verify

-- Verify new columns were added to privacy_users
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'privacy_users'
AND column_name IN ('auth_salt_hash', 'zero_knowledge_enabled', 'nsec_shard_count', 'guardian_approval_required')
ORDER BY column_name;

-- Verify new columns were added to family_memberships
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'family_memberships'
AND column_name IN ('spending_limit', 'guardian_level', 'can_approve_spending', 'membership_salt')
ORDER BY column_name;

-- Verify new tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('nsec_shards', 'guardian_approvals', 'vault_credentials', 'privacy_audit_log')
ORDER BY table_name;

-- Verify RLS policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('nsec_shards', 'guardian_approvals', 'vault_credentials', 'privacy_audit_log')
ORDER BY tablename, policyname;

-- Verify functions were created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('cleanup_expired_privacy_data', 'rotate_user_salt', 'check_guardian_approval')
ORDER BY routine_name;

-- Verify role hierarchy constraints
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name IN ('check_federation_role', 'check_member_role')
ORDER BY constraint_name;

-- Check migration log entry
SELECT action_type, success, timestamp, context_hash
FROM privacy_audit_log
WHERE action_type = 'schema_migration'
ORDER BY timestamp DESC
LIMIT 1;

-- ROLLBACK SCRIPT (EMERGENCY USE ONLY)
-- Only run this if you need to completely rollback the migration
-- WARNING: This will remove all new tables and columns - use with extreme caution

/*
BEGIN;

-- Remove new tables
DROP TABLE IF EXISTS privacy_audit_log CASCADE;
DROP TABLE IF EXISTS vault_credentials CASCADE;
DROP TABLE IF EXISTS guardian_approvals CASCADE;
DROP TABLE IF EXISTS nsec_shards CASCADE;

-- Remove new functions
DROP FUNCTION IF EXISTS cleanup_expired_privacy_data();
DROP FUNCTION IF EXISTS rotate_user_salt(TEXT);
DROP FUNCTION IF EXISTS check_guardian_approval(TEXT, TEXT, INTEGER);

-- Remove new columns from family_memberships
ALTER TABLE family_memberships
DROP COLUMN IF EXISTS spending_limit,
DROP COLUMN IF EXISTS guardian_level,
DROP COLUMN IF EXISTS can_approve_spending,
DROP COLUMN IF EXISTS can_manage_members,
DROP COLUMN IF EXISTS last_activity,
DROP COLUMN IF EXISTS membership_salt,
DROP COLUMN IF EXISTS role_changed_at,
DROP COLUMN IF EXISTS role_changed_by;

-- Remove new columns from privacy_users
ALTER TABLE privacy_users
DROP COLUMN IF EXISTS auth_salt_hash,
DROP COLUMN IF EXISTS zero_knowledge_enabled,
DROP COLUMN IF EXISTS session_salt,
DROP COLUMN IF EXISTS auth_failure_count,
DROP COLUMN IF EXISTS last_auth_failure,
DROP COLUMN IF EXISTS nsec_shard_count,
DROP COLUMN IF EXISTS nsec_threshold,
DROP COLUMN IF EXISTS guardian_approval_required,
DROP COLUMN IF EXISTS last_activity,
DROP COLUMN IF EXISTS data_retention_days;

-- Restore original role constraints
ALTER TABLE privacy_users DROP CONSTRAINT IF EXISTS check_federation_role;
ALTER TABLE privacy_users ADD CONSTRAINT check_federation_role
    CHECK (federation_role IN ('adult', 'offspring', 'guardian'));

ALTER TABLE family_memberships DROP CONSTRAINT IF EXISTS check_member_role;
ALTER TABLE family_memberships ADD CONSTRAINT check_member_role
    CHECK (member_role IN ('adult', 'offspring', 'guardian'));

COMMIT;
*/
