-- Emergency Security Migration: 010_emergency_security_fixes.sql
-- CRITICAL: This migration addresses immediate security vulnerabilities
-- Must be run IMMEDIATELY to protect family financial privacy

-- Enable Row Level Security on all family tables
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE lightning_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE federation_guardians ENABLE ROW LEVEL SECURITY;

-- Family Members RLS Policy
DROP POLICY IF EXISTS family_members_isolation ON family_members;
CREATE POLICY family_members_isolation ON family_members
    FOR ALL 
    USING (
        -- Only allow access to members of the same family
        family_id_hash = auth.jwt() ->> 'family_id_hash'
        OR 
        -- Or if user is authenticated and owns this record
        auth.uid()::text = user_id
    );

-- Family Wallets RLS Policy
DROP POLICY IF EXISTS family_wallets_isolation ON family_wallets;
CREATE POLICY family_wallets_isolation ON family_wallets
    FOR ALL
    USING (
        -- Only allow access to wallets of the same family
        family_id = auth.jwt() ->> 'family_id'
        AND family_id != 'anonymous' -- Never expose aggregated data inappropriately
    );

-- Lightning Transactions RLS Policy
DROP POLICY IF EXISTS lightning_transactions_isolation ON lightning_transactions;
CREATE POLICY lightning_transactions_isolation ON lightning_transactions
    FOR ALL
    USING (
        -- Only allow access to transactions of authenticated user's family
        family_id_hash = auth.jwt() ->> 'family_id_hash'
        OR
        -- Or user owns this transaction
        user_id = auth.uid()::text
    );

-- Federation Guardians RLS Policy
DROP POLICY IF EXISTS federation_guardians_isolation ON federation_guardians;
CREATE POLICY federation_guardians_isolation ON federation_guardians
    FOR ALL
    USING (
        -- Only guardians can access guardian records
        auth.uid()::text = guardian_user_id
        OR
        -- Or family members can see their family's guardians (but not keys)
        family_id_hash = auth.jwt() ->> 'family_id_hash'
    );

-- Add encryption columns to family_members table
ALTER TABLE family_members 
    ADD COLUMN IF NOT EXISTS encrypted_name TEXT,
    ADD COLUMN IF NOT EXISTS encrypted_role TEXT,
    ADD COLUMN IF NOT EXISTS encrypted_lightning_balance TEXT,
    ADD COLUMN IF NOT EXISTS encryption_salt TEXT,
    ADD COLUMN IF NOT EXISTS family_id_hash TEXT;

-- Add encryption columns to lightning_transactions table
ALTER TABLE lightning_transactions
    ADD COLUMN IF NOT EXISTS encrypted_amount TEXT,
    ADD COLUMN IF NOT EXISTS encrypted_memo TEXT,
    ADD COLUMN IF NOT EXISTS encryption_salt TEXT,
    ADD COLUMN IF NOT EXISTS family_id_hash TEXT;

