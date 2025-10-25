# PKARR Deployment Checklist

**Phase 2A + Phase 2B-1 - Production Deployment**

## Overview

This checklist ensures all PKARR attestation features are production-ready before deployment. Complete all items before deploying to production.

**Includes:**

- **Phase 2A:** Core PKARR verification, publishing, scheduled republishing
- **Phase 2B-1 Day 1:** Batch verification (up to 50 contacts)
- **Phase 2B-1 Day 2:** Analytics & monitoring dashboard
- **Phase 2B-1 Day 3:** Performance optimizations (caching, deduplication, indexes)
- **Phase 2B-1 Day 4:** Error handling & retry logic (circuit breaker, exponential backoff)
- **Phase 2B-1 Day 5:** Admin dashboard integration (error metrics, circuit breaker status)
- **Phase 2B-1 Day 6:** Enhanced scheduled republishing (stale detection, metrics, rate limiting)

---

## Pre-Deployment Checklist

### 1. Code Review & Testing

- [ ] **All integration tests passing**

  - [ ] `tests/pkarr-verification.test.ts` (7/7 tests) - Phase 2A
  - [ ] `tests/pkarr-publishing.test.ts` (6/6 tests) - Phase 2A
  - [ ] `tests/pkarr-ui.test.tsx` (9/9 tests) - Phase 2A
  - [ ] `tests/pkarr-batch-verification.test.ts` (6/6 tests) - Phase 2B-1 Day 1
  - [ ] `tests/pkarr-analytics.test.ts` (6/6 tests) - Phase 2B-1 Day 2
  - [ ] `tests/pkarr-performance.test.ts` (15/15 tests) - Phase 2B-1 Day 3
  - [ ] `tests/pkarr-error-handling.test.ts` (32/32 tests) - Phase 2B-1 Day 4
  - [ ] `tests/pkarr-admin-integration.test.ts` (29/29 tests) - Phase 2B-1 Day 5
  - [ ] `tests/pkarr-republishing.test.ts` (31/31 tests) - Phase 2B-1 Day 6
  - [ ] Total: 141/141 tests passing (100% pass rate)

- [ ] **Manual testing completed**

  - [ ] Contact verification workflow (5 test cases)
  - [ ] PKARR publishing workflow (3 test cases)
  - [ ] Scheduled republishing (2 test cases)
  - [ ] UI component testing (3 test cases)
  - [ ] All bugs documented and prioritized

- [ ] **Critical/High bugs fixed**

  - [ ] No critical bugs remaining
  - [ ] No high-priority bugs remaining
  - [ ] Medium/Low bugs documented for future releases

- [ ] **Code review completed**
  - [ ] All new files reviewed by team
  - [ ] Security review completed
  - [ ] Performance review completed
  - [ ] No TypeScript errors or warnings

---

### 2. Database Migrations

- [ ] **Migration files are idempotent**

  - [ ] Can be run multiple times without errors
  - [ ] Uses `IF NOT EXISTS` for table/column creation
  - [ ] Uses `IF EXISTS` for table/column deletion

- [ ] **RLS policies tested**

  - [ ] `encrypted_contacts` RLS policies enforce owner_hash matching
  - [ ] `pkarr_records` RLS policies tested
  - [ ] `pkarr_publish_history` RLS policies tested
  - [ ] Unauthorized access attempts blocked

- [ ] **Trigger functions tested**

  - [ ] `auto_update_verification_level()` trigger works correctly
  - [ ] All verification level transitions tested (unverified → basic → verified → trusted)
  - [ ] Trigger doesn't cause performance issues

- [ ] **Indexes created (Phase 2B-1 Day 3)**

  - [ ] 13 composite indexes on `encrypted_contacts`
  - [ ] 5 partial indexes on `pkarr_records`
  - [ ] 3 indexes on `pkarr_publish_history`
  - [ ] 2 indexes on `pkarr_resolution_cache`
  - [ ] Helper functions: `check_pkarr_index_usage()`, `estimate_contact_lookup_performance()`

- [ ] **Database backup created**
  - [ ] Full backup before running migrations
  - [ ] Backup tested and verified
  - [ ] Rollback plan documented

#### Migration Execution Order (CRITICAL)

**Migrations must be executed in this exact order:**

1. **Migration 029** (`029_pkarr_records_integration.sql`) - REQUIRED FIRST

   - Creates: `pkarr_records`, `pkarr_resolution_cache`, `pkarr_publish_history` tables
   - Dependencies: None

