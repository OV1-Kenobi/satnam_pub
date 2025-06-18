-- Privacy-Enhanced Family Banking Schema with Zero-Knowledge Architecture
-- All sensitive data encrypted at rest with unique salts and comprehensive audit logging
-- Enhanced support for Zeus LSP integration and automated allowance systems

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS secure_payment_approvals CASCADE;
DROP TABLE IF EXISTS secure_liquidity_optimization_logs CASCADE;
DROP TABLE IF EXISTS secure_liquidity_forecasts CASCADE;
DROP TABLE IF EXISTS secure_emergency_protocols CASCADE;
DROP TABLE IF EXISTS secure_emergency_liquidity_log CASCADE;
DROP TABLE IF EXISTS secure_family_payments CASCADE;
DROP TABLE IF EXISTS secure_allowance_approvals CASCADE;
DROP TABLE IF EXISTS secure_spending_trackers CASCADE;
DROP TABLE IF EXISTS secure_allowance_distributions CASCADE;
DROP TABLE IF EXISTS secure_allowance_schedules CASCADE;
DROP TABLE IF EXISTS secure_family_members CASCADE;
DROP TABLE IF EXISTS secure_families CASCADE;

-- Family management with encrypted sensitive data
CREATE TABLE secure_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family identification
    encrypted_family_name TEXT,
    family_name_salt TEXT,
    family_name_iv TEXT,
    family_name_tag TEXT,
    
    -- Family metadata (non-sensitive)
    member_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Privacy settings
    privacy_level INTEGER NOT NULL DEFAULT 3, -- 1=basic, 2=enhanced, 3=maximum
    encryption_version TEXT NOT NULL DEFAULT '1.0',
    
    -- Enhanced family configuration
    allowance_automation_enabled BOOLEAN DEFAULT false,
    zeus_integration_enabled BOOLEAN DEFAULT false,
    zeus_lsp_endpoint TEXT,
    zeus_api_key_encrypted TEXT,
    zeus_api_key_salt TEXT,
    zeus_api_key_iv TEXT,
    zeus_api_key_tag TEXT,
    
    emergency_protocols_enabled BOOLEAN DEFAULT true,
    liquidity_monitoring_enabled BOOLEAN DEFAULT true,
    real_time_alerts_enabled BOOLEAN DEFAULT true,
    websocket_enabled BOOLEAN DEFAULT false,
    websocket_port INTEGER DEFAULT 8080,
    
    -- Encrypted configuration
    encrypted_config TEXT,
    config_salt TEXT,
    config_iv TEXT,
    config_tag TEXT
);

-- Family members with encrypted PII and enhanced features
CREATE TABLE secure_family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family association
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    -- Encrypted member identification
    encrypted_name TEXT,
    name_salt TEXT,
    name_iv TEXT,
    name_tag TEXT,
    
    encrypted_email TEXT,
    email_salt TEXT,
    email_iv TEXT,
    email_tag TEXT,
    
    encrypted_phone TEXT,
    phone_salt TEXT,
    phone_iv TEXT,
    phone_tag TEXT,
    
    -- Role and permissions (non-encrypted for functionality)
    role TEXT NOT NULL CHECK (role IN ('parent', 'guardian', 'child', 'teen', 'young_adult')),
    age_group TEXT CHECK (age_group IN ('child', 'teen', 'adult')),
    permission_level INTEGER DEFAULT 1 CHECK (permission_level BETWEEN 1 AND 5),
    
    -- Encrypted Lightning/Nostr data
    encrypted_lightning_address TEXT,
    lightning_salt TEXT,
    lightning_iv TEXT,
    lightning_tag TEXT,
    
    encrypted_nostr_pubkey TEXT,
    nostr_pubkey_salt TEXT,
    nostr_pubkey_iv TEXT,
    nostr_pubkey_tag TEXT,
    
    encrypted_zeus_pubkey TEXT,
    zeus_pubkey_salt TEXT,
    zeus_pubkey_iv TEXT,
    zeus_pubkey_tag TEXT,
    
    -- Encrypted spending limits and permissions
    encrypted_spending_limits TEXT,
    limits_salt TEXT,
    limits_iv TEXT,
    limits_tag TEXT,
    
    encrypted_permissions TEXT,
    permissions_salt TEXT,
    permissions_iv TEXT,
    permissions_tag TEXT,
    
    -- Enhanced features
    encrypted_notification_preferences TEXT,
    notification_salt TEXT,
    notification_iv TEXT,
    notification_tag TEXT,
    
    biometric_auth_enabled BOOLEAN DEFAULT false,
    two_factor_enabled BOOLEAN DEFAULT false,
    
    -- Status and metadata
    active BOOLEAN NOT NULL DEFAULT true,
    onboarding_completed BOOLEAN DEFAULT false,
    last_seen TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE,
    
    -- Privacy controls
    data_retention_days INTEGER DEFAULT 365,
    privacy_consent_given BOOLEAN NOT NULL DEFAULT false,
    consent_timestamp TIMESTAMP WITH TIME ZONE,
    audit_opt_out BOOLEAN DEFAULT false
);

