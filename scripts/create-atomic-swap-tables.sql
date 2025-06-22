-- Atomic Swap Database Schema
-- Creates tables for tracking atomic swaps between Fedimint and Cashu

-- Main atomic swaps table
CREATE TABLE IF NOT EXISTS atomic_swaps (
    id SERIAL PRIMARY KEY,
    swap_id VARCHAR(255) UNIQUE NOT NULL,
    from_context VARCHAR(20) NOT NULL CHECK (from_context IN ('family', 'individual')),
    to_context VARCHAR(20) NOT NULL CHECK (to_context IN ('family', 'individual')),
    from_member_id VARCHAR(255) NOT NULL,
    to_member_id VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    swap_type VARCHAR(50) NOT NULL CHECK (swap_type IN ('fedimint_to_cashu', 'cashu_to_fedimint', 'fedimint_to_lightning', 'lightning_to_fedimint')),
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('allowance', 'gift', 'emergency', 'transfer')),
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'processing', 'completed', 'failed', 'cancelled')),
    from_tx_id VARCHAR(255),
    bridge_tx_id VARCHAR(255),
    to_tx_id VARCHAR(255),
    fedimint_fee BIGINT DEFAULT 0,
    lightning_fee BIGINT DEFAULT 0,
    cashu_fee BIGINT DEFAULT 0,
    total_fee BIGINT DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Atomic swap logs table for detailed step tracking
CREATE TABLE IF NOT EXISTS atomic_swap_logs (
    id SERIAL PRIMARY KEY,
    swap_id VARCHAR(255) NOT NULL REFERENCES atomic_swaps(swap_id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    tx_id VARCHAR(255),
    error TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_atomic_swaps_swap_id ON atomic_swaps(swap_id);
CREATE INDEX IF NOT EXISTS idx_atomic_swaps_from_member ON atomic_swaps(from_member_id);
CREATE INDEX IF NOT EXISTS idx_atomic_swaps_to_member ON atomic_swaps(to_member_id);
CREATE INDEX IF NOT EXISTS idx_atomic_swaps_status ON atomic_swaps(status);
CREATE INDEX IF NOT EXISTS idx_atomic_swaps_created_at ON atomic_swaps(created_at);
CREATE INDEX IF NOT EXISTS idx_atomic_swap_logs_swap_id ON atomic_swap_logs(swap_id);
CREATE INDEX IF NOT EXISTS idx_atomic_swap_logs_step ON atomic_swap_logs(step_number);

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_atomic_swap_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Set completed_at when status changes to completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update timestamps
DROP TRIGGER IF EXISTS trigger_update_atomic_swap_updated_at ON atomic_swaps;
CREATE TRIGGER trigger_update_atomic_swap_updated_at
    BEFORE UPDATE ON atomic_swaps
    FOR EACH ROW
    EXECUTE FUNCTION update_atomic_swap_updated_at();

-- View for swap statistics
CREATE OR REPLACE VIEW atomic_swap_stats AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    swap_type,
    status,
    COUNT(*) as count,
    SUM(amount) as total_amount,
    SUM(total_fee) as total_fees,
    AVG(amount) as avg_amount,
    AVG(total_fee) as avg_fee
FROM atomic_swaps
GROUP BY DATE_TRUNC('day', created_at), swap_type, status
ORDER BY date DESC, swap_type, status;

-- View for member swap history
CREATE OR REPLACE VIEW member_swap_history AS
SELECT 
    s.swap_id,
    s.from_member_id,
    s.to_member_id,
    s.amount,
    s.swap_type,
    s.purpose,
    s.status,
    s.total_fee,
    s.created_at,
    s.completed_at,
    EXTRACT(EPOCH FROM (COALESCE(s.completed_at, NOW()) - s.created_at)) as duration_seconds
FROM atomic_swaps s
ORDER BY s.created_at DESC;

-- Insert some sample data for testing (optional)
-- INSERT INTO atomic_swaps (
--     swap_id, from_context, to_context, from_member_id, to_member_id,
--     amount, swap_type, purpose, status
-- ) VALUES (
--     'swap_test_001', 'family', 'individual', 'family_treasury', 'demo_user_123',
--     10000, 'fedimint_to_cashu', 'allowance', 'completed'
-- );

COMMENT ON TABLE atomic_swaps IS 'Main table for tracking atomic swaps between different ecash protocols';
COMMENT ON TABLE atomic_swap_logs IS 'Detailed step-by-step logs for atomic swap execution';
COMMENT ON VIEW atomic_swap_stats IS 'Aggregated statistics for atomic swaps by date, type, and status';
COMMENT ON VIEW member_swap_history IS 'Complete swap history for members with duration calculations';