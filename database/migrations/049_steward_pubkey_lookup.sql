-- Combined report: existence + structure for several objects in public schema

WITH
-- Check tables existence
tbls AS (
  SELECT table_name
  FROM (VALUES
    ('family_members'),
    ('family_federations'),
    ('user_identities')
  ) v(table_name)
),
table_exists AS (
  SELECT
    t.table_name,
    EXISTS (
      SELECT 1
      FROM information_schema.tables s
      WHERE s.table_schema = 'public' AND s.table_name = t.table_name
    ) AS exists
  FROM tbls t
),
-- Columns aggregated per table (empty string when not exists)
table_columns AS (
  SELECT
    t.table_name,
    COALESCE(
      (
        SELECT string_agg(column_name || ' (' || data_type || ')', ', ' ORDER BY ordinal_position)
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = t.table_name
      ), 'TABLE DOES NOT EXIST'
    ) AS columns
  FROM tbls t
),
-- Specific pubkey-like columns in user_identities (multiple rows)
user_pubkey_columns AS (
  SELECT
    'user_identities' AS table_name,
    string_agg(column_name || ' (' || data_type || ')', ', ' ORDER BY column_name) AS pubkey_columns
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'user_identities'
    AND (
      column_name ILIKE '%pubkey%' OR column_name ILIKE '%hex%' OR column_name ILIKE '%nostr%'
    )
),
-- Function existence
fn_exists AS (
  SELECT
    'get_eligible_steward_pubkeys_for_federation' AS object_name,
    EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'get_eligible_steward_pubkeys_for_federation'
    ) AS exists
),
-- Indexes on user_identities aggregated
user_indexes AS (
  SELECT
    'user_identities' AS table_name,
    COALESCE(
      string_agg(indexname || ': ' || indexdef, '; ' ORDER BY indexname),
      'NO INDEXES FOUND'
    ) AS indexes
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'user_identities'
)
-- Final combined report: one row per check
SELECT
  t.table_name AS object_type,
  'table' AS object_kind,
  te.exists AS exists,
  tc.columns AS details
FROM table_exists te
JOIN table_columns tc USING (table_name)
JOIN tbls t USING (table_name)

UNION ALL

-- Append pubkey-columns row (for user_identities)
SELECT
  up.table_name AS object_type,
  'pubkey_columns' AS object_kind,
  CASE WHEN up.pubkey_columns IS NULL THEN false ELSE true END AS exists,
  COALESCE(up.pubkey_columns, 'NONE FOUND') AS details
FROM user_pubkey_columns up

UNION ALL

-- Append function existence row
SELECT
  f.object_name AS object_type,
  'function' AS object_kind,
  f.exists AS exists,
  CASE WHEN f.exists THEN 'function present' ELSE 'function not present' END AS details
FROM fn_exists f

UNION ALL

-- Append user_identities indexes row
SELECT
  ui.table_name AS object_type,
  'indexes' AS object_kind,
  CASE WHEN ui.indexes IS NULL THEN false ELSE true END AS exists,
  COALESCE(ui.indexes, 'NONE FOUND') AS details
FROM user_indexes ui

ORDER BY object_type, object_kind;