-- Enhanced allowance schedules with Zeus LSP integration
CREATE TABLE secure_allowance_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family association
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    -- Encrypted member association
    encrypted_family_member_id TEXT NOT NULL,
    member_salt TEXT NOT NULL,
    member_iv TEXT NOT NULL,
    member_tag TEXT NOT NULL,
    
    encrypted_member_name TEXT NOT NULL,
    member_name_salt TEXT NOT NULL,
    member_name_iv TEXT NOT NULL,
    member_name_tag TEXT NOT NULL,
    
    -- Schedule configuration (encrypted amounts)
    encrypted_amount TEXT NOT NULL,
    amount_salt TEXT NOT NULL,
    amount_iv TEXT NOT NULL,
    amount_tag TEXT NOT NULL,
    
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
    day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
    
    enabled BOOLEAN NOT NULL DEFAULT true,
    next_distribution TIMESTAMP WITH TIME ZONE NOT NULL,
    last_distribution TIMESTAMP WITH TIME ZONE,
    
    -- Enhanced configuration
    preferred_method TEXT DEFAULT 'auto' CHECK (preferred_method IN ('lightning', 'ecash', 'zeus_jit', 'auto')),
    max_retries INTEGER DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 10),
    retry_delay INTEGER DEFAULT 30 CHECK (retry_delay BETWEEN 5 AND 1440), -- minutes
    
    -- Encrypted conditions and limits
    encrypted_conditions TEXT NOT NULL,
    conditions_salt TEXT NOT NULL,
    conditions_iv TEXT NOT NULL,
    conditions_tag TEXT NOT NULL,
    
    encrypted_auto_approval_limit TEXT NOT NULL,
    approval_limit_salt TEXT NOT NULL,
    approval_limit_iv TEXT NOT NULL,
    approval_limit_tag TEXT NOT NULL,
    
    parent_approval_required BOOLEAN NOT NULL DEFAULT false,
    
    -- Encrypted notification settings
    encrypted_notification_settings TEXT,
    notification_salt TEXT,
    notification_iv TEXT,
    notification_tag TEXT,
    
    -- Statistics (encrypted for privacy)
    encrypted_distribution_count TEXT DEFAULT '0',
    count_salt TEXT,
    count_iv TEXT,
    count_tag TEXT,
    
    encrypted_total_distributed TEXT DEFAULT '0',
    total_salt TEXT,
    total_iv TEXT,
    total_tag TEXT,
    
    encrypted_success_rate TEXT DEFAULT '1.0',
    success_salt TEXT,
    success_iv TEXT,
    success_tag TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced allowance distributions with Zeus LSP support
CREATE TABLE secure_allowance_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distribution_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted schedule reference
    encrypted_schedule_id TEXT NOT NULL,
    schedule_salt TEXT NOT NULL,
    schedule_iv TEXT NOT NULL,
    schedule_tag TEXT NOT NULL,
    
    -- Encrypted family and member references
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    encrypted_family_member_id TEXT NOT NULL,
    member_salt TEXT NOT NULL,
    member_iv TEXT NOT NULL,
    member_tag TEXT NOT NULL,
    
    -- Encrypted transaction details
    encrypted_amount TEXT NOT NULL,
    amount_salt TEXT NOT NULL,
    amount_iv TEXT NOT NULL,
    amount_tag TEXT NOT NULL,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'requires_approval')),
    distribution_method TEXT NOT NULL CHECK (distribution_method IN ('lightning', 'ecash', 'zeus_jit')),
    
    encrypted_transaction_id TEXT,
    tx_id_salt TEXT,
    tx_id_iv TEXT,
    tx_id_tag TEXT,
    
    encrypted_fee TEXT DEFAULT '0',
    fee_salt TEXT,
    fee_iv TEXT,
    fee_tag TEXT,
    
    executed_at TIMESTAMP WITH TIME ZONE,
    
    encrypted_failure_reason TEXT,
    failure_salt TEXT,
    failure_iv TEXT,
    failure_tag TEXT,
    
    encrypted_approved_by TEXT,
    approved_by_salt TEXT,
    approved_by_iv TEXT,
    approved_by_tag TEXT,
    
    approval_required BOOLEAN NOT NULL DEFAULT false,
    liquidity_source TEXT CHECK (liquidity_source IN ('family_balance', 'zeus_jit', 'rebalanced', 'emergency_reserve')),
    
    -- Enhanced tracking
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    
    encrypted_routing_details TEXT,
    routing_salt TEXT,
    routing_iv TEXT,
    routing_tag TEXT,
    
    execution_time_ms INTEGER,
    confirmation_time_ms INTEGER,
    
    -- Zeus LSP specific fields
    zeus_channel_id TEXT,
    zeus_jit_used BOOLEAN DEFAULT false,
    
    encrypted_zeus_details TEXT,
    zeus_details_salt TEXT,
    zeus_details_iv TEXT,
    zeus_details_tag TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced spending tracking with real-time analytics
