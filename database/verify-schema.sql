-- =====================================================================================
-- DATABASE SCHEMA VERIFICATION SCRIPT
-- Verify all required tables and columns exist for unified messaging service
-- =====================================================================================

-- Check if all required tables exist
SELECT 
    'messaging_sessions' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messaging_sessions') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
    'privacy_contacts' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_contacts') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
    'privacy_groups' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_groups') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
    'privacy_group_members' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_group_members') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
    'privacy_group_messages' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_group_messages') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
    'privacy_direct_messages' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_direct_messages') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
    'guardian_approval_requests' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guardian_approval_requests') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- Verify critical columns exist
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN (
    'messaging_sessions',
    'privacy_contacts', 
    'privacy_groups',
    'privacy_group_members'
) 
AND column_name IN ('session_id', 'user_hash', 'encrypted_nsec', 'session_key')
ORDER BY table_name, column_name;

-- Check for session_id column specifically
SELECT 
    table_name,
    'session_id' as column_name,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = t.table_name AND column_name = 'session_id'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
FROM (
    VALUES 
    ('messaging_sessions'),
    ('privacy_contacts'),
    ('privacy_groups'),
    ('privacy_group_members'),
    ('privacy_group_messages'),
    ('privacy_direct_messages'),
    ('identity_disclosure_preferences')
) AS t(table_name);

-- Test basic functionality
SELECT 'Database schema verification complete' as result;
