-- Fix RLS recursion on privacy_group_members
-- Idempotent migration. Run in Supabase SQL editor.
-- Root cause: Mutual policy dependency between privacy_groups and privacy_group_members
--              created an infinite recursion (42P17) during policy evaluation.
--              privacy_groups policy referenced privacy_group_members and the
--              privacy_group_members policy referenced privacy_groups.
--
-- Strategy: Break the cycle by removing the cross-table reference from
--           privacy_group_members policy. Keep member-based access only.
--           privacy_groups may still reference privacy_group_members to allow
--           members to read group rows, but the reverse reference is removed.

BEGIN;

-- Ensure RLS enabled (safe if already enabled)
ALTER TABLE public.privacy_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_groups ENABLE ROW LEVEL SECURITY;

-- Drop the recursive policy on privacy_group_members if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='privacy_group_members'
      AND policyname='Users can access members of groups they belong to'
  ) THEN
    EXECUTE 'DROP POLICY "Users can access members of groups they belong to" ON public.privacy_group_members';
  END IF;
END$$;

-- Replace with a non-recursive member-based access policy
-- Users can access/modify only membership rows where they are the member
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='privacy_group_members'
      AND policyname='pgm_member_own_access'
  ) THEN
    CREATE POLICY pgm_member_own_access ON public.privacy_group_members
      AS PERMISSIVE
      FOR ALL
      USING (member_hash = current_setting('app.current_user_hash', true))
      WITH CHECK (member_hash = current_setting('app.current_user_hash', true));
  END IF;
END$$;

-- Optional future enhancement (not enabled here):
-- If group creators/admins must view all members, add a SECURITY DEFINER helper
-- function that checks creator/admin rights without triggering RLS, e.g.:
--   CREATE FUNCTION public.is_group_owner(p_group_session_id text)
--   RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
--     SELECT created_by_hash = current_setting('app.current_user_hash', true)
--     FROM public.privacy_groups
--     WHERE session_id = p_group_session_id
--   $$;
-- Then add an additional policy using that function instead of a subselect.
-- This avoids recursive RLS evaluation while preserving intended privileges.

COMMIT;