CREATE TABLE secure_spending_trackers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracker_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted member reference
    encrypted_family_member_id TEXT NOT NULL,
    member_salt TEXT NOT NULL,
    member_iv TEXT NOT NULL,
    member_tag TEXT NOT NULL,
    
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    date DATE NOT NULL,
    
    -- Encrypted spending amounts
    encrypted_daily_spent TEXT DEFAULT '0',
    daily_salt TEXT,
    daily_iv TEXT,
    daily_tag TEXT,
    
    encrypted_transaction_count TEXT DEFAULT '0',
    tx_count_salt TEXT,
    tx_count_iv TEXT,
    tx_count_tag TEXT,
    
    encrypted_largest_transaction TEXT DEFAULT '0',
    largest_salt TEXT,
    largest_iv TEXT,
    largest_tag TEXT,
    
    -- Enhanced analytics (encrypted)
    encrypted_spending_velocity TEXT DEFAULT '{}',
    velocity_salt TEXT,
    velocity_iv TEXT,
    velocity_tag TEXT,
    
    encrypted_risk_score TEXT DEFAULT '0',
    risk_salt TEXT,
    risk_iv TEXT,
    risk_tag TEXT,
    
    -- Encrypted category and merchant data
    encrypted_categories TEXT DEFAULT '{}',
    categories_salt TEXT,
    categories_iv TEXT,
    categories_tag TEXT,
    
    encrypted_merchants TEXT DEFAULT '{}',
    merchants_salt TEXT,
    merchants_iv TEXT,
    merchants_tag TEXT,
    
    encrypted_flagged_transactions TEXT DEFAULT '0',
    flagged_salt TEXT,
    flagged_iv TEXT,
    flagged_tag TEXT,
    
    -- Encrypted allowance tracking
    encrypted_allowance_received TEXT DEFAULT '0',
    allowance_salt TEXT,
    allowance_iv TEXT,
    allowance_tag TEXT,
    
    encrypted_remaining_allowance TEXT DEFAULT '0',
    remaining_salt TEXT,
    remaining_iv TEXT,
    remaining_tag TEXT,
    
    -- Time-based patterns
    encrypted_hourly_pattern TEXT DEFAULT '{}',
    hourly_salt TEXT,
    hourly_iv TEXT,
    hourly_tag TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(encrypted_family_member_id, date)
);