2. **Migration 037** (`037_pkarr_analytics_views.sql`) - DEPENDS ON 029

   - Creates: 4 analytics views
   - Dependencies: Migration 029 must be run first

3. **Migration 038** (`038_pkarr_performance_indexes.sql`) - DEPENDS ON 029

   - Creates: 20+ performance indexes
   - Dependencies: Migration 029 must be run first

4. **Migration 039** (`039_pkarr_republishing_tracking.sql`) - DEPENDS ON 029 (Phase 2B-1 Day 6)
   - Creates: 4 new columns on `pkarr_records` table
   - Creates: 4 new indexes for stale record detection
   - Creates: 3 helper functions (`find_stale_pkarr_records`, `get_pkarr_republish_stats`, `update_pkarr_republish_metrics`)
   - Dependencies: Migration 029 must be run first

**Verification Queries:**

```sql
-- Verify Migration 029
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('pkarr_records', 'pkarr_resolution_cache', 'pkarr_publish_history');
-- Should return 3 rows

-- Verify Migration 037
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public' AND table_name LIKE 'pkarr_%';
-- Should return 4 rows

-- Verify Migration 038
SELECT COUNT(*) FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexname LIKE 'idx_%pkarr%' OR indexname LIKE 'idx_contacts_%');
-- Should return 20+ indexes

-- Verify Migration 039 (Phase 2B-1 Day 6)
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pkarr_records'
  AND column_name IN ('last_republish_attempt', 'republish_count', 'last_republish_success', 'republish_failure_count');
-- Should return 4 rows

SELECT COUNT(*) FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('find_stale_pkarr_records', 'get_pkarr_republish_stats', 'update_pkarr_republish_metrics');
-- Should return 3 functions
```

---

### 3. Environment Variables

- [ ] **Production environment variables set**

  - [ ] `VITE_PKARR_ENABLED` (default: `false`, set to `true` to enable) - Phase 2A
  - [ ] `VITE_HYBRID_IDENTITY_ENABLED` (required: `true`) - Phase 2A
  - [ ] `VITE_PKARR_AUTO_VERIFY_ON_ADD` (default: `false`) - Phase 2A
  - [ ] `VITE_PKARR_ADMIN_ENABLED` (default: `false`, set to `true` for admin dashboard) - Phase 2B-1 Day 2
  - [ ] `VITE_MULTI_METHOD_VERIFICATION_ENABLED` (default: `false`) - Phase 1 Week 4
  - [ ] `VITE_SIMPLEPROOF_ENABLED` (default: `false`) - Phase 1
  - [ ] All other required environment variables present

- [ ] **Environment variables documented**

  - [ ] README.md updated with new variables
  - [ ] `.env.example` file updated
  - [ ] Documentation includes default values and descriptions
  - [ ] netlify.toml includes all PKARR feature flags (lines 21-27)

- [ ] **Secrets secured**
  - [ ] No secrets in version control
  - [ ] Netlify environment variables configured
  - [ ] Supabase Vault secrets configured (if applicable)

---

### 4. Netlify Functions Configuration

- [ ] **netlify.toml updated**

  - [ ] Scheduled function configured:
    ```toml
    [functions."scheduled-pkarr-republish"]
      schedule = "0 */6 * * *"  # Every 6 hours
      memory = 256
      timeout = 60
    ```
  - [ ] Function memory limits appropriate (256MB)
  - [ ] Function timeouts appropriate (60s)
  - [ ] Phase 2B-1 function configurations added (verify-contact-pkarr, verify-contacts-batch, pkarr-analytics)

- [ ] **Functions deployed and tested**

  - [ ] `verify-contact-pkarr` function deployed (Phase 2A + 2B-1 Days 3-4)
  - [ ] `verify-contacts-batch` function deployed (Phase 2B-1 Day 1)
  - [ ] `pkarr-analytics` function deployed (Phase 2B-1 Day 2 + Day 5)
  - [ ] `scheduled-pkarr-republish` function deployed (Phase 2A Day 6 + Phase 2B-1 Day 6 enhanced)
  - [ ] `pkarr-publish` function deployed (Phase 2A existing)
  - [ ] All functions accessible via HTTPS

- [ ] **Scheduled function verified (Phase 2B-1 Day 6 enhanced)**

  - [ ] Cron schedule correct (`0 */6 * * *` = every 6 hours)
  - [ ] Function runs successfully on schedule
  - [ ] Netlify dashboard shows scheduled function status
  - [ ] Function logs show successful executions
  - [ ] Stale record detection working (>18 hours threshold)
  - [ ] Batch processing respects 50 record limit
  - [ ] Metrics collection working (success rate, timing, errors)
  - [ ] Error handling and retry logic functioning
  - [ ] Database helper functions accessible (`find_stale_pkarr_records`, `get_pkarr_republish_stats`, `update_pkarr_republish_metrics`)

