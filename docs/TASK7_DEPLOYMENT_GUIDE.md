# TASK 7: FROST Persistence - Production Deployment Guide

**Date:** 2025-10-27  
**Version:** 1.0.0  
**Status:** Phase 3 Complete - Ready for Deployment

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1: Database Schema Deployment](#phase-1-database-schema-deployment)
4. [Phase 2: FROST Session Manager Deployment](#phase-2-frost-session-manager-deployment)
5. [Phase 3: Unified Service Deployment](#phase-3-unified-service-deployment)
6. [Verification Steps](#verification-steps)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This guide provides step-by-step instructions for deploying the FROST Persistence system to production. The deployment is organized into three phases that must be completed in order:

- **Phase 1:** Database schema (tables, indexes, RLS policies)
- **Phase 2:** FROST Session Manager service
- **Phase 3:** Unified Federated Signing Service

**Total Estimated Deployment Time:** 30-45 minutes

---

## Prerequisites

### Required Access

- ✅ Supabase project admin access
- ✅ Netlify deployment access
- ✅ Git repository write access
- ✅ Production environment variables access

### Required Tools

- ✅ Supabase CLI (optional, for local testing)
- ✅ Node.js 18+ and npm
- ✅ Git

### Pre-Deployment Checklist

- [ ] All tests passing locally (Phase 1, 2, 3)
- [ ] Code reviewed and approved
- [ ] Backup of current production database
- [ ] Maintenance window scheduled (if required)
- [ ] Team notified of deployment

---

## Phase 1: Database Schema Deployment

### Step 1.1: Backup Current Database

**CRITICAL:** Always backup before schema changes.

```bash
# Using Supabase CLI
supabase db dump -f backup-$(date +%Y%m%d-%H%M%S).sql

# Or via Supabase Dashboard:
# Settings → Database → Backups → Create Backup
```

### Step 1.2: Review Migration File

**File:** `scripts/036_frost_signing_sessions.sql`

**Contents:**
- 2 tables: `frost_signing_sessions`, `frost_nonce_commitments`
- 10 indexes (7 sessions + 3 nonces)
- 7 RLS policies (4 sessions + 3 nonces)
- 3 helper functions

**Review Checklist:**
- [ ] Table schemas match requirements
- [ ] Indexes are properly defined
- [ ] RLS policies enforce privacy-first architecture
- [ ] Helper functions are idempotent

### Step 1.3: Apply Migration to Production

**Option A: Supabase SQL Editor (Recommended)**

1. Open Supabase Dashboard → SQL Editor
2. Create new query
3. Copy entire contents of `scripts/036_frost_signing_sessions.sql`
4. Paste into SQL Editor
5. Click "Run" button
6. Verify success message (no errors)

**Option B: Supabase CLI**

```bash
supabase db push --file scripts/036_frost_signing_sessions.sql
```

### Step 1.4: Verify Database Schema

Run verification queries in Supabase SQL Editor:

```sql
-- Verify tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('frost_signing_sessions', 'frost_nonce_commitments');

-- Verify indexes
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('frost_signing_sessions', 'frost_nonce_commitments');

-- Verify RLS policies
SELECT policyname, tablename 
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('frost_signing_sessions', 'frost_nonce_commitments');

-- Verify helper functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%frost%';
```

**Expected Results:**
- 2 tables created
- 10 indexes created
- 7 RLS policies created
- 3 helper functions created

### Step 1.5: Test Database Operations

Run test queries to verify functionality:

```sql
-- Test session creation (should succeed)
INSERT INTO frost_signing_sessions (
  session_id, family_id, message_hash, participants, threshold, created_by, created_at, expires_at
) VALUES (
  'test-session-' || gen_random_uuid()::text,
  'test-family',
  'test-hash',
  ARRAY['guardian1', 'guardian2'],
  2,
  'test-user',
  extract(epoch from now())::bigint * 1000,
  (extract(epoch from now())::bigint + 300) * 1000
);

-- Test nonce commitment creation (should succeed)
INSERT INTO frost_nonce_commitments (
  session_id, participant_id, nonce_commitment, created_at
) VALUES (
  (SELECT session_id FROM frost_signing_sessions ORDER BY created_at DESC LIMIT 1),
  'guardian1',
  'test-nonce-' || gen_random_uuid()::text,
  extract(epoch from now())::bigint * 1000
);

-- Test nonce reuse prevention (should fail with unique constraint violation)
INSERT INTO frost_nonce_commitments (
  session_id, participant_id, nonce_commitment, created_at
) VALUES (
  (SELECT session_id FROM frost_signing_sessions ORDER BY created_at DESC LIMIT 1),
  'guardian2',
  (SELECT nonce_commitment FROM frost_nonce_commitments ORDER BY created_at DESC LIMIT 1),
  extract(epoch from now())::bigint * 1000
);

-- Cleanup test data
DELETE FROM frost_signing_sessions WHERE session_id LIKE 'test-session-%';
```

**✅ Phase 1 Complete** when all verification steps pass.

---

## Phase 2: FROST Session Manager Deployment

### Step 2.1: Deploy Code to Repository

```bash
# Ensure you're on the correct branch
git checkout main

# Pull latest changes
git pull origin main

# Verify Phase 2 files exist
ls -la lib/frost/frost-session-manager.ts
ls -la tests/frost-session-manager.test.ts

# Commit if not already committed
git add lib/frost/frost-session-manager.ts
git add tests/frost-session-manager.test.ts
git commit -m "feat: Add FROST Session Manager (Phase 2)"
git push origin main
```

### Step 2.2: Verify Netlify Build

1. Open Netlify Dashboard
2. Navigate to Deploys
3. Wait for build to complete
4. Check build logs for errors
5. Verify deployment succeeded

### Step 2.3: Test FROST Session Manager

**Test in Production Console:**

```javascript
// Import FROST Session Manager
import { FrostSessionManager } from '/lib/frost/frost-session-manager.ts';

// Create test session
const result = await FrostSessionManager.createSession({
  familyId: 'test-family',
  messageHash: 'test-hash-' + Date.now(),
  participants: ['guardian1', 'guardian2', 'guardian3'],
  threshold: 2,
  createdBy: 'test-user'
});

console.log('Session created:', result);

// Verify session exists in database
// (Check Supabase Dashboard → Table Editor → frost_signing_sessions)
```

**✅ Phase 2 Complete** when session manager is deployed and functional.

---

## Phase 3: Unified Service Deployment

### Step 3.1: Deploy Unified Service

```bash
# Verify Phase 3 files exist
ls -la lib/federated-signing/unified-service.ts
ls -la tests/unified-federated-signing.test.ts

# Commit if not already committed
git add lib/federated-signing/unified-service.ts
git add tests/unified-federated-signing.test.ts
git commit -m "feat: Add Unified Federated Signing Service (Phase 3)"
git push origin main
```

### Step 3.2: Verify Netlify Build

1. Open Netlify Dashboard
2. Navigate to Deploys
3. Wait for build to complete
4. Check build logs for errors
5. Verify deployment succeeded

### Step 3.3: Test Unified Service

**Test Method Selection:**

```javascript
// Import Unified Service
import { UnifiedFederatedSigningService } from '/lib/federated-signing/unified-service.ts';

// Get singleton instance
const service = UnifiedFederatedSigningService.getInstance();

// Test method selection
console.log('Daily operations:', service.selectSigningMethod('daily_operations')); // Should be 'frost'
console.log('Emergency recovery:', service.selectSigningMethod('emergency_recovery')); // Should be 'sss'

// Test FROST request creation
const frostResult = await service.createSigningRequest({
  familyId: 'test-family',
  messageHash: 'test-hash-' + Date.now(),
  participants: ['guardian1', 'guardian2'],
  threshold: 2,
  createdBy: 'test-user',
  useCase: 'daily_operations'
});

console.log('FROST request:', frostResult);
// Should return: { success: true, method: 'frost', sessionId: '...', status: 'pending' }
```

**✅ Phase 3 Complete** when unified service is deployed and functional.

---

## Verification Steps

### Post-Deployment Verification Checklist

- [ ] **Database Schema**
  - [ ] Tables exist and are accessible
  - [ ] Indexes are created
  - [ ] RLS policies are active
  - [ ] Helper functions work correctly

- [ ] **FROST Session Manager**
  - [ ] Can create sessions
  - [ ] Can submit nonce commitments
  - [ ] Can submit partial signatures
  - [ ] Can aggregate signatures
  - [ ] Nonce reuse prevention works

- [ ] **Unified Service**
  - [ ] Method selection works correctly
  - [ ] FROST integration works
  - [ ] SSS integration works
  - [ ] Session status retrieval works
  - [ ] Cleanup functions work

### Monitoring

**Key Metrics to Monitor:**

1. **Session Creation Rate**
   ```sql
   SELECT COUNT(*) as total_sessions,
          status,
          DATE_TRUNC('hour', to_timestamp(created_at/1000)) as hour
   FROM frost_signing_sessions
   WHERE created_at > extract(epoch from now() - interval '24 hours')::bigint * 1000
   GROUP BY status, hour
   ORDER BY hour DESC;
   ```

2. **Session Success Rate**
   ```sql
   SELECT 
     COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*) as success_rate,
     COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
     COUNT(*) FILTER (WHERE status = 'expired') as expired_count
   FROM frost_signing_sessions
   WHERE created_at > extract(epoch from now() - interval '24 hours')::bigint * 1000;
   ```

3. **Nonce Reuse Attempts** (should be 0)
   ```sql
   SELECT COUNT(*) as nonce_reuse_attempts
   FROM frost_nonce_commitments
   WHERE nonce_used = true;
   ```

---

## Rollback Procedures

### If Issues Occur During Deployment

**Phase 1 Rollback (Database Schema):**

```sql
-- Drop tables (CASCADE will remove dependent objects)
DROP TABLE IF EXISTS frost_nonce_commitments CASCADE;
DROP TABLE IF EXISTS frost_signing_sessions CASCADE;

-- Drop helper functions
DROP FUNCTION IF EXISTS expire_old_frost_signing_sessions();
DROP FUNCTION IF EXISTS cleanup_old_frost_signing_sessions(INTEGER);
DROP FUNCTION IF EXISTS mark_nonce_as_used(TEXT);

-- Restore from backup
-- (Use Supabase Dashboard → Settings → Database → Backups → Restore)
```

**Phase 2/3 Rollback (Code):**

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or rollback to specific commit
git reset --hard <previous-commit-hash>
git push origin main --force

# Netlify will auto-deploy the reverted code
```

---

## Troubleshooting

### Common Issues

**Issue 1: Migration fails with "table already exists"**

**Solution:** Migration is idempotent. Run it again - it will skip existing objects.

**Issue 2: RLS policies blocking access**

**Solution:** Verify user has correct `family_id` in session context:

```sql
SELECT current_setting('request.jwt.claims', true)::json->>'family_id';
```

**Issue 3: Nonce reuse errors**

**Solution:** This is expected behavior (security feature). Each nonce can only be used once.

**Issue 4: Session expiration too fast**

**Solution:** Adjust `expirationSeconds` parameter when creating sessions (default: 300 seconds).

---

## Environment Variables

**No new environment variables required** for this deployment.

All configuration uses existing Supabase credentials:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review test results in `tests/` directory
3. Check Supabase logs for database errors
4. Check Netlify logs for deployment errors

---

**Deployment Complete!** 🎉

All three phases are now deployed and operational.