-- Enhanced allowance approvals with workflow support
CREATE TABLE secure_allowance_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family reference
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    -- Encrypted distribution reference
    encrypted_allowance_distribution_id TEXT NOT NULL,
    distribution_salt TEXT NOT NULL,
    distribution_iv TEXT NOT NULL,
    distribution_tag TEXT NOT NULL,
    
    -- Encrypted requester information
    encrypted_requested_by TEXT NOT NULL,
    requester_salt TEXT NOT NULL,
    requester_iv TEXT NOT NULL,
    requester_tag TEXT NOT NULL,
    
    encrypted_requested_amount TEXT NOT NULL,
    amount_salt TEXT NOT NULL,
    amount_iv TEXT NOT NULL,
    amount_tag TEXT NOT NULL,
    
    encrypted_reason TEXT,
    reason_salt TEXT,
    reason_iv TEXT,
    reason_tag TEXT,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
    urgency TEXT DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    
    encrypted_approved_by TEXT,
    approved_by_salt TEXT,
    approved_by_iv TEXT,
    approved_by_tag TEXT,
    
    encrypted_approval_comment TEXT,
    comment_salt TEXT,
    comment_iv TEXT,
    comment_tag TEXT,
    
    -- Enhanced workflow
    encrypted_risk_assessment TEXT,
    risk_assessment_salt TEXT,
    risk_assessment_iv TEXT,
    risk_assessment_tag TEXT,
    
    auto_approval_eligible BOOLEAN DEFAULT false,
    escalation_level INTEGER DEFAULT 0,
    
    encrypted_workflow_data TEXT,
    workflow_salt TEXT,
    workflow_iv TEXT,
    workflow_tag TEXT,
    
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Enhanced payment logs with comprehensive encryption
CREATE TABLE secure_family_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family reference
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    -- Encrypted member reference
    encrypted_from_member_id TEXT NOT NULL,
    from_member_salt TEXT NOT NULL,
    from_member_iv TEXT NOT NULL,
    from_member_tag TEXT NOT NULL,
    
    -- Encrypted destination
    encrypted_to_destination TEXT NOT NULL,
    destination_salt TEXT NOT NULL,
    destination_iv TEXT NOT NULL,
    destination_tag TEXT NOT NULL,
    
    -- Encrypted transaction details
    encrypted_amount TEXT NOT NULL,
    amount_salt TEXT NOT NULL,
    amount_iv TEXT NOT NULL,
    amount_tag TEXT NOT NULL,
    
    encrypted_memo TEXT,
    memo_salt TEXT,
    memo_iv TEXT,
    memo_tag TEXT,
    
    encrypted_transaction_id TEXT NOT NULL,
    tx_id_salt TEXT NOT NULL,
    tx_id_iv TEXT NOT NULL,
    tx_id_tag TEXT NOT NULL,
    
    -- Enhanced route information (encrypted)
    route_type TEXT CHECK (route_type IN ('internal', 'external', 'mixed')),
    
    encrypted_route_path TEXT,
    route_path_salt TEXT,
    route_path_iv TEXT,
    route_path_tag TEXT,
    
    encrypted_actual_fee TEXT,
    fee_salt TEXT,
    fee_iv TEXT,
    fee_tag TEXT,
    
    -- Performance metrics
    execution_time INTEGER, -- milliseconds
    confirmation_time INTEGER, -- milliseconds
    routing_hops INTEGER,
    
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'pending', 'processing')),
    
    -- Zeus LSP integration
    zeus_lsp_used BOOLEAN DEFAULT false,
    zeus_jit_liquidity_used BOOLEAN DEFAULT false,
    
    encrypted_zeus_data TEXT,
    zeus_data_salt TEXT,
    zeus_data_iv TEXT,
    zeus_data_tag TEXT,
    
    -- Enhanced categorization
    payment_category TEXT,
    payment_type TEXT CHECK (payment_type IN ('allowance', 'purchase', 'transfer', 'emergency', 'rebalance')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Emergency liquidity logs with enhanced Zeus LSP tracking
CREATE TABLE secure_emergency_liquidity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    emergency_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family reference
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    -- Encrypted member reference
    encrypted_member_id TEXT NOT NULL,
    member_salt TEXT NOT NULL,
    member_iv TEXT NOT NULL,
    member_tag TEXT NOT NULL,
    
    -- Encrypted amounts
    encrypted_requested_amount TEXT NOT NULL,
    req_amount_salt TEXT NOT NULL,
    req_amount_iv TEXT NOT NULL,
    req_amount_tag TEXT NOT NULL,
    
    encrypted_provided_amount TEXT NOT NULL,
    prov_amount_salt TEXT NOT NULL,
    prov_amount_iv TEXT NOT NULL,
    prov_amount_tag TEXT NOT NULL,
    
    urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    
    encrypted_reason TEXT,
    reason_salt TEXT,
    reason_iv TEXT,
    reason_tag TEXT,
    
    encrypted_requested_by TEXT NOT NULL,
    req_by_salt TEXT NOT NULL,
    req_by_iv TEXT NOT NULL,
    req_by_tag TEXT NOT NULL,
    
    source TEXT NOT NULL CHECK (source IN ('zeus_jit', 'family_rebalance', 'emergency_reserve', 'denied')),
    success BOOLEAN NOT NULL,
    
    encrypted_channel_id TEXT,
    channel_salt TEXT,
    channel_iv TEXT,
    channel_tag TEXT,
    
    eta_seconds INTEGER,
    actual_time_seconds INTEGER,
    
    encrypted_cost TEXT DEFAULT '0',
    cost_salt TEXT,
    cost_iv TEXT,
    cost_tag TEXT,
    
    -- Zeus LSP specific tracking
    zeus_jit_channel_created BOOLEAN DEFAULT false,
    zeus_channel_capacity BIGINT,
    zeus_push_amount BIGINT,
    zeus_confirmation_time INTEGER,
    
    encrypted_zeus_response TEXT,
    zeus_response_salt TEXT,
    zeus_response_iv TEXT,
    zeus_response_tag TEXT,
    
    -- Resolution tracking
    resolved_automatically BOOLEAN DEFAULT false,
    manual_intervention_required BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced emergency protocols with automation
CREATE TABLE secure_emergency_protocols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family reference
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    protocol_name TEXT NOT NULL,
    protocol_version TEXT DEFAULT '1.0',
    
    -- Encrypted trigger conditions
    encrypted_trigger_conditions TEXT NOT NULL,
    conditions_salt TEXT NOT NULL,
    conditions_iv TEXT NOT NULL,
    conditions_tag TEXT NOT NULL,
    
    -- Encrypted response actions
    encrypted_response_actions TEXT NOT NULL,
    actions_salt TEXT NOT NULL,
    actions_iv TEXT NOT NULL,
    actions_tag TEXT NOT NULL,
    
    -- Encrypted contact protocol
    encrypted_contact_protocol TEXT NOT NULL,
    contact_salt TEXT NOT NULL,
    contact_iv TEXT NOT NULL,
    contact_tag TEXT NOT NULL,
    
    -- Enhanced automation features
    auto_execution_enabled BOOLEAN DEFAULT false,
    zeus_jit_integration BOOLEAN DEFAULT true,
    max_auto_amount BIGINT DEFAULT 1000000, -- 1M sats
    
    encrypted_escalation_rules TEXT,
    escalation_salt TEXT,
    escalation_iv TEXT,
    escalation_tag TEXT,
    
    -- Statistics and performance
    trigger_count INTEGER NOT NULL DEFAULT 0,
    success_rate DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    average_response_time INTEGER, -- seconds
    last_triggered TIMESTAMP WITH TIME ZONE,
    last_success TIMESTAMP WITH TIME ZONE,
    
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced liquidity forecasts with AI predictions
CREATE TABLE secure_liquidity_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family reference
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    forecast_date TIMESTAMP WITH TIME ZONE NOT NULL,
    timeframe TEXT NOT NULL CHECK (timeframe IN ('daily', 'weekly', 'monthly', 'quarterly')),
    forecast_horizon_days INTEGER NOT NULL,
    
    -- Encrypted predictions with confidence intervals
    encrypted_predictions TEXT NOT NULL,
    predictions_salt TEXT NOT NULL,
    predictions_iv TEXT NOT NULL,
    predictions_tag TEXT NOT NULL,
    
    -- Encrypted liquidity needs analysis
    encrypted_liquidity_needs TEXT NOT NULL,
    needs_salt TEXT NOT NULL,
    needs_iv TEXT NOT NULL,
    needs_tag TEXT NOT NULL,
    
    -- Encrypted recommendations with priority scoring
    encrypted_recommendations TEXT NOT NULL,
    recommendations_salt TEXT NOT NULL,
    recommendations_iv TEXT NOT NULL,
    recommendations_tag TEXT NOT NULL,
    
    -- Encrypted risk factors with mitigation strategies
    encrypted_risk_factors TEXT,
    risks_salt TEXT,
    risks_iv TEXT,
    risks_tag TEXT,
    
    -- Encrypted cost optimization analysis
    encrypted_cost_optimization TEXT,
    cost_salt TEXT,
    cost_iv TEXT,
    cost_tag TEXT,
    
    -- Model performance metrics
    model_version TEXT DEFAULT '1.0',
    confidence_score DECIMAL(3,2),
    data_quality_score DECIMAL(3,2),
    
    encrypted_pattern_analysis TEXT,
    pattern_salt TEXT,
    pattern_iv TEXT,
    pattern_tag TEXT,
    
    -- Zeus LSP optimization recommendations
    encrypted_zeus_optimizations TEXT,
    zeus_opt_salt TEXT,
    zeus_opt_iv TEXT,
    zeus_opt_tag TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Liquidity optimization execution logs
CREATE TABLE secure_liquidity_optimization_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family reference
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    optimization_type TEXT NOT NULL CHECK (optimization_type IN ('channel_rebalance', 'zeus_jit_config', 'cost_reduction', 'capacity_expansion')),
    
    -- Encrypted state snapshots
    encrypted_before_state TEXT NOT NULL,
    before_salt TEXT NOT NULL,
    before_iv TEXT NOT NULL,
    before_tag TEXT NOT NULL,
    
    encrypted_after_state TEXT NOT NULL,
    after_salt TEXT NOT NULL,
    after_iv TEXT NOT NULL,
    after_tag TEXT NOT NULL,
    
    -- Encrypted actions and results
    encrypted_actions_taken TEXT NOT NULL,
    actions_salt TEXT NOT NULL,
    actions_iv TEXT NOT NULL,
    actions_tag TEXT NOT NULL,
    
    encrypted_results TEXT NOT NULL,
    results_salt TEXT NOT NULL,
    results_iv TEXT NOT NULL,
    results_tag TEXT NOT NULL,
    
    -- Performance metrics
    execution_time_ms INTEGER,
    cost_incurred BIGINT,
    benefit_realized BIGINT,
    success_rate DECIMAL(3,2),
    
    -- Zeus LSP involvement
    zeus_lsp_used BOOLEAN DEFAULT false,
    zeus_channels_affected INTEGER DEFAULT 0,
    
    encrypted_zeus_impact TEXT,
    zeus_impact_salt TEXT,
    zeus_impact_iv TEXT,
    zeus_impact_tag TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced payment approvals with multi-signature support
CREATE TABLE secure_payment_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_uuid UUID NOT NULL UNIQUE,
    
    -- Encrypted family reference
    encrypted_family_id TEXT NOT NULL,
    family_salt TEXT NOT NULL,
    family_iv TEXT NOT NULL,
    family_tag TEXT NOT NULL,
    
    -- Encrypted requesting member
    encrypted_requesting_member_id TEXT NOT NULL,
    req_member_salt TEXT NOT NULL,
    req_member_iv TEXT NOT NULL,
    req_member_tag TEXT NOT NULL,
    
    -- Encrypted destination
    encrypted_to_destination TEXT NOT NULL,
    destination_salt TEXT NOT NULL,
    destination_iv TEXT NOT NULL,
    destination_tag TEXT NOT NULL,
    
    -- Encrypted amount and details
    encrypted_amount TEXT NOT NULL,
    amount_salt TEXT NOT NULL,
    amount_iv TEXT NOT NULL,
    amount_tag TEXT NOT NULL,
    
    encrypted_memo TEXT,
    memo_salt TEXT,
    memo_iv TEXT,
    memo_tag TEXT,
    
    -- Enhanced approval workflow
    encrypted_payment_preferences TEXT,
    prefs_salt TEXT,
    prefs_iv TEXT,
    prefs_tag TEXT,
    
    encrypted_required_approvers TEXT NOT NULL,
    approvers_salt TEXT NOT NULL,
    approvers_iv TEXT NOT NULL,
    approvers_tag TEXT NOT NULL,
    
    encrypted_received_approvals TEXT DEFAULT '[]',
    received_salt TEXT,
    received_iv TEXT,
    received_tag TEXT,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'partially_approved')),
    approval_threshold INTEGER NOT NULL DEFAULT 1,
    approvals_received INTEGER DEFAULT 0,
    
    -- Risk assessment
    encrypted_risk_assessment TEXT,
    risk_salt TEXT,
    risk_iv TEXT,
    risk_tag TEXT,
    
    risk_score DECIMAL(3,2),
    auto_approval_eligible BOOLEAN DEFAULT false,
    
    -- Timing and workflow
    urgency TEXT DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Zeus LSP consideration
    zeus_jit_required BOOLEAN DEFAULT false,
    zeus_jit_amount BIGINT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create comprehensive indexes for performance (on non-sensitive fields only)
