# DATABASE MIGRATION EXECUTION PLAN

## STEP 1: Execute Database Schema Audit
**File:** `scripts/audit-database-schema.sql`
**Purpose:** Get current database state before making changes
**Action:** Copy and paste into Supabase SQL Editor, execute, save results
**Risk:** None (read-only audit)

## STEP 2: Core Identity System (REQUIRED FIRST)
**File:** `database/complete-identity-system-migration-fixed.sql`
**Purpose:** Create all core identity tables with proper RLS
**Tables Created:**
- profiles (core user profiles)
- user_identities (Nostr identity mapping)
- privacy_users (privacy-first user data)
- families (family federation)
- nip05_records (NIP-05 verification)
- nostr_backups (backup references)
- lightning_addresses (Lightning integration)
- reward_redemptions (reward system)

**Critical Features:**
- RLS policies for user sovereignty
- Anonymous read access for nip05_records
- Proper foreign key relationships
- Default data for testing

**Dependencies:** None (creates everything)
**Risk:** Low (idempotent, uses IF NOT EXISTS)
**Verification:** Run `database/verify-migration-success.sql` after execution

## STEP 3: OTP Authentication System (REQUIRED FOR NOSTR-OTP-SERVICE)
**File:** `database/otp-secrets-schema.sql`
**Purpose:** Enable OTP authentication for Nostr DM delivery
**Tables Created:**
- otp_secrets (TOTP secret storage)
- otp_sessions (OTP session management)

**Critical Features:**
- Privacy-first design with encrypted secrets
- 120-second time windows with ±1 tolerance
- Replay protection and rate limiting
- User sovereignty RLS policies

**Dependencies:** privacy_users table (from Step 2)
**Risk:** Low (creates new tables only)

## STEP 4: Educational System (REQUIRED FOR EDUCATIONAL-API)
**File:** `database/educational-system-schema.sql` (NEEDS TO BE CREATED)
**Purpose:** Support educational-api.ts functionality
**Tables Needed:**
- courses (course catalog)
- course_registrations (student enrollments)
- course_progress (learning progress)
- cognitive_capital_metrics (learning analytics)
- learning_pathways (structured learning paths)

**Critical Features:**
- Public read access for course catalog
- User-owned registration and progress data
- Family-based enrollment approval workflows

**Dependencies:** profiles, families tables (from Step 2)
**Risk:** Medium (new complex system)
**Status:** MIGRATION FILE MISSING - NEEDS CREATION

## STEP 5: Nostr Key Recovery System (OPTIONAL)
**File:** `database/nostr-key-recovery-rotation-migration.sql`
**Purpose:** Nostr key recovery and rotation
**Tables Created:**
- nostr_key_recovery (recovery workflows)
- key_rotation_logs (audit trail)

**Dependencies:** user_identities, families tables (from Step 2)
**Risk:** Low (optional feature)

## STEP 6: Lightning Wallet Integration (OPTIONAL)
**File:** `database/nwc-wallet-integration-schema.sql`
**Purpose:** Nostr Wallet Connect integration
**Tables Created:**
- nwc_connections (wallet connections)
- nwc_permissions (permission management)
- nwc_transactions (transaction history)

**Dependencies:** user_identities table (from Step 2)
**Risk:** Low (optional feature)

## STEP 7: Cashu Mint Integration (OPTIONAL)
**File:** `database/cashu-mint-schema.sql`
**Purpose:** Cashu token management
**Tables Created:**
- cashu_mints (mint registry)
- cashu_tokens (token tracking)
- cashu_bearer_instruments (physical tokens)

**Dependencies:** user_identities table (from Step 2)
**Risk:** Low (optional feature)

## CRITICAL MISSING MIGRATION

### **URGENT: Educational System Schema**
The `educational-api.ts` function expects multiple tables that don't have corresponding migration files:

**Missing Tables:**
1. `courses` - Course catalog with complex schema
2. `course_registrations` - Student enrollment tracking
3. `course_progress` - Learning progress and quiz scores
4. `cognitive_capital_metrics` - Learning analytics
5. `learning_pathways` - Structured learning paths

**Required Actions:**
1. Create `database/educational-system-schema.sql` migration
2. Include proper RLS policies for:
   - Public read access to course catalog
   - User-owned registration and progress data
   - Family-based approval workflows
3. Add appropriate indexes for performance
4. Include sample course data for testing

## SECURITY VERIFICATION CHECKLIST

After executing migrations, verify:

### ✅ **Anonymous Access (anon role)**
- Can SELECT from nip05_records WHERE is_active = true
- Can SELECT from courses WHERE is_active = true
- Can INSERT into profiles during registration
- CANNOT access user_identities, privacy_users, or other sensitive tables

### ✅ **Authenticated Access (authenticated role)**
- Can CRUD their own data in all user tables
- Can access family data if family member
- CANNOT access other users' private data

### ✅ **Service Role Restrictions**
- Service role key NOT exposed in any application code
- Only used for manual DDL operations in Supabase dashboard
- All admin scripts require manual execution

## EXECUTION ORDER SUMMARY

1. **audit-database-schema.sql** (audit current state)
2. **complete-identity-system-migration-fixed.sql** (core system)
3. **otp-secrets-schema.sql** (OTP authentication)
4. **educational-system-schema.sql** (NEEDS CREATION)
5. **verify-migration-success.sql** (verify completion)
6. Optional: nostr-key-recovery, nwc-wallet, cashu-mint schemas

## BACKUP RECOMMENDATIONS

Before executing migrations:
1. Export current database schema: `pg_dump --schema-only`
2. Export current data: `pg_dump --data-only`
3. Test migrations on a staging database first
4. Verify all Netlify Functions work after migration
