# Database Migration Execution Guide

**Migration File:** `database/migrations/profile_visibility_schema.sql`  
**Status:** ✅ Ready for Execution  
**Estimated Time:** 2-3 minutes

---

## Step-by-Step Execution

### Step 1: Access Supabase SQL Editor

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project (satnam-recovery)
3. Click **SQL Editor** in the left sidebar
4. Click **New Query** button

---

### Step 2: Copy Migration Script

1. Open `database/migrations/profile_visibility_schema.sql` in your editor
2. Select all content (Ctrl+A)
3. Copy (Ctrl+C)

---

### Step 3: Paste into Supabase

1. In Supabase SQL Editor, click in the query text area
2. Paste the migration script (Ctrl+V)
3. Verify the script is complete (should end with `-- End of migration`)

---

### Step 4: Execute Migration

1. Click the **Run** button (or press Ctrl+Enter)
2. Wait for execution to complete (2-3 minutes)
3. Check for success message: "Query executed successfully"

---

## Expected Output

### Success Indicators

✅ No error messages  
✅ All statements executed  
✅ Tables created:
- `profile_views` table created
- Columns added to `user_identities`:
  - `profile_visibility`
  - `profile_banner_url`
  - `profile_theme`
  - `social_links`
  - `is_discoverable`
  - `profile_views_count`
  - `last_profile_view`
  - `analytics_enabled`

✅ Indexes created (6 total)  
✅ RLS policies created (6 total)  
✅ Functions created (3 total)

---

## Verification Steps

### 1. Verify Tables

```sql
-- Check profile_views table exists
SELECT * FROM profile_views LIMIT 1;

-- Check user_identities columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_identities' 
AND column_name LIKE 'profile_%';
```

### 2. Verify RLS Policies

```sql
-- List all policies on user_identities
SELECT policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'user_identities'
ORDER BY policyname;

-- List all policies on profile_views
SELECT policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'profile_views'
ORDER BY policyname;
```

### 3. Verify Functions

```sql
-- Check if functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE 'hash_%' OR routine_name LIKE 'increment_%';
```

---

## Troubleshooting

### Error: "relation 'profile_views' does not exist"

**Cause:** Migration didn't complete successfully  
**Solution:** 
1. Check for error messages in the output
2. Scroll up to see where execution stopped
3. Fix the error and re-run

### Error: "policy already exists"

**Cause:** Policy wasn't dropped properly  
**Solution:**
1. This shouldn't happen with the fixed script
2. If it does, manually drop policies:
   ```sql
   DROP POLICY IF EXISTS "public_profiles_readable" ON user_identities;
   DROP POLICY IF EXISTS "contacts_profiles_readable" ON user_identities;
   DROP POLICY IF EXISTS "own_profile_readable" ON user_identities;
   DROP POLICY IF EXISTS "own_profile_updatable" ON user_identities;
   DROP POLICY IF EXISTS "profile_views_readable_by_owner" ON profile_views;
   DROP POLICY IF EXISTS "profile_views_insertable" ON profile_views;
   ```
3. Then re-run the migration

### Error: "column already exists"

**Cause:** Migration was partially run before  
**Solution:**
1. Check which columns exist:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'user_identities';
   ```
2. If columns exist, the migration is already applied
3. Proceed to testing

---

## Post-Migration Checklist

- [ ] Migration executed without errors
- [ ] All tables created
- [ ] All columns added
- [ ] All indexes created
- [ ] All RLS policies created
- [ ] All functions created
- [ ] Verification queries passed
- [ ] Ready for testing

---

## Next Steps After Migration

1. **Test Profile Routes:**
   - Navigate to `/profile/username`
   - Verify PublicProfilePage renders

2. **Test Visibility Toggle:**
   - Go to Settings
   - Test 3-way toggle (Private/Contacts/Public)
   - Verify API calls succeed

3. **Test Public Profile:**
   - Set profile to public
   - Open in incognito window
   - Verify profile is visible

4. **Test Analytics:**
   - Enable analytics
   - View profile multiple times
   - Check view count increases

---

## Rollback (If Needed)

If you need to rollback the migration:

```sql
-- Drop tables
DROP TABLE IF EXISTS profile_views CASCADE;

-- Drop columns from user_identities
ALTER TABLE user_identities DROP COLUMN IF EXISTS profile_visibility;
ALTER TABLE user_identities DROP COLUMN IF EXISTS profile_banner_url;
ALTER TABLE user_identities DROP COLUMN IF EXISTS profile_theme;
ALTER TABLE user_identities DROP COLUMN IF EXISTS social_links;
ALTER TABLE user_identities DROP COLUMN IF EXISTS is_discoverable;
ALTER TABLE user_identities DROP COLUMN IF EXISTS profile_views_count;
ALTER TABLE user_identities DROP COLUMN IF EXISTS last_profile_view;
ALTER TABLE user_identities DROP COLUMN IF EXISTS analytics_enabled;

-- Drop functions
DROP FUNCTION IF EXISTS hash_viewer_identity(text);
DROP FUNCTION IF EXISTS increment_profile_view_count(uuid);
DROP FUNCTION IF EXISTS trigger_increment_profile_views();
```

---

## Support

If you encounter issues:
1. Check the error message carefully
2. Review the troubleshooting section
3. Verify the migration file syntax
4. Check Supabase logs for detailed errors

**Status:** ✅ Ready for Execution

