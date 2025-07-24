-- =====================================================================================
-- DATABASE MIGRATION VALIDATION TEST
-- MASTER CONTEXT COMPLIANCE: Verify all tables, constraints, and relationships
-- =====================================================================================

-- Test 1: Verify all tables exist
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'messaging_sessions',
    'privacy_contacts', 
    'privacy_groups',
    'privacy_group_members',
    'privacy_group_messages',
    'privacy_direct_messages',
    'guardian_approval_requests',
    'identity_disclosure_preferences',
    'privacy_audit_log'
)
ORDER BY table_name;

-- Test 2: Verify foreign key constraints
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
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
    'privacy_contacts',
    'privacy_group_members', 
    'privacy_group_messages',
    'privacy_direct_messages',
    'identity_disclosure_preferences'
)
ORDER BY tc.table_name, tc.constraint_name;

-- Test 3: Verify check constraints for role hierarchy
SELECT 
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints AS tc
JOIN information_schema.check_constraints AS cc
    ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
AND tc.table_schema = 'public'
AND (
    cc.check_clause LIKE '%family_role%' OR
    cc.check_clause LIKE '%trust_level%' OR
    cc.check_clause LIKE '%group_type%' OR
    cc.check_clause LIKE '%message_type%' OR
    cc.check_clause LIKE '%status%'
)
ORDER BY tc.table_name, tc.constraint_name;

-- Test 4: Verify indexes exist
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
AND tablename IN (
    'messaging_sessions',
    'privacy_contacts',
    'privacy_groups', 
    'privacy_group_members',
    'privacy_group_messages',
    'privacy_direct_messages',
    'guardian_approval_requests',
    'identity_disclosure_preferences',
    'privacy_audit_log'
)
ORDER BY tablename, indexname;

-- Test 5: Verify RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN (
    'messaging_sessions',
    'privacy_contacts',
    'privacy_groups',
    'privacy_group_members', 
    'privacy_group_messages',
    'privacy_direct_messages',
    'guardian_approval_requests',
    'identity_disclosure_preferences',
    'privacy_audit_log'
)
ORDER BY tablename;

-- Test 6: Verify RLS policies exist
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN (
    'messaging_sessions',
    'privacy_contacts',
    'privacy_groups',
    'privacy_group_members',
    'privacy_group_messages', 
    'privacy_direct_messages',
    'guardian_approval_requests',
    'identity_disclosure_preferences',
    'privacy_audit_log'
)
ORDER BY tablename, policyname;

-- Test 7: Test individual private group creation (simulation)
-- This would be executed after migration to verify functionality
/*
-- Simulate individual user session
SET app.current_user_hash = 'test_user_hash_12345678901234567890123456789012';
SET app.current_user_pubkey = 'test_user_pubkey_12345678901234567890123456789012';

-- Test session creation
INSERT INTO messaging_sessions (
    session_id,
    user_hash,
    encrypted_nsec,
    session_key,
    expires_at
) VALUES (
    'test_session_12345678901234567890123456789012',
    'test_user_hash_12345678901234567890123456789012',
    'encrypted_nsec_test_12345678901234567890123456789012',
    'session_key_test_12345678901234567890123456789012',
    NOW() + INTERVAL '24 hours'
);

-- Test individual private group creation (friends group)
INSERT INTO privacy_groups (
    session_id,
    name_hash,
    description_hash,
    group_type,
    member_count,
    admin_hashes,
    encryption_type,
    created_by_hash
) VALUES (
    'test_group_session_12345678901234567890123456789012',
    'test_group_name_hash_12345678901234567890123456789012',
    'test_group_desc_hash_12345678901234567890123456789012',
    'friends',  -- Individual private group type
    1,
    ARRAY['test_user_hash_12345678901234567890123456789012'],
    'gift-wrap',
    'test_user_hash_12345678901234567890123456789012'
);

-- Test contact addition (non-family user)
INSERT INTO privacy_contacts (
    session_id,
    encrypted_npub,
    display_name_hash,
    family_role,
    trust_level,
    supports_gift_wrap,
    preferred_encryption,
    added_by_hash
) VALUES (
    'test_contact_session_12345678901234567890123456789012',
    'encrypted_npub_test_12345678901234567890123456789012',
    'contact_name_hash_12345678901234567890123456789012',
    'private',  -- Non-family role
    'known',    -- Non-family trust level
    true,
    'gift-wrap',
    'test_user_hash_12345678901234567890123456789012'
);

-- Test group member addition
INSERT INTO privacy_group_members (
    group_session_id,
    member_hash,
    display_name_hash,
    role,
    invited_by_hash
) VALUES (
    'test_group_session_12345678901234567890123456789012',
    'test_contact_hash_12345678901234567890123456789012',
    'contact_name_hash_12345678901234567890123456789012',
    'member',
    'test_user_hash_12345678901234567890123456789012'
);

-- Test group message (without guardian approval)
INSERT INTO privacy_group_messages (
    message_session_id,
    group_session_id,
    sender_hash,
    encrypted_content,
    message_type,
    guardian_approved
) VALUES (
    'test_message_session_12345678901234567890123456789012',
    'test_group_session_12345678901234567890123456789012',
    'test_user_hash_12345678901234567890123456789012',
    'encrypted_message_content_test',
    'text',
    false  -- No guardian approval required for individual private groups
);

-- Verify all inserts succeeded and RLS policies allow access
SELECT 'Session created' as test, COUNT(*) as count FROM messaging_sessions WHERE session_id = 'test_session_12345678901234567890123456789012';
SELECT 'Group created' as test, COUNT(*) as count FROM privacy_groups WHERE session_id = 'test_group_session_12345678901234567890123456789012';
SELECT 'Contact added' as test, COUNT(*) as count FROM privacy_contacts WHERE session_id = 'test_contact_session_12345678901234567890123456789012';
SELECT 'Member added' as test, COUNT(*) as count FROM privacy_group_members WHERE group_session_id = 'test_group_session_12345678901234567890123456789012';
SELECT 'Message sent' as test, COUNT(*) as count FROM privacy_group_messages WHERE group_session_id = 'test_group_session_12345678901234567890123456789012';

-- Cleanup test data
DELETE FROM privacy_group_messages WHERE group_session_id = 'test_group_session_12345678901234567890123456789012';
DELETE FROM privacy_group_members WHERE group_session_id = 'test_group_session_12345678901234567890123456789012';
DELETE FROM privacy_contacts WHERE session_id = 'test_contact_session_12345678901234567890123456789012';
DELETE FROM privacy_groups WHERE session_id = 'test_group_session_12345678901234567890123456789012';
DELETE FROM messaging_sessions WHERE session_id = 'test_session_12345678901234567890123456789012';
*/