- [ ] **Rate limiting configured**
  - [ ] Rate limiter utility tested (`netlify/functions/utils/rate-limiter.js`)
  - [ ] 60 requests/hour per IP limit enforced
  - [ ] Rate limit responses tested (429 Too Many Requests)

---

### 5. API Endpoints

- [ ] **Endpoints tested in production-like environment**

  - [ ] `POST /.netlify/functions/verify-contact-pkarr`
  - [ ] `POST /.netlify/functions/scheduled-pkarr-republish`
  - [ ] `POST /.netlify/functions/pkarr-publish` (existing)

- [ ] **Authentication tested**

  - [ ] Valid JWT tokens accepted
  - [ ] Invalid JWT tokens rejected (401 Unauthorized)
  - [ ] Missing tokens rejected (401 Unauthorized)

- [ ] **Error handling tested**

  - [ ] 400 Bad Request for invalid input
  - [ ] 401 Unauthorized for missing/invalid auth
  - [ ] 404 Not Found for missing resources
  - [ ] 429 Too Many Requests for rate limit exceeded
  - [ ] 500 Internal Server Error for unexpected errors

- [ ] **Response formats validated**
  - [ ] All responses return valid JSON
  - [ ] Success responses include expected fields
  - [ ] Error responses include error messages

---

### 6. UI Components

- [ ] **Components tested in browser**

  - [ ] `ContactVerificationBadge` renders correctly
  - [ ] `AttestationsTab` renders correctly
  - [ ] All verification levels display correct colors (gray/blue/green/gold)
  - [ ] All 5 verification methods display correctly

- [ ] **User interactions tested**

  - [ ] "Verify via PKARR" button works
  - [ ] "Republish Now" button works
  - [ ] Loading states display correctly
  - [ ] Error messages display correctly

- [ ] **Feature flag gating tested**

  - [ ] Components hidden when `VITE_PKARR_ENABLED=false`
  - [ ] Components visible when `VITE_PKARR_ENABLED=true`
  - [ ] No errors when feature is disabled

- [ ] **Responsive design tested**
  - [ ] Components work on desktop (1920x1080)
  - [ ] Components work on tablet (768x1024)
  - [ ] Components work on mobile (375x667)

---

### 7. Documentation

- [ ] **API documentation complete**

  - [ ] `docs/PKARR_API_DOCUMENTATION.md` created
  - [ ] All endpoints documented with examples
  - [ ] Request/response formats documented
  - [ ] Error codes documented

- [ ] **User guide complete**

  - [ ] `docs/PKARR_USER_GUIDE.md` created
  - [ ] Verification levels explained
  - [ ] How-to guides for common tasks
  - [ ] Troubleshooting section included
  - [ ] FAQ section included

- [ ] **Manual testing guide complete**

  - [ ] `docs/PKARR_MANUAL_TESTING_GUIDE.md` created
  - [ ] All test cases documented
  - [ ] Expected results documented
  - [ ] Bug tracking templates included

- [ ] **Deployment checklist complete**
  - [ ] This document (`docs/PKARR_DEPLOYMENT_CHECKLIST.md`)
  - [ ] All sections completed
  - [ ] Rollback plan documented

---

### 8. Performance & Monitoring

- [ ] **Performance tested**

  - [ ] PKARR verification completes in <5 seconds
  - [ ] Scheduled republishing completes in <60 seconds
  - [ ] No memory leaks detected
  - [ ] No performance degradation under load

- [ ] **Monitoring configured**

  - [ ] Netlify function logs monitored
  - [ ] Database query performance monitored
  - [ ] Error rates monitored
  - [ ] Rate limit violations monitored
  - [ ] Republishing metrics monitored (Phase 2B-1 Day 6):
    - [ ] Success rate (target: >95%)
    - [ ] Average publish time (target: <3000ms)
    - [ ] Stale record count (should decrease over time)
    - [ ] Failure count by error code
    - [ ] Relay publish success rate

- [ ] **Alerts configured**
  - [ ] Alert on scheduled function failures
  - [ ] Alert on high error rates (>5%)
  - [ ] Alert on database connection issues
  - [ ] Alert on rate limit violations (>100/hour)
  - [ ] Alert on republishing success rate <90% (Phase 2B-1 Day 6)
  - [ ] Alert on stale record backlog >100 records (Phase 2B-1 Day 6)

