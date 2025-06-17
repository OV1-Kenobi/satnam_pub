-- PhoenixD Integration Database Schema
-- Adds PhoenixD channel tracking, liquidity events, and automated allowance configuration

-- Add PhoenixD channel ID to family_members table
ALTER TABLE family_members 
ADD COLUMN IF NOT EXISTS phoenixd_channel_id TEXT,
ADD COLUMN IF NOT EXISTS phoenixd_setup_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS phoenixd_last_liquidity_check TIMESTAMP;

-- Add index for efficient channel lookups
CREATE INDEX IF NOT EXISTS idx_family_members_phoenixd_channel 
ON family_members(phoenixd_channel_id) 
WHERE phoenixd_channel_id IS NOT NULL;

-- Create phoenixd_liquidity_events table for tracking all liquidity operations
CREATE TABLE IF NOT EXISTS phoenixd_liquidity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  amount_sat BIGINT NOT NULL CHECK (amount_sat > 0),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('allowance', 'emergency', 'manual', 'scheduled')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
  fees_sat BIGINT NOT NULL DEFAULT 0 CHECK (fees_sat >= 0),
  urgency TEXT CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  reason TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata for audit and analysis
  node_info JSONB,
  privacy_enabled BOOLEAN DEFAULT false,
  privacy_fee_sat BIGINT DEFAULT 0,
  
  -- Constraints
  CONSTRAINT valid_completion_time CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR 
    (status != 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT valid_error_message CHECK (
    (status = 'failed' AND error_message IS NOT NULL) OR 
    (status != 'failed' AND error_message IS NULL)
  )
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_phoenixd_liquidity_events_family_member 
ON phoenixd_liquidity_events(family_member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phoenixd_liquidity_events_status 
ON phoenixd_liquidity_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phoenixd_liquidity_events_trigger_type 
ON phoenixd_liquidity_events(trigger_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phoenixd_liquidity_events_channel 
ON phoenixd_liquidity_events(channel_id, created_at DESC);

-- Create automated_allowance_config table for family allowance automation
CREATE TABLE IF NOT EXISTS automated_allowance_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  
  -- Allowance configuration
  enabled BOOLEAN NOT NULL DEFAULT false,
  amount_sat BIGINT NOT NULL CHECK (amount_sat > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  next_payment TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Automation settings
  auto_topup BOOLEAN NOT NULL DEFAULT true,
  emergency_threshold_sat BIGINT NOT NULL DEFAULT 10000 CHECK (emergency_threshold_sat >= 0),
  max_emergency_amount_sat BIGINT NOT NULL DEFAULT 100000 CHECK (max_emergency_amount_sat >= 0),
  preparation_days INTEGER NOT NULL DEFAULT 2 CHECK (preparation_days >= 0),
  
  -- Limits and controls
  daily_limit_sat BIGINT CHECK (daily_limit_sat > 0),
  weekly_limit_sat BIGINT CHECK (weekly_limit_sat > 0),
  monthly_limit_sat BIGINT CHECK (monthly_limit_sat > 0),
  
  -- Tracking
  total_paid_sat BIGINT NOT NULL DEFAULT 0 CHECK (total_paid_sat >= 0),
  payments_count INTEGER NOT NULL DEFAULT 0 CHECK (payments_count >= 0),
  last_payment TIMESTAMP WITH TIME ZONE,
  last_liquidity_check TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by UUID,
  
  -- Ensure one config per family member
  CONSTRAINT unique_family_member_allowance UNIQUE (family_member_id),
  
  -- Logical constraints
  CONSTRAINT valid_limits CHECK (
    (daily_limit_sat IS NULL OR daily_limit_sat >= amount_sat) AND
    (weekly_limit_sat IS NULL OR weekly_limit_sat >= amount_sat * 7) AND
    (monthly_limit_sat IS NULL OR monthly_limit_sat >= amount_sat * 30)
  )
);

-- Add indexes for automated_allowance_config
CREATE INDEX IF NOT EXISTS idx_automated_allowance_config_next_payment 
ON automated_allowance_config(next_payment) 
WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_automated_allowance_config_family_member 
ON automated_allowance_config(family_member_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger for automated_allowance_config updated_at
CREATE TRIGGER update_automated_allowance_config_updated_at 
  BEFORE UPDATE ON automated_allowance_config 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Create view for family liquidity summary
CREATE OR REPLACE VIEW family_liquidity_summary AS
SELECT 
  fm.id,
  fm.username,
  fm.name,
  fm.role,
  fm.phoenixd_channel_id,
  fm.phoenixd_setup_date,
  fm.phoenixd_last_liquidity_check,
  
  -- Allowance configuration
  aac.enabled as allowance_enabled,
  aac.amount_sat as allowance_amount,
  aac.frequency as allowance_frequency,
  aac.next_payment as next_allowance_payment,
  aac.auto_topup,
  aac.emergency_threshold_sat,
  
  -- Recent liquidity events
  (
    SELECT COUNT(*) 
    FROM phoenixd_liquidity_events ple 
    WHERE ple.family_member_id = fm.id 
    AND ple.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
  ) as liquidity_events_30d,
  
  (
    SELECT COALESCE(SUM(amount_sat), 0) 
    FROM phoenixd_liquidity_events ple 
    WHERE ple.family_member_id = fm.id 
    AND ple.status = 'completed'
    AND ple.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
  ) as total_liquidity_30d,
  
  (
    SELECT COALESCE(SUM(fees_sat), 0) 
    FROM phoenixd_liquidity_events ple 
    WHERE ple.family_member_id = fm.id 
    AND ple.status = 'completed'
    AND ple.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
  ) as total_fees_30d,
  
  -- Last liquidity event
  (
    SELECT ple.created_at 
    FROM phoenixd_liquidity_events ple 
    WHERE ple.family_member_id = fm.id 
    ORDER BY ple.created_at DESC 
    LIMIT 1
  ) as last_liquidity_event

FROM family_members fm
LEFT JOIN automated_allowance_config aac ON fm.id = aac.family_member_id
WHERE fm.phoenixd_channel_id IS NOT NULL;

-- Create function to check if allowance payment is due
CREATE OR REPLACE FUNCTION is_allowance_due(
  p_family_member_id UUID,
  p_preparation_days INTEGER DEFAULT 2
) RETURNS BOOLEAN AS $$
DECLARE
  v_next_payment TIMESTAMP WITH TIME ZONE;
  v_enabled BOOLEAN;
BEGIN
  SELECT next_payment, enabled 
  INTO v_next_payment, v_enabled
  FROM automated_allowance_config 
  WHERE family_member_id = p_family_member_id;
  
  IF NOT FOUND OR NOT v_enabled THEN
    RETURN FALSE;
  END IF;
  
  RETURN v_next_payment <= CURRENT_TIMESTAMP + (p_preparation_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Create function to get family members needing liquidity attention
CREATE OR REPLACE FUNCTION get_family_members_needing_liquidity(
  p_preparation_days INTEGER DEFAULT 2
) RETURNS TABLE (
  family_member_id UUID,
  username TEXT,
  name TEXT,
  reason TEXT,
  priority INTEGER,
  allowance_due BOOLEAN,
  next_payment TIMESTAMP WITH TIME ZONE,
  allowance_amount BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fm.id,
    fm.username,
    fm.name,
    CASE 
      WHEN is_allowance_due(fm.id, p_preparation_days) THEN 'Allowance due soon'
      WHEN aac.emergency_threshold_sat > 0 THEN 'Emergency threshold monitoring'
      ELSE 'Regular monitoring'
    END as reason,
    CASE 
      WHEN is_allowance_due(fm.id, p_preparation_days) THEN 1
      ELSE 2
    END as priority,
    is_allowance_due(fm.id, p_preparation_days) as allowance_due,
    aac.next_payment,
    aac.amount_sat
  FROM family_members fm
  LEFT JOIN automated_allowance_config aac ON fm.id = aac.family_member_id
  WHERE fm.phoenixd_channel_id IS NOT NULL
    AND (
      aac.enabled = true 
      OR aac.emergency_threshold_sat > 0
    )
  ORDER BY priority, aac.next_payment;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE phoenixd_liquidity_events IS 'Tracks all PhoenixD liquidity operations for family members';
COMMENT ON TABLE automated_allowance_config IS 'Configuration for automated family allowance payments and liquidity management';
COMMENT ON VIEW family_liquidity_summary IS 'Summary view of family member liquidity status and configuration';
COMMENT ON FUNCTION is_allowance_due IS 'Checks if a family member allowance payment is due within preparation period';
COMMENT ON FUNCTION get_family_members_needing_liquidity IS 'Returns family members that may need liquidity attention';

-- Grant appropriate permissions (adjust role names as needed)
-- GRANT SELECT, INSERT, UPDATE ON phoenixd_liquidity_events TO satnam_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON automated_allowance_config TO satnam_app;
-- GRANT SELECT ON family_liquidity_summary TO satnam_app;
-- GRANT EXECUTE ON FUNCTION is_allowance_due TO satnam_app;
-- GRANT EXECUTE ON FUNCTION get_family_members_needing_liquidity TO satnam_app;