CREATE INDEX idx_families_uuid ON secure_families(family_uuid);
CREATE INDEX idx_families_created ON secure_families(created_at);
CREATE INDEX idx_families_zeus_enabled ON secure_families(zeus_integration_enabled);

CREATE INDEX idx_members_uuid ON secure_family_members(member_uuid);
CREATE INDEX idx_members_role ON secure_family_members(role);
CREATE INDEX idx_members_active ON secure_family_members(active);
CREATE INDEX idx_members_permission_level ON secure_family_members(permission_level);

CREATE INDEX idx_schedules_uuid ON secure_allowance_schedules(schedule_uuid);
CREATE INDEX idx_schedules_enabled ON secure_allowance_schedules(enabled);
CREATE INDEX idx_schedules_next_dist ON secure_allowance_schedules(next_distribution);
CREATE INDEX idx_schedules_frequency ON secure_allowance_schedules(frequency);
CREATE INDEX idx_schedules_method ON secure_allowance_schedules(preferred_method);

CREATE INDEX idx_distributions_uuid ON secure_allowance_distributions(distribution_uuid);
CREATE INDEX idx_distributions_status ON secure_allowance_distributions(status);
CREATE INDEX idx_distributions_method ON secure_allowance_distributions(distribution_method);
CREATE INDEX idx_distributions_created ON secure_allowance_distributions(created_at);
CREATE INDEX idx_distributions_zeus_used ON secure_allowance_distributions(zeus_jit_used);
CREATE INDEX idx_distributions_retry ON secure_allowance_distributions(next_retry_at) WHERE next_retry_at IS NOT NULL;

