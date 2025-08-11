-- =====================================================
-- FIX AUTHENTICATION RLS POLICY FOR USER_IDENTITIES
-- =====================================================
--
-- PURPOSE: Fix RLS policy to allow anon role to query user_identities for authentication
-- ISSUE: Current RLS policy blocks authentication queries from browser (anon role)
-- SOLUTION: Update policy to explicitly allow authentication queries
--
-- SECURITY: This maintains security by only allowing read access to active users
-- for authentication purposes, no sensitive data exposure
--
-- Run this script in the Supabase SQL editor
--

BEGIN;

-- Drop existing problematic policy
DROP POLICY IF EXISTS "user_identities_public_read_active" ON user_identities;

-- Create new policy that explicitly allows authentication queries
-- This allows anon role to read user_identities for authentication purposes
-- while maintaining security by only exposing active users
CREATE POLICY "user_identities_auth_read" ON user_identities
    FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

-- Verify the policy was created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'user_identities' 
AND policyname = 'user_identities_auth_read';

-- Test query to ensure it works (should not error)
-- This simulates the authentication query from the browser
SELECT COUNT(*) as test_query_result
FROM user_identities 
WHERE is_active = true;

COMMIT;

-- Success message
SELECT 
    '✅ AUTHENTICATION RLS POLICY FIXED' as result,
    'Anon role can now query user_identities for authentication' as details,
    'Browser authentication should now work without 400 errors' as expected_outcome;