---

### 9. Security Review

- [ ] **Authentication & Authorization**

  - [ ] All endpoints require authentication (except scheduled functions)
  - [ ] RLS policies enforce data isolation
  - [ ] Session tokens validated correctly
  - [ ] No authentication bypass vulnerabilities

- [ ] **Input Validation**

  - [ ] All user inputs validated
  - [ ] SQL injection prevented (using parameterized queries)
  - [ ] XSS prevented (using proper escaping)
  - [ ] CSRF protection in place

- [ ] **Cryptography**

  - [ ] Ed25519 signatures verified correctly
  - [ ] No private keys (nsec) exposed in PKARR records
  - [ ] Noble V2 encryption used for sensitive data
  - [ ] No hardcoded secrets in code

- [ ] **Privacy**
  - [ ] Zero-knowledge architecture maintained
  - [ ] No PII in PKARR records
  - [ ] User consent obtained for public data
  - [ ] GDPR compliance verified (if applicable)

---

### 10. Rollback Plan

- [ ] **Rollback procedure documented**

  - [ ] Steps to disable PKARR features
  - [ ] Steps to revert database migrations
  - [ ] Steps to revert code changes
  - [ ] Estimated rollback time: **\_** minutes

- [ ] **Rollback tested**

  - [ ] Rollback procedure tested in staging
  - [ ] Database rollback tested
  - [ ] Application still functions after rollback

- [ ] **Rollback triggers defined**
  - [ ] Critical bug discovered in production
  - [ ] Performance degradation >50%
  - [ ] Error rate >10%
  - [ ] Security vulnerability discovered

---

## Deployment Steps

### Step 1: Database Migration

**CRITICAL:** Execute migrations in this exact order to avoid dependency errors.

#### 1.1: Run Migration 029 (REQUIRED FIRST)

```bash
# In Supabase SQL Editor:
# 1. Open database/migrations/029_pkarr_records_integration.sql
# 2. Copy entire contents
# 3. Paste into SQL Editor
# 4. Click "Run"
# 5. Verify no errors
```

**Verification Query:**

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('pkarr_records', 'pkarr_resolution_cache', 'pkarr_publish_history');
-- Should return 3 rows

-- Check RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('pkarr_records', 'pkarr_resolution_cache', 'pkarr_publish_history');
-- All should have rowsecurity = true
```

**Expected Result:** ✅ 3 tables created, RLS enabled, 0 errors

---

#### 1.2: Run Migration 037 (DEPENDS ON 029)

```bash
# In Supabase SQL Editor:
# 1. Open database/migrations/037_pkarr_analytics_views.sql
# 2. Copy entire contents
# 3. Paste into SQL Editor
# 4. Click "Run"
# 5. Verify no errors
```

**Verification Query:**

```sql
-- Check views exist
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public' AND table_name LIKE 'pkarr_%';
-- Should return 4 rows

-- Test helper function
SELECT * FROM get_pkarr_stats(
  EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours'),
  EXTRACT(EPOCH FROM NOW())
);
-- Should return stats (may be empty if no data yet)
```

**Expected Result:** ✅ 4 views created, helper function created, 0 errors

---

#### 1.3: Run Migration 038 (DEPENDS ON 029)

```bash
# In Supabase SQL Editor:
# 1. Open database/migrations/038_pkarr_performance_indexes.sql
# 2. Copy entire contents
# 3. Paste into SQL Editor
# 4. Click "Run"
# 5. Verify no errors
```

**Verification Query:**

```sql
-- Check indexes exist
SELECT COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexname LIKE 'idx_%pkarr%' OR indexname LIKE 'idx_contacts_%');
-- Should return 20+ indexes

-- Check helper functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('check_pkarr_index_usage', 'estimate_contact_lookup_performance');
-- Should return 2 rows
```

**Expected Result:** ✅ 20+ indexes created, helper functions created, 0 errors

---

#### 1.4: Run ANALYZE (Optimize Query Planner)

```sql
-- Optimize query planner statistics
ANALYZE public.pkarr_records;
ANALYZE public.pkarr_resolution_cache;
ANALYZE public.pkarr_publish_history;
ANALYZE public.encrypted_contacts;
```

**Expected Result:** ✅ Statistics updated for all tables

---

### Step 2: Deploy Code Changes

```bash
# 1. Merge feature branch to main
git checkout main
git merge phase-2a-pkarr-production

# 2. Push to remote
git push origin main

