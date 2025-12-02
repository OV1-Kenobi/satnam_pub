-- Family Foundry Production Migration - Phase 4 Deployment
-- Date: December 1, 2025
-- Purpose: Add FROST threshold configuration, NFC MFA policies, and audit trails
-- Idempotent: Safe for re-execution in production
-- Master Context Compliance: Privacy-first, zero-knowledge architecture

-- ============================================================================
-- PART 1: FAMILY_FEDERATIONS TABLE ENHANCEMENTS
-- ============================================================================

-- Add FROST threshold configuration columns (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'family_federations' AND column_name = 'frost_threshold'
    ) THEN
        ALTER TABLE family_federations 
        ADD COLUMN frost_threshold INTEGER DEFAULT 2 CHECK (frost_threshold >= 1 AND frost_threshold <= 5);
        
        COMMENT ON COLUMN family_federations.frost_threshold IS 
            'User-configurable FROST signing threshold (1-5). Default: 2-of-3';
    END IF;
END $$;

-- Add NFC MFA policy columns (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'family_federations' AND column_name = 'nfc_mfa_policy'
    ) THEN
        ALTER TABLE family_federations 
        ADD COLUMN nfc_mfa_policy TEXT DEFAULT 'required_for_high_value' 
            CHECK (nfc_mfa_policy IN ('disabled', 'optional', 'required_for_high_value', 'required_for_all'));
        
        COMMENT ON COLUMN family_federations.nfc_mfa_policy IS 
            'NFC MFA enforcement policy for federation operations';
    END IF;
END $$;

-- Add NFC MFA amount threshold (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'family_federations' AND column_name = 'nfc_mfa_amount_threshold'
    ) THEN
        ALTER TABLE family_federations 
        ADD COLUMN nfc_mfa_amount_threshold BIGINT DEFAULT 100000;
        
        COMMENT ON COLUMN family_federations.nfc_mfa_amount_threshold IS 
            'Amount threshold (in satoshis) for NFC MFA requirement. Default: 100,000 sats';
    END IF;
END $$;

-- Add NFC MFA steward threshold (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'family_federations' AND column_name = 'nfc_mfa_threshold'
    ) THEN
        ALTER TABLE family_federations 
        ADD COLUMN nfc_mfa_threshold INTEGER DEFAULT 2 CHECK (nfc_mfa_threshold >= 1 AND nfc_mfa_threshold <= 5);
        
        COMMENT ON COLUMN family_federations.nfc_mfa_threshold IS 
            'Number of NFC signatures required for high-value operations. Default: 2';
    END IF;
END $$;

-- ============================================================================
-- PART 2: FROST_SIGNING_SESSIONS TABLE CREATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS frost_signing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    family_id TEXT NOT NULL,
    message_hash TEXT NOT NULL,
    event_template TEXT,
    event_type TEXT,
    
    -- Participant configuration
    participants JSONB NOT NULL,
    threshold INTEGER NOT NULL CHECK (threshold >= 1 AND threshold <= 5),
    
    -- FROST multi-round state
    nonce_commitments JSONB DEFAULT '{}',
    partial_signatures JSONB DEFAULT '{}',
    final_signature JSONB,
    nfc_signatures JSONB DEFAULT '{}',
    nfc_verification_status TEXT DEFAULT 'pending',
    
    -- Session metadata
    created_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'nonce_collection', 'signing', 'aggregating', 'completed', 'failed', 'expired')),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Error tracking
    error_message TEXT,
    
    -- Constraints
    CONSTRAINT frost_sessions_family_fk FOREIGN KEY (family_id) 
        REFERENCES family_federations(federation_duid) ON DELETE CASCADE,
    CONSTRAINT valid_completion CHECK (
        (status = 'completed' AND final_signature IS NOT NULL) OR (status != 'completed')
    ),
    CONSTRAINT valid_failure CHECK (
        (status = 'failed' AND error_message IS NOT NULL) OR (status != 'failed')
    )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_frost_sessions_family_id ON frost_signing_sessions(family_id);
CREATE INDEX IF NOT EXISTS idx_frost_sessions_status ON frost_signing_sessions(status);
CREATE INDEX IF NOT EXISTS idx_frost_sessions_created_by ON frost_signing_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_frost_sessions_expires_at ON frost_signing_sessions(expires_at);

-- ============================================================================
-- PART 3: AUDIT TRAIL TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS federation_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    actor_duid TEXT NOT NULL,
    operation_hash TEXT,
    details JSONB DEFAULT '{}',
    status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT audit_log_family_fk FOREIGN KEY (family_id) 
        REFERENCES family_federations(federation_duid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_log_family_id ON federation_audit_log(family_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON federation_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_operation_type ON federation_audit_log(operation_type);

-- ============================================================================
-- PART 4: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on frost_signing_sessions
ALTER TABLE frost_signing_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view FROST sessions for their federations
CREATE POLICY IF NOT EXISTS frost_sessions_view_policy ON frost_signing_sessions
    FOR SELECT
    USING (
        family_id IN (
            SELECT federation_duid FROM family_federations ff
            INNER JOIN family_members fm ON ff.id = fm.family_federation_id
            WHERE fm.user_duid = auth.uid()::text AND fm.is_active = true
        )
    );

-- Policy: Only federation creators can create FROST sessions
CREATE POLICY IF NOT EXISTS frost_sessions_create_policy ON frost_signing_sessions
    FOR INSERT
    WITH CHECK (
        created_by = auth.uid()::text OR
        created_by IN (
            SELECT user_duid FROM family_members
            WHERE family_federation_id = (
                SELECT id FROM family_federations WHERE federation_duid = family_id
            ) AND family_role IN ('steward', 'guardian') AND is_active = true
        )
    );

-- Enable RLS on federation_audit_log
ALTER TABLE federation_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view audit logs for their federations
CREATE POLICY IF NOT EXISTS audit_log_view_policy ON federation_audit_log
    FOR SELECT
    USING (
        family_id IN (
            SELECT federation_duid FROM family_federations ff
            INNER JOIN family_members fm ON ff.id = fm.family_federation_id
            WHERE fm.user_duid = auth.uid()::text AND fm.is_active = true
        )
    );

-- ============================================================================
-- PART 5: MIGRATION VERIFICATION
-- ============================================================================

-- Verify all columns exist
DO $$
DECLARE
    missing_columns TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Check family_federations columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family_federations' AND column_name = 'frost_threshold') THEN
        missing_columns := array_append(missing_columns, 'family_federations.frost_threshold');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'family_federations' AND column_name = 'nfc_mfa_policy') THEN
        missing_columns := array_append(missing_columns, 'family_federations.nfc_mfa_policy');
    END IF;
    
    -- Check frost_signing_sessions table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'frost_signing_sessions') THEN
        missing_columns := array_append(missing_columns, 'frost_signing_sessions (table)');
    END IF;
    
    -- Check audit_log table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'federation_audit_log') THEN
        missing_columns := array_append(missing_columns, 'federation_audit_log (table)');
    END IF;
    
    IF array_length(missing_columns, 1) > 0 THEN
        RAISE WARNING 'Migration verification failed. Missing: %', missing_columns;
    ELSE
        RAISE NOTICE 'Migration verification successful. All tables and columns created.';
    END IF;
END $$;

