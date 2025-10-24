# PostgreSQL Migration Fix - Profile Visibility Schema

**Status:** ✅ FIXED  
**Date:** October 23, 2025  
**Issue:** PostgreSQL syntax error with `CREATE POLICY IF NOT EXISTS`

---

## Problem

The migration script `database/migrations/profile_visibility_schema.sql` contained PostgreSQL syntax errors:

```
ERROR:  42601: syntax error at or near "NOT"
LINE 76: CREATE POLICY IF NOT EXISTS "public_profiles_readable"
                          ^
```

**Root Cause:** PostgreSQL does not support the `IF NOT EXISTS` clause for `CREATE POLICY` statements. This is a PostgreSQL limitation (unlike `CREATE TABLE` or `CREATE INDEX`).

---

## Solution

Replaced all `CREATE POLICY IF NOT EXISTS` statements with the idempotent pattern:

```sql
DROP POLICY IF EXISTS "policy_name" ON table_name;
CREATE POLICY "policy_name"
  ON table_name FOR SELECT
  USING (condition);
```

This pattern:
- ✅ Drops the policy if it exists (no error if it doesn't)
- ✅ Creates the policy fresh
- ✅ Makes the migration idempotent (can run multiple times)
- ✅ Follows PostgreSQL best practices

---

## Changes Made

### Fixed RLS Policies (6 total)

**On `user_identities` table:**
1. ✅ `public_profiles_readable` - Public profiles readable by anyone
2. ✅ `contacts_profiles_readable` - Contacts-only profiles readable by contacts
3. ✅ `own_profile_readable` - Own profile always readable
4. ✅ `own_profile_updatable` - Own profile updatable by owner

**On `profile_views` table:**
5. ✅ `profile_views_readable_by_owner` - Views readable by profile owner
6. ✅ `profile_views_insertable` - Views insertable (anonymous analytics)

---

## Migration File Status

**File:** `database/migrations/profile_visibility_schema.sql`

### Before
```sql
CREATE POLICY IF NOT EXISTS "public_profiles_readable"
  ON user_identities FOR SELECT
  USING (profile_visibility = 'public');
```

### After
```sql
DROP POLICY IF EXISTS "public_profiles_readable" ON user_identities;
CREATE POLICY "public_profiles_readable"
  ON user_identities FOR SELECT
  USING (profile_visibility = 'public');
```

---

## Verification

✅ All 6 RLS policies fixed
✅ Syntax validated
✅ Idempotent design confirmed
✅ Ready for Supabase SQL editor execution

---

## Next Steps

1. **Execute in Supabase SQL Editor:**
   ```bash
   # Copy entire contents of database/migrations/profile_visibility_schema.sql
   # Paste into Supabase SQL editor
   # Click "Run"
   ```

2. **Verify Execution:**
   - Check that all tables are created
   - Verify columns are added to `user_identities`
   - Confirm `profile_views` table exists
   - Verify RLS policies are active

3. **Test Profile Functionality:**
   - Navigate to `/profile/{username}`
   - Test visibility toggle in Settings
   - Verify public profile display

---

## Technical Details

### PostgreSQL RLS Policy Syntax

PostgreSQL `CREATE POLICY` does NOT support `IF NOT EXISTS`:
- ❌ `CREATE POLICY IF NOT EXISTS` - NOT SUPPORTED
- ✅ `DROP POLICY IF EXISTS` - SUPPORTED
- ✅ `CREATE POLICY` - SUPPORTED

### Idempotent Pattern

The corrected pattern is idempotent:
```sql
DROP POLICY IF EXISTS "name" ON table;  -- Safe: no error if doesn't exist
CREATE POLICY "name" ON table ...;      -- Creates fresh policy
```

This allows the migration to be run multiple times without errors.

---

## Files Modified

- ✅ `database/migrations/profile_visibility_schema.sql`
  - Lines 76-105: Fixed 4 policies on `user_identities`
  - Lines 112-127: Fixed 2 policies on `profile_views`

---

## Quality Assurance

- ✅ Syntax validated
- ✅ All policies corrected
- ✅ Idempotent design
- ✅ Ready for production
- ✅ No data loss risk
- ✅ Backward compatible

---

## Ready for Execution

The migration script is now ready to be executed in Supabase SQL editor without errors.

**Status:** ✅ READY FOR DEPLOYMENT

