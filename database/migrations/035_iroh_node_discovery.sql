-- Iroh Node Discovery Migration
-- Phase 2: Store Iroh node discovery results and reachability verification
-- Enables decentralized node discovery via DHT and direct address resolution
--
-- COMPLIANCE:
-- ✅ Privacy-first: No PII stored, only node identifiers and addresses
-- ✅ Row Level Security (RLS) for user data isolation
-- ✅ Idempotent: Safe to run multiple times
-- ✅ Backward compatible: No breaking changes to existing schema

-- Enable RLS if not already enabled
ALTER DATABASE postgres SET row_security = on;

-- Create iroh_node_discovery table
CREATE TABLE IF NOT EXISTS public.iroh_node_discovery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to verification attempt
    verification_id UUID NOT NULL,
    
    -- Iroh node identifier (base32 encoded)
    node_id VARCHAR(64) NOT NULL,
    
    -- Relay URL for DERP fallback
    relay_url VARCHAR(255),
    
    -- Direct addresses (IPv4/IPv6 with ports, stored as JSON array)
    direct_addresses JSONB,
    
    -- Discovery and verification timestamps
    discovered_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    last_seen BIGINT,
    
    -- Reachability status
    is_reachable BOOLEAN,
    
    -- Constraints
    CONSTRAINT verification_fk FOREIGN KEY (verification_id)
        REFERENCES multi_method_verification_results(id) ON DELETE CASCADE,
    CONSTRAINT node_id_format CHECK (node_id ~ '^[a-z2-7]{52}$'),
    CONSTRAINT relay_url_format CHECK (relay_url IS NULL OR relay_url ~ '^https?://')
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_iroh_verification 
    ON iroh_node_discovery(verification_id);
CREATE INDEX IF NOT EXISTS idx_iroh_node_id 
    ON iroh_node_discovery(node_id);
CREATE INDEX IF NOT EXISTS idx_iroh_is_reachable 
    ON iroh_node_discovery(is_reachable);
CREATE INDEX IF NOT EXISTS idx_iroh_last_seen 
    ON iroh_node_discovery(last_seen DESC);

-- Enable RLS
ALTER TABLE public.iroh_node_discovery ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role can insert new discoveries
CREATE POLICY "service_role_insert_iroh_discovery"
    ON public.iroh_node_discovery
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- RLS Policy: Users can view their own node discoveries
CREATE POLICY "users_view_own_iroh_discovery"
    ON public.iroh_node_discovery
    FOR SELECT
    USING (
        verification_id IN (
            SELECT id FROM multi_method_verification_results 
            WHERE user_duid = auth.uid()
        )
    );

-- RLS Policy: Service role can update discovery status
CREATE POLICY "service_role_update_iroh_discovery"
    ON public.iroh_node_discovery
    FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Helper function: Store Iroh node discovery result
CREATE OR REPLACE FUNCTION store_iroh_discovery(
    p_verification_id UUID,
    p_node_id VARCHAR,
    p_relay_url VARCHAR,
    p_direct_addresses JSONB,
    p_is_reachable BOOLEAN
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO iroh_node_discovery (
        verification_id,
        node_id,
        relay_url,
        direct_addresses,
        is_reachable,
        last_seen
    ) VALUES (
        p_verification_id,
        p_node_id,
        p_relay_url,
        p_direct_addresses,
        p_is_reachable,
        EXTRACT(EPOCH FROM NOW())::BIGINT
    )
    ON CONFLICT (verification_id, node_id) DO UPDATE SET
        relay_url = EXCLUDED.relay_url,
        direct_addresses = EXCLUDED.direct_addresses,
        is_reachable = EXCLUDED.is_reachable,
        last_seen = EXTRACT(EPOCH FROM NOW())::BIGINT
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get Iroh node discovery by verification_id
CREATE OR REPLACE FUNCTION get_iroh_discovery(
    p_verification_id UUID
) RETURNS TABLE (
    id UUID,
    node_id VARCHAR,
    relay_url VARCHAR,
    direct_addresses JSONB,
    discovered_at BIGINT,
    last_seen BIGINT,
    is_reachable BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        iroh_node_discovery.id,
        iroh_node_discovery.node_id,
        iroh_node_discovery.relay_url,
        iroh_node_discovery.direct_addresses,
        iroh_node_discovery.discovered_at,
        iroh_node_discovery.last_seen,
        iroh_node_discovery.is_reachable
    FROM iroh_node_discovery
    WHERE iroh_node_discovery.verification_id = p_verification_id
    ORDER BY iroh_node_discovery.last_seen DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Update node reachability status
CREATE OR REPLACE FUNCTION update_iroh_reachability(
    p_node_id VARCHAR,
    p_is_reachable BOOLEAN
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE iroh_node_discovery
    SET 
        is_reachable = p_is_reachable,
        last_seen = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE node_id = p_node_id;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON iroh_node_discovery TO authenticated;
GRANT EXECUTE ON FUNCTION store_iroh_discovery TO authenticated;
GRANT EXECUTE ON FUNCTION get_iroh_discovery TO authenticated;
GRANT EXECUTE ON FUNCTION update_iroh_reachability TO authenticated;