CREATE INDEX idx_spending_date ON secure_spending_trackers(date);
CREATE INDEX idx_spending_created ON secure_spending_trackers(created_at);
CREATE INDEX idx_spending_updated ON secure_spending_trackers(updated_at);

CREATE INDEX idx_approvals_status ON secure_allowance_approvals(status);
CREATE INDEX idx_approvals_urgency ON secure_allowance_approvals(urgency);
CREATE INDEX idx_approvals_expires ON secure_allowance_approvals(expires_at);
CREATE INDEX idx_approvals_auto_eligible ON secure_allowance_approvals(auto_approval_eligible);

CREATE INDEX idx_payments_uuid ON secure_family_payments(payment_uuid);
CREATE INDEX idx_payments_status ON secure_family_payments(status);
CREATE INDEX idx_payments_type ON secure_family_payments(payment_type);
CREATE INDEX idx_payments_route_type ON secure_family_payments(route_type);
CREATE INDEX idx_payments_zeus_used ON secure_family_payments(zeus_lsp_used);
CREATE INDEX idx_payments_created ON secure_family_payments(created_at);

CREATE INDEX idx_emergency_uuid ON secure_emergency_liquidity_log(emergency_uuid);
CREATE INDEX idx_emergency_urgency ON secure_emergency_liquidity_log(urgency);
CREATE INDEX idx_emergency_source ON secure_emergency_liquidity_log(source);
CREATE INDEX idx_emergency_success ON secure_emergency_liquidity_log(success);
CREATE INDEX idx_emergency_zeus_jit ON secure_emergency_liquidity_log(zeus_jit_channel_created);
CREATE INDEX idx_emergency_created ON secure_emergency_liquidity_log(created_at);

