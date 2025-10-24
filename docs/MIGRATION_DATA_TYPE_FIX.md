# Migration Data Type Fix - Profile Visibility Schema

**Status:** ✅ FIXED  
**Date:** October 23, 2025  
**Issue:** PostgreSQL foreign key constraint error due to data type mismatch

---

## Problem

The migration script encountered a foreign key constraint error:

```
ERROR:  42804: foreign key constraint "profile_views_profile_id_fkey" cannot be implemented
DETAIL:  Key columns "profile_id" and "id" are of incompatible types: uuid and character varying.
```

**Root Cause:** 
- `profile_views.profile_id` was defined as `UUID`
- `user_identities.id` is actually `VARCHAR` (privacy-first DUID)
- Foreign key constraint requires matching data types

---

## Solution

Changed all UUID references to VARCHAR to match the privacy-first schema:

### Change 1: profile_views Table Definition

**Before:**
```sql
CREATE TABLE IF NOT EXISTS profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  ...
);
```

**After:**
```sql
CREATE TABLE IF NOT EXISTS profile_views (
  id VARCHAR(255) PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex'),
  profile_id VARCHAR(255) NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
  ...
);
```

**Rationale:**
- ✅ Matches `user_identities.id` data type (VARCHAR)
- ✅ Uses `encode(gen_random_bytes(16), 'hex')` for random ID generation
- ✅ Maintains privacy-first architecture
- ✅ Consistent with existing schema patterns

### Change 2: increment_profile_view_count Function

**Before:**
```sql
CREATE OR REPLACE FUNCTION increment_profile_view_count(profile_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE user_identities 
  SET profile_views_count = profile_views_count + 1
  WHERE id = profile_id AND analytics_enabled = true;
END;
$$ LANGUAGE plpgsql;
```

**After:**
```sql
CREATE OR REPLACE FUNCTION increment_profile_view_count(profile_id VARCHAR)
RETURNS void AS $$
BEGIN
  UPDATE user_identities 
  SET profile_views_count = profile_views_count + 1
  WHERE id = profile_id AND analytics_enabled = true;
END;
$$ LANGUAGE plpgsql;
```

**Rationale:**
- ✅ Function parameter matches VARCHAR type
- ✅ Allows proper type casting in trigger
- ✅ Prevents type mismatch errors

---

## Privacy-First Architecture Alignment

### Why VARCHAR Instead of UUID?

The Satnam.pub system uses privacy-first DUIDs (Distributed Unique Identifiers):

1. **DUID Generation:** Server-side HMAC-SHA256 of NIP-05 identifier + secret
2. **Storage:** VARCHAR/TEXT (hashed, not UUID)
3. **Privacy:** No direct UUID exposure, hashed identifiers only
4. **Consistency:** All user identity references use VARCHAR

### Existing Schema Pattern

```sql
-- user_identities table uses VARCHAR for id
CREATE TABLE user_identities (
  id VARCHAR(255) PRIMARY KEY,  -- DUID (hashed identifier)
  user_salt VARCHAR(255),
  hashed_username VARCHAR(255),
  hashed_npub VARCHAR(255),
  ...
);
```

The profile_views table now follows the same pattern.

---

## Changes Made

### File: `database/migrations/profile_visibility_schema.sql`

**Line 33:** Changed `id` column type
```sql
-- Before: id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
-- After:  id VARCHAR(255) PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex'),
```

**Line 34:** Changed `profile_id` column type
```sql
-- Before: profile_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
-- After:  profile_id VARCHAR(255) NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
```

**Line 146:** Changed function parameter type
```sql
-- Before: CREATE OR REPLACE FUNCTION increment_profile_view_count(profile_id UUID)
-- After:  CREATE OR REPLACE FUNCTION increment_profile_view_count(profile_id VARCHAR)
```

---

## Verification

### Data Type Consistency

✅ `profile_views.id` → VARCHAR(255)  
✅ `profile_views.profile_id` → VARCHAR(255)  
✅ `user_identities.id` → VARCHAR (DUID)  
✅ Foreign key constraint → Compatible types  
✅ Function parameters → Matching types  

### Migration Idempotency

✅ Uses `IF NOT EXISTS` for table creation  
✅ Uses `DROP POLICY IF EXISTS` for policies  
✅ Can be run multiple times safely  
✅ No data loss on re-execution  

---

## Technical Details

### Random ID Generation

**Old Pattern (UUID):**
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

**New Pattern (VARCHAR):**
```sql
id VARCHAR(255) PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex')
```

**Why?**
- `gen_random_bytes(16)` generates 16 random bytes (128 bits)
- `encode(..., 'hex')` converts to hexadecimal string (32 characters)
- Provides same randomness as UUID but in VARCHAR format
- Consistent with privacy-first architecture

### Foreign Key Constraint

**Before (Error):**
```sql
profile_id UUID REFERENCES user_identities(id)  -- Type mismatch!
```

**After (Fixed):**
```sql
profile_id VARCHAR(255) REFERENCES user_identities(id)  -- Types match!
```

---

## Ready for Execution

The migration script is now corrected and ready for Supabase SQL Editor:

✅ All data types match existing schema  
✅ Foreign key constraints valid  
✅ Function parameters correct  
✅ Privacy-first architecture maintained  
✅ Idempotent design preserved  

---

## Next Steps

1. **Execute in Supabase SQL Editor:**
   - Copy entire `database/migrations/profile_visibility_schema.sql`
   - Paste into Supabase SQL Editor
   - Click Run

2. **Verify Execution:**
   - Check for success message
   - Verify tables and columns created
   - Verify foreign key constraints active

3. **Test Functionality:**
   - Test profile visibility toggle
   - Test public profile display
   - Test analytics recording

---

## Rollback (If Needed)

If you need to rollback:

```sql
DROP TABLE IF EXISTS profile_views CASCADE;
ALTER TABLE user_identities DROP COLUMN IF EXISTS profile_visibility;
ALTER TABLE user_identities DROP COLUMN IF EXISTS profile_banner_url;
ALTER TABLE user_identities DROP COLUMN IF EXISTS profile_theme;
ALTER TABLE user_identities DROP COLUMN IF EXISTS social_links;
ALTER TABLE user_identities DROP COLUMN IF EXISTS is_discoverable;
ALTER TABLE user_identities DROP COLUMN IF EXISTS profile_views_count;
ALTER TABLE user_identities DROP COLUMN IF EXISTS last_profile_view;
ALTER TABLE user_identities DROP COLUMN IF EXISTS analytics_enabled;
DROP FUNCTION IF EXISTS hash_viewer_identity(text);
DROP FUNCTION IF EXISTS increment_profile_view_count(varchar);
DROP FUNCTION IF EXISTS trigger_increment_profile_views();
```

---

**Status:** ✅ READY FOR EXECUTION

