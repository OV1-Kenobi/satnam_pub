-- =====================================================
-- VERIFY 058 MIGRATION READINESS
-- Checks current state of family_federations and family_members
-- before applying 058_federation_foundry_column_alignment.sql
-- =====================================================

-- 1. Table existence check for target tables
SELECT 
  'table_existence' AS check_name,
  t.table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t.table_name
    ) THEN 'EXISTS '
    ELSE 'MISSING '
  END AS status
FROM (VALUES 
  ('family_federations'),
  ('family_members')
) AS t(table_name)
ORDER BY t.table_name;

-- 2. Column details for family_federations
SELECT 
  'family_federations columns' AS section,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'family_federations'
ORDER BY ordinal_position;

-- 3. Column details for family_members
SELECT 
  'family_members columns' AS section,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'family_members'
ORDER BY ordinal_position;

-- 4. Presence of new columns expected by migration 058 (family_federations)
SELECT
  'family_federations column readiness' AS section,
  v.column_name,
  v.expected_type,
  CASE 
    WHEN c.column_name IS NOT NULL THEN 'PRESENT '
    ELSE 'MISSING '
  END AS status,
  c.data_type AS actual_type,
  c.is_nullable,
  c.column_default
FROM (
  VALUES 
    ('charter_id', 'text'),
    ('status', 'text'),
    ('progress', 'integer'),
    ('created_by', 'text')
) AS v(column_name, expected_type)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = 'family_federations'
 AND c.column_name = v.column_name
ORDER BY v.column_name;

-- 5. Presence of new columns expected by migration 058 (family_members)
SELECT
  'family_members column readiness' AS section,
  v.column_name,
  v.expected_type,
  CASE 
    WHEN c.column_name IS NOT NULL THEN 'PRESENT '
    ELSE 'MISSING '
  END AS status,
  c.data_type AS actual_type,
  c.is_nullable,
  c.column_default
FROM (
  VALUES 
    ('federation_duid', 'text'),
    ('role', 'text'),
    ('joined_via', 'text'),
    ('invitation_id', 'uuid')
) AS v(column_name, expected_type)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = 'family_members'
 AND c.column_name = v.column_name
ORDER BY v.column_name;

-- 6. Foreign key constraints on family_federations and family_members
SELECT 
  'foreign_keys' AS section,
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('family_federations', 'family_members')
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- 7. Existence check for referenced tables
SELECT 
  'referenced_tables' AS check_name,
  t.table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t.table_name
    ) THEN 'EXISTS '
    ELSE 'MISSING '
  END AS status
FROM (VALUES 
  ('family_charters'),
  ('family_federation_invitations')
) AS t(table_name)
ORDER BY t.table_name;

-- 8. Final readiness summary
SELECT 
  '=== 058 MIGRATION READINESS SUMMARY ===' AS summary,
  CASE 
    WHEN 
      -- Both core tables exist
      EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'family_federations'
      )
      AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'family_members'
      )
      -- No missing columns in family_federations
      AND (
        SELECT COUNT(*) FROM (
          SELECT v.column_name
          FROM (VALUES
            ('charter_id'),
            ('status'),
            ('progress'),
            ('created_by')
          ) AS v(column_name)
          LEFT JOIN information_schema.columns c
            ON c.table_schema = 'public'
           AND c.table_name = 'family_federations'
           AND c.column_name = v.column_name
          WHERE c.column_name IS NULL
        ) AS missing_ff
      ) = 0
      -- No missing columns in family_members
      AND (
        SELECT COUNT(*) FROM (
          SELECT v.column_name
          FROM (VALUES
            ('federation_duid'),
            ('role'),
            ('joined_via'),
            ('invitation_id')
          ) AS v(column_name)
          LEFT JOIN information_schema.columns c
            ON c.table_schema = 'public'
           AND c.table_name = 'family_members'
           AND c.column_name = v.column_name
          WHERE c.column_name IS NULL
        ) AS missing_fm
      ) = 0
    THEN 'READY TO MIGRATE '
    ELSE 'ISSUES DETECTED '
  END AS migration_status,
  -- List missing columns in family_federations (if any)
  (
    SELECT string_agg(v.column_name, ', ' ORDER BY v.column_name)
    FROM (VALUES
      ('charter_id'),
      ('status'),
      ('progress'),
      ('created_by')
    ) AS v(column_name)
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = 'family_federations'
     AND c.column_name = v.column_name
    WHERE c.column_name IS NULL
  ) AS missing_family_federations_columns,
  -- List missing columns in family_members (if any)
  (
    SELECT string_agg(v.column_name, ', ' ORDER BY v.column_name)
    FROM (VALUES
      ('federation_duid'),
      ('role'),
      ('joined_via'),
      ('invitation_id')
    ) AS v(column_name)
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = 'family_members'
     AND c.column_name = v.column_name
    WHERE c.column_name IS NULL
  ) AS missing_family_members_columns,
  -- Status of referenced tables (informational; migration 058 is idempotent even if missing)
  (
    SELECT CASE 
      WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'family_charters'
      ) THEN 'family_charters EXISTS'
      ELSE 'family_charters MISSING'
    END
  ) AS family_charters_status,
  (
    SELECT CASE 
      WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'family_federation_invitations'
      ) THEN 'family_federation_invitations EXISTS'
      ELSE 'family_federation_invitations MISSING'
    END
  ) AS family_federation_invitations_status;