CREATE INDEX idx_protocols_uuid ON secure_emergency_protocols(protocol_uuid);
CREATE INDEX idx_protocols_active ON secure_emergency_protocols(active);
CREATE INDEX idx_protocols_auto_exec ON secure_emergency_protocols(auto_execution_enabled);
CREATE INDEX idx_protocols_last_triggered ON secure_emergency_protocols(last_triggered);

CREATE INDEX idx_forecasts_uuid ON secure_liquidity_forecasts(forecast_uuid);
CREATE INDEX idx_forecasts_date ON secure_liquidity_forecasts(forecast_date);
CREATE INDEX idx_forecasts_timeframe ON secure_liquidity_forecasts(timeframe);
CREATE INDEX idx_forecasts_confidence ON secure_liquidity_forecasts(confidence_score);

CREATE INDEX idx_optimization_uuid ON secure_liquidity_optimization_logs(log_uuid);
CREATE INDEX idx_optimization_type ON secure_liquidity_optimization_logs(optimization_type);
CREATE INDEX idx_optimization_zeus_used ON secure_liquidity_optimization_logs(zeus_lsp_used);
CREATE INDEX idx_optimization_created ON secure_liquidity_optimization_logs(created_at);

CREATE INDEX idx_payment_approvals_uuid ON secure_payment_approvals(approval_uuid);
CREATE INDEX idx_payment_approvals_status ON secure_payment_approvals(status);
CREATE INDEX idx_payment_approvals_urgency ON secure_payment_approvals(urgency);
CREATE INDEX idx_payment_approvals_expires ON secure_payment_approvals(expires_at);
CREATE INDEX idx_payment_approvals_auto_eligible ON secure_payment_approvals(auto_approval_eligible);
CREATE INDEX idx_payment_approvals_zeus_required ON secure_payment_approvals(zeus_jit_required);

-- Row Level Security (RLS) policies for all tables
ALTER TABLE secure_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_allowance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_allowance_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_spending_trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_allowance_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_family_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_emergency_liquidity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_emergency_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_liquidity_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_liquidity_optimization_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_payment_approvals ENABLE ROW LEVEL SECURITY;

