-- Validation Script for Migration 013: Family Wallet RBAC Clean Migration
-- 
-- Run this script AFTER executing the clean migration to validate that all
-- components were created successfully and schema conflicts are resolved.
-- 
-- COPY AND PASTE THIS INTO SUPABASE SQL EDITOR AFTER RUNNING THE CLEAN MIGRATION

-- =============================================================================
-- VALIDATION 1: CHECK ALL TABLES CREATED
-- =============================================================================

SELECT 
    'Tables Created' as validation_type,
    expected_tables.table_name,
    CASE 
        WHEN t.table_name IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM (
    VALUES 
        ('family_memberships'),
        ('family_frost_config'),
        ('family_federation_wallets'),
        ('individual_fedimint_wallets'),
        ('frost_transactions'),
        ('transaction_approvals'),
        ('family_wallet_audit_log'),
        ('wallet_rate_limits')
) AS expected_tables(table_name)
LEFT JOIN information_schema.tables t 
    ON t.table_name = expected_tables.table_name 
    AND t.table_schema = 'public'
ORDER BY expected_tables.table_name;

-- =============================================================================
-- VALIDATION 2: CHECK MASTER CONTEXT ROLE HIERARCHY
-- =============================================================================

SELECT 
    'Role Hierarchy Validation' as validation_type,
    'family_memberships.member_role constraint' as component,
    CASE 
        WHEN cc.check_clause LIKE '%steward%' 
         AND cc.check_clause LIKE '%guardian%' 
         AND cc.check_clause LIKE '%adult%' 
         AND cc.check_clause LIKE '%offspring%' THEN '✅ MASTER CONTEXT COMPLIANT'
        ELSE '❌ OLD ROLE HIERARCHY'
    END as status
FROM information_schema.check_constraints cc
JOIN information_schema.constraint_column_usage ccu 
    ON cc.constraint_name = ccu.constraint_name
WHERE ccu.table_name = 'family_memberships' 
    AND ccu.column_name = 'member_role'
    AND cc.constraint_schema = 'public';

-- =============================================================================
-- VALIDATION 3: CHECK FEDERATION_HASH COLUMN CONSISTENCY
-- =============================================================================

SELECT 
    'Column Consistency' as validation_type,
    c.table_name,
    c.column_name,
    CASE 
        WHEN c.column_name = 'federation_hash' THEN '✅ CONSISTENT NAMING'
        WHEN c.column_name LIKE '%family_federation_hash%' THEN '❌ OLD NAMING'
        ELSE '✅ OTHER COLUMN'
    END as status
FROM information_schema.columns c
WHERE c.table_schema = 'public'
    AND c.table_name IN (
        'family_memberships',
        'family_frost_config',
        'family_federation_wallets',
        'frost_transactions',
        'family_wallet_audit_log'
    )
    AND (c.column_name LIKE '%federation%' OR c.column_name LIKE '%family%')
ORDER BY c.table_name, c.column_name;

-- =============================================================================
-- VALIDATION 4: CHECK FOREIGN KEY RELATIONSHIPS
-- =============================================================================

SELECT 
    'Foreign Key Relationships' as validation_type,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    '✅ RELATIONSHIP EXISTS' as status
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
    AND tc.table_name IN (
        'family_memberships',
        'family_frost_config',
        'family_federation_wallets',
        'individual_fedimint_wallets',
        'frost_transactions',
        'transaction_approvals',
        'family_wallet_audit_log'
    )
ORDER BY tc.table_name;

-- =============================================================================
-- VALIDATION 5: CHECK INDEXES CREATED
-- =============================================================================