-- Create secure function to hash family IDs
CREATE OR REPLACE FUNCTION hash_family_id(input_family_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Use SHA-256 to hash family ID for privacy
    RETURN encode(digest(input_family_id || current_setting('app.family_salt', true), 'sha256'), 'hex');
END;
$$;

-- Create function to validate Lightning payments go through LNProxy
CREATE OR REPLACE FUNCTION validate_lightning_privacy(invoice_data JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if invoice contains privacy wrapper indicators
    IF invoice_data ? 'is_privacy_enabled' THEN
        RETURN (invoice_data ->> 'is_privacy_enabled')::boolean;
    END IF;
    
    -- Check if invoice is wrapped by LNProxy (heuristic)
    IF invoice_data ? 'wrapped_invoice' THEN
        RETURN true;
    END IF;
    
    -- Default to false for safety
    RETURN false;
END;
$$;

-- Add constraint to enforce Lightning privacy
ALTER TABLE lightning_transactions
    ADD CONSTRAINT check_lightning_privacy 
    CHECK (
        -- Only allow transactions that pass privacy validation
        validate_lightning_privacy(invoice_metadata) = true
        OR 
        -- Allow internal family transfers (no external exposure)
        transaction_type = 'internal_transfer'
    );

-- Create audit table for privacy operations
CREATE TABLE IF NOT EXISTS privacy_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    operation_type TEXT NOT NULL CHECK (operation_type IN (
        'encryption', 'decryption', 'key_derivation', 'lnproxy_wrap', 
        'guardian_operation', 'family_access', 'data_export'
    )),
    affected_table TEXT,
    record_id TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on audit log
ALTER TABLE privacy_audit_log ENABLE ROW LEVEL SECURITY;

-- Audit log RLS - users can only see their own logs
CREATE POLICY privacy_audit_user_isolation ON privacy_audit_log
    FOR SELECT
    USING (user_id = auth.uid());

-- Create function to log privacy operations
CREATE OR REPLACE FUNCTION log_privacy_operation(
    p_operation_type TEXT,
    p_affected_table TEXT DEFAULT NULL,
    p_record_id TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO privacy_audit_log (
        user_id, operation_type, affected_table, record_id, 
        success, error_message, ip_address
    ) VALUES (
        auth.uid(), p_operation_type, p_affected_table, p_record_id,
        p_success, p_error_message, inet_client_addr()
    ) RETURNING id INTO audit_id;
    
    RETURN audit_id;
END;
$$;

-- Create trigger to automatically log sensitive operations
CREATE OR REPLACE FUNCTION audit_family_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Log all operations on family_members table
    IF TG_TABLE_NAME = 'family_members' THEN
        PERFORM log_privacy_operation(
            TG_OP::TEXT,
            TG_TABLE_NAME,
            COALESCE(NEW.id::TEXT, OLD.id::TEXT)
        );
    END IF;
    
    -- Log all operations on lightning_transactions table
    IF TG_TABLE_NAME = 'lightning_transactions' THEN
        PERFORM log_privacy_operation(
            TG_OP::TEXT,
            TG_TABLE_NAME,
            COALESCE(NEW.id::TEXT, OLD.id::TEXT)
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply audit triggers
DROP TRIGGER IF EXISTS audit_family_members ON family_members;
CREATE TRIGGER audit_family_members
    AFTER INSERT OR UPDATE OR DELETE ON family_members
    FOR EACH ROW EXECUTE FUNCTION audit_family_operations();

DROP TRIGGER IF EXISTS audit_lightning_transactions ON lightning_transactions;
CREATE TRIGGER audit_lightning_transactions
    AFTER INSERT OR UPDATE OR DELETE ON lightning_transactions
    FOR EACH ROW EXECUTE FUNCTION audit_family_operations();

-- Create emergency security function to validate system state
CREATE OR REPLACE FUNCTION emergency_security_check()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    details TEXT,
    severity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check for unencrypted family member data
    RETURN QUERY
    SELECT 
        'unencrypted_family_data'::TEXT as check_name,
        CASE 
            WHEN COUNT(*) > 0 THEN 'CRITICAL'
            ELSE 'OK'
        END as status,
        'Found ' || COUNT(*) || ' family members with unencrypted data' as details,
        'CRITICAL'::TEXT as severity
    FROM family_members 
    WHERE encrypted_name IS NULL OR encrypted_role IS NULL;
    
    -- Check for missing RLS policies
    RETURN QUERY
    SELECT 
        'missing_rls_policies'::TEXT as check_name,
        CASE 
            WHEN COUNT(*) < 4 THEN 'CRITICAL'
            ELSE 'OK'
        END as status,
        'Found ' || COUNT(*) || ' tables with RLS policies (should be 4+)' as details,
        'CRITICAL'::TEXT as severity
    FROM information_schema.tables t
    LEFT JOIN pg_policies p ON t.table_name = p.tablename
    WHERE t.table_name IN ('family_members', 'family_wallets', 'lightning_transactions', 'federation_guardians')
    AND p.policyname IS NOT NULL;
    
    -- Check for exposed service keys in client code
    RETURN QUERY
    SELECT 
        'environment_security'::TEXT as check_name,
        'WARNING'::TEXT as status,
        'Manual review required: Check for VITE_SUPABASE_SERVICE_ROLE_KEY exposure' as details,
        'HIGH'::TEXT as severity;
    
    RETURN;
END;
$$;

-- Add comments for security documentation
COMMENT ON TABLE privacy_audit_log IS 'Audit trail for all privacy-sensitive operations';
COMMENT ON FUNCTION hash_family_id IS 'Securely hash family IDs to prevent cross-family data access';
COMMENT ON FUNCTION validate_lightning_privacy IS 'Ensure Lightning transactions use privacy protection';
COMMENT ON FUNCTION emergency_security_check IS 'Validate system security posture';

-- Final security validation
SELECT * FROM emergency_security_check();