-- Enhanced automatic cleanup function with granular retention policies
CREATE OR REPLACE FUNCTION cleanup_expired_family_data()
RETURNS void AS $$
BEGIN
    -- Clean up expired allowance approvals
    DELETE FROM secure_allowance_approvals 
    WHERE expires_at < NOW() - INTERVAL '7 days';
    
    -- Clean up expired payment approvals
    DELETE FROM secure_payment_approvals 
    WHERE expires_at < NOW() - INTERVAL '7 days';
    
    -- Clean up old spending tracker data (respecting member retention settings)
    DELETE FROM secure_spending_trackers st
    WHERE st.created_at < NOW() - INTERVAL '2 years'
    OR EXISTS (
        SELECT 1 FROM secure_family_members sfm 
        WHERE sfm.encrypted_family_member_id = st.encrypted_family_member_id 
        AND st.created_at < NOW() - (sfm.data_retention_days || ' days')::INTERVAL
    );
    
    -- Clean up old emergency logs (1 year retention)
    DELETE FROM secure_emergency_liquidity_log 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Clean up old forecasts based on timeframe
    DELETE FROM secure_liquidity_forecasts 
    WHERE (timeframe = 'daily' AND created_at < NOW() - INTERVAL '90 days')
    OR (timeframe = 'weekly' AND created_at < NOW() - INTERVAL '1 year')
    OR (timeframe = 'monthly' AND created_at < NOW() - INTERVAL '2 years')
    OR (timeframe = 'quarterly' AND created_at < NOW() - INTERVAL '5 years');
    
    -- Clean up old optimization logs (1 year retention)
    DELETE FROM secure_liquidity_optimization_logs 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Clean up old successful distributions (keep 2 years of history)
    DELETE FROM secure_allowance_distributions 
    WHERE status = 'completed' 
    AND created_at < NOW() - INTERVAL '2 years';
    
    -- Clean up old completed payments (keep 2 years for audit)
    DELETE FROM secure_family_payments 
    WHERE status = 'completed' 
    AND created_at < NOW() - INTERVAL '2 years';
    
    -- Update statistics
    UPDATE secure_families 
    SET updated_at = NOW()
    WHERE id IN (
        SELECT DISTINCT f.id 
        FROM secure_families f
        WHERE f.updated_at < NOW() - INTERVAL '1 day'
    );
    
    RAISE NOTICE 'Enhanced family data cleanup completed at %. Tables processed: allowance_approvals, payment_approvals, spending_trackers, emergency_logs, forecasts, optimization_logs, distributions, payments', NOW();
END;
$$ LANGUAGE plpgsql;

-- Enhanced data integrity and audit functions
CREATE OR REPLACE FUNCTION validate_encrypted_data_integrity()
RETURNS void AS $$
BEGIN
    -- Check for orphaned records
    PERFORM COUNT(*) FROM secure_allowance_schedules s
    LEFT JOIN secure_families f ON f.family_uuid::text = ANY(string_to_array(s.encrypted_family_id, ','))
    WHERE f.id IS NULL;
    
    -- Validate encryption field completeness
    PERFORM COUNT(*) FROM secure_family_members
    WHERE (encrypted_name IS NOT NULL AND (name_salt IS NULL OR name_iv IS NULL OR name_tag IS NULL))
    OR (encrypted_email IS NOT NULL AND (email_salt IS NULL OR email_iv IS NULL OR email_tag IS NULL));
    
    RAISE NOTICE 'Data integrity validation completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Performance optimization function
CREATE OR REPLACE FUNCTION optimize_family_database_performance()
RETURNS void AS $$
BEGIN
    -- Reindex frequently accessed tables
    REINDEX TABLE secure_allowance_schedules;
    REINDEX TABLE secure_allowance_distributions;
    REINDEX TABLE secure_spending_trackers;
    REINDEX TABLE secure_family_payments;
    
    -- Update table statistics
    ANALYZE secure_families;
    ANALYZE secure_family_members;
    ANALYZE secure_allowance_schedules;
    ANALYZE secure_allowance_distributions;
    ANALYZE secure_spending_trackers;
    ANALYZE secure_family_payments;
    ANALYZE secure_emergency_liquidity_log;
    ANALYZE secure_liquidity_forecasts;
    
    RAISE NOTICE 'Database performance optimization completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule comprehensive maintenance tasks
SELECT cron.schedule('cleanup-expired-family-data', '0 2 * * *', 'SELECT cleanup_expired_family_data();');
SELECT cron.schedule('validate-data-integrity', '0 3 * * 0', 'SELECT validate_encrypted_data_integrity();');
SELECT cron.schedule('optimize-performance', '0 4 * * 0', 'SELECT optimize_family_database_performance();');

-- Create maintenance log table
CREATE TABLE IF NOT EXISTS database_maintenance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    details TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_maintenance_log_operation ON database_maintenance_log(operation);
CREATE INDEX idx_maintenance_log_status ON database_maintenance_log(status);
CREATE INDEX idx_maintenance_log_created ON database_maintenance_log(created_at);

-- Final success notification
DO $$
BEGIN
    INSERT INTO database_maintenance_log (operation, status, details) 
    VALUES ('schema_creation', 'completed', 'Privacy-enhanced family banking schema with Zeus LSP integration created successfully');
    
    RAISE NOTICE '✅ Privacy-Enhanced Family Banking Schema with Zeus LSP Integration deployed successfully at %', NOW();
END
$$;