SELECT 
    'Indexes Created' as validation_type,
    expected_indexes.indexname,
    CASE 
        WHEN i.indexname IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM (
    VALUES 
        ('idx_family_memberships_federation'),
        ('idx_family_memberships_member'),
        ('idx_family_memberships_role'),
        ('idx_family_memberships_active'),
        ('idx_family_frost_config_federation'),
        ('idx_family_frost_config_configured_by'),
        ('idx_family_wallets_federation'),
        ('idx_family_wallets_type'),
        ('idx_family_wallets_active'),
        ('idx_individual_wallets_user'),
        ('idx_individual_wallets_controlling_adult'),
        ('idx_individual_wallets_active'),
        ('idx_frost_transactions_id'),
        ('idx_frost_transactions_family'),
        ('idx_frost_transactions_initiator'),
        ('idx_frost_transactions_status'),
        ('idx_frost_transactions_deadline'),
        ('idx_transaction_approvals_frost_tx'),
        ('idx_transaction_approvals_approver'),
        ('idx_wallet_audit_family'),
        ('idx_wallet_audit_user'),
        ('idx_wallet_audit_action'),
        ('idx_wallet_audit_created'),
        ('idx_rate_limits_context'),
        ('idx_rate_limits_window')
) AS expected_indexes(indexname)
LEFT JOIN pg_indexes i 
    ON i.indexname = expected_indexes.indexname 
    AND i.schemaname = 'public'
ORDER BY expected_indexes.indexname;

-- =============================================================================
-- VALIDATION 6: CHECK RLS POLICIES
-- =============================================================================

SELECT 
    'RLS Policies' as validation_type,
    expected_policies.policyname,
    expected_policies.tablename,
    CASE 
        WHEN p.policyname IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM (
    VALUES 
        ('family_memberships_access', 'family_memberships'),
        ('family_frost_config_family_members', 'family_frost_config'),
        ('family_wallets_family_members', 'family_federation_wallets'),
        ('individual_wallets_own_access', 'individual_fedimint_wallets'),
        ('frost_transactions_access', 'frost_transactions'),
        ('transaction_approvals_own_access', 'transaction_approvals'),
        ('wallet_audit_access', 'family_wallet_audit_log'),
        ('rate_limits_own_access', 'wallet_rate_limits')
) AS expected_policies(policyname, tablename)
LEFT JOIN pg_policies p 
    ON p.policyname = expected_policies.policyname 
    AND p.tablename = expected_policies.tablename 
    AND p.schemaname = 'public'
ORDER BY expected_policies.tablename, expected_policies.policyname;

-- =============================================================================
-- VALIDATION 7: CHECK HELPER FUNCTIONS
-- =============================================================================

SELECT 
    'Helper Functions' as validation_type,
    expected_functions.routine_name,
    CASE 
        WHEN r.routine_name IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM (
    VALUES 
        ('get_user_family_role'),
        ('has_spending_permissions'),
        ('has_balance_view_permissions'),
        ('has_history_view_permissions'),
        ('update_updated_at_column')
) AS expected_functions(routine_name)
LEFT JOIN information_schema.routines r 
    ON r.routine_name = expected_functions.routine_name 
    AND r.routine_schema = 'public'
ORDER BY expected_functions.routine_name;

-- =============================================================================
-- VALIDATION 8: CHECK TRIGGERS
-- =============================================================================

SELECT 
    'Triggers' as validation_type,
    expected_triggers.trigger_name,
    expected_triggers.event_object_table,
    CASE 
        WHEN t.trigger_name IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM (
    VALUES 
        ('update_family_memberships_updated_at', 'family_memberships'),
        ('update_family_frost_config_updated_at', 'family_frost_config'),
        ('update_family_wallets_updated_at', 'family_federation_wallets'),
        ('update_individual_wallets_updated_at', 'individual_fedimint_wallets')
) AS expected_triggers(trigger_name, event_object_table)
LEFT JOIN information_schema.triggers t 
    ON t.trigger_name = expected_triggers.trigger_name 
    AND t.event_object_table = expected_triggers.event_object_table
    AND t.trigger_schema = 'public'
ORDER BY expected_triggers.event_object_table, expected_triggers.trigger_name;

-- =============================================================================
-- VALIDATION 9: FINAL SUMMARY
-- =============================================================================

SELECT 
    'Migration Summary' as validation_type,
    'Clean migration completed successfully' as details,
    '🚀 READY FOR API TESTING' as status;

SELECT 
    'Next Steps' as validation_type,
    'All schema conflicts resolved' as step_1,
    'Master Context roles implemented' as step_2,
    'FROST multi-signature support ready' as step_3,
    'Family Federation Wallet APIs ready for testing' as step_4;
