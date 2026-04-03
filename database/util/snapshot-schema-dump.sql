-- =============================================================================
-- Satnam.pub — Pre-Automation Schema Snapshot Query
-- Run this in Supabase SQL Editor → copy result → save as supabase-schema-dump-YYYYMMDD.sql
-- =============================================================================

-- ── 1. All user tables (public schema) ──────────────────────────────────────
SELECT
  'TABLE' AS object_type,
  table_name AS object_name,
  NULL AS definition
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ── 2. All columns with types (for drift detection) ─────────────────────────
SELECT
  table_name,
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- ── 3. All functions (PL/pgSQL) ─────────────────────────────────────────────
SELECT
  routine_name,
  routine_type,
  data_type AS return_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- ── 4. All RLS policies ──────────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ── 5. All indexes ───────────────────────────────────────────────────────────
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ── 6. All triggers ─────────────────────────────────────────────────────────
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ── 7. Row counts per table (data state snapshot) ───────────────────────────
DO $$
DECLARE
  tbl RECORD;
  cnt BIGINT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I', tbl.table_name) INTO cnt;
    RAISE NOTICE 'TABLE: % | ROWS: %', tbl.table_name, cnt;
  END LOOP;
END $$;

-- ── 8. Applied migrations (supabase_migrations schema) ──────────────────────
SELECT
  version,
  name,
  inserted_at
FROM supabase_migrations.schema_migrations
ORDER BY inserted_at DESC
LIMIT 50;

-- =============================================================================
-- INSTRUCTIONS:
-- 1. Run ALL statements above in Supabase SQL Editor
-- 2. Download result as CSV or copy JSON output
-- 3. Save to: backups/YYYYMMDD-HHMMSS/supabase-schema-snapshot.csv
-- 4. For FULL pg_dump (requires direct DB access):
--      pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
--        --schema=public --no-owner --no-privileges \
--        --file=backups/YYYYMMDD/supabase-full-dump.sql
--    Connection string is in: Supabase Dashboard → Settings → Database → Connection string (URI)
-- =============================================================================