# 3. Netlify auto-deploys from main branch
# 4. Monitor deployment logs
```

**Verification:**

- [ ] Netlify build succeeds
- [ ] No build errors or warnings
- [ ] All functions deployed successfully

---

### Step 3: Configure Environment Variables

```bash
# In Netlify dashboard:
# 1. Navigate to Site Settings > Environment Variables
# 2. Add/update variables:
VITE_PKARR_ENABLED=true
VITE_PKARR_AUTO_VERIFY_ON_ADD=false
VITE_HYBRID_IDENTITY_ENABLED=true

# 3. Trigger redeploy to apply new variables
```

**Verification:**

- [ ] Environment variables visible in Netlify dashboard
- [ ] Redeploy triggered successfully
- [ ] Application uses new environment variables

---

### Step 4: Verify Scheduled Function

```bash
# 1. Check Netlify dashboard > Functions > Scheduled
# 2. Verify "scheduled-pkarr-republish" is listed
# 3. Check next scheduled run time
# 4. Manually trigger function for testing
```

**Verification:**

- [ ] Scheduled function appears in dashboard
- [ ] Next run time is correct (within 6 hours)
- [ ] Manual trigger succeeds
- [ ] Function logs show successful execution

---

### Step 5: Smoke Testing

```bash
# 1. Test contact verification
# 2. Test PKARR publishing during registration
# 3. Test manual republishing
# 4. Test UI components
# 5. Monitor error logs for 1 hour
```

**Verification:**

- [ ] All smoke tests pass
- [ ] No errors in logs
- [ ] No user-reported issues

---

## Post-Deployment Monitoring

### First 24 Hours

- [ ] Monitor Netlify function logs every 2 hours
- [ ] Monitor database query performance
- [ ] Monitor error rates
- [ ] Monitor scheduled function executions (4 runs in 24 hours)
- [ ] Check for user-reported issues
- [ ] Monitor republishing metrics (Phase 2B-1 Day 6):

  ```sql
  -- Check republishing stats
  SELECT * FROM get_pkarr_republish_stats();

  -- Check stale record count
  SELECT COUNT(*) FROM find_stale_pkarr_records(100, 18);

  -- Check recent republish attempts
  SELECT
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE last_republish_success = true) as successful,
    COUNT(*) FILTER (WHERE last_republish_success = false) as failed,
    AVG(republish_count) as avg_republish_count
  FROM pkarr_records
  WHERE last_republish_attempt > EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000;
  ```

### First Week

- [ ] Daily log review
- [ ] Weekly performance report
- [ ] User feedback collection
- [ ] Bug tracking and prioritization
- [ ] Weekly republishing metrics review (Phase 2B-1 Day 6)

---

## Rollback Procedure

**If critical issues are discovered:**

1. **Disable PKARR Features:**

   ```bash
   # In Netlify dashboard:
   VITE_PKARR_ENABLED=false
   # Trigger redeploy
   ```

2. **Revert Code Changes:**

   ```bash
   git revert <commit-hash>
   git push origin main
   ```

3. **Revert Database Migration (if necessary):**

   ```sql
   -- Drop tables (data will be lost!)
   DROP TABLE IF EXISTS pkarr_publish_history;
   DROP TABLE IF EXISTS pkarr_records;

   -- Drop trigger
   DROP TRIGGER IF EXISTS auto_update_verification_level ON encrypted_contacts;
   DROP FUNCTION IF EXISTS auto_update_verification_level();

   -- Remove columns from encrypted_contacts
   ALTER TABLE encrypted_contacts DROP COLUMN IF EXISTS pkarr_verified;
   ```

4. **Notify Users:**
   - Post announcement about temporary feature disable
   - Provide estimated time for fix
   - Apologize for inconvenience

---

## Sign-Off

**Deployment Approved By:**

- [ ] **Lead Developer:** **\*\*\*\***\_**\*\*\*\*** Date: **\_\_\_**
- [ ] **Security Review:** **\*\*\*\***\_**\*\*\*\*** Date: **\_\_\_**
- [ ] **QA Lead:** **\*\*\*\***\_**\*\*\*\*** Date: **\_\_\_**
- [ ] **Product Owner:** **\*\*\*\***\_**\*\*\*\*** Date: **\_\_\_**

**Deployment Date:** **\_\_\_**  
**Deployment Time:** **\_\_\_** UTC  
**Deployed By:** **\*\*\*\***\_**\*\*\*\***

---

**Last Updated:** 2025-10-24
**Version:** Phase 2A + Phase 2B-1 (Days 1-4) Production Implementation
