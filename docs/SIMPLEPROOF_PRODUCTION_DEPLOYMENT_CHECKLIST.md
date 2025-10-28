# SimpleProof Production Deployment Checklist - Phase 2B-2 Day 16

**System:** SimpleProof Blockchain Attestation  
**Version:** Phase 2B-2 (Day 16 - Security Hardened)  
**Target Environment:** Production (Netlify + Supabase)  
**Deployment Date:** TBD

---

## Pre-Deployment Checklist

### 1. Environment Variables Configuration

#### Required Netlify Environment Variables

**SimpleProof API Configuration:**
- [ ] `VITE_SIMPLEPROOF_ENABLED=true` - Enable SimpleProof functionality
- [ ] `VITE_SIMPLEPROOF_API_KEY=<your-api-key>` - SimpleProof API authentication key
- [ ] `VITE_SIMPLEPROOF_API_URL=https://api.simpleproof.com` - SimpleProof API endpoint

**Supabase Configuration:**
- [ ] `VITE_SUPABASE_URL=<your-supabase-url>` - Supabase project URL
- [ ] `VITE_SUPABASE_ANON_KEY=<your-anon-key>` - Supabase anonymous key (public)
- [ ] `SUPABASE_SERVICE_ROLE_KEY=<your-service-key>` - Supabase service role key (server-only)

**Sentry Error Tracking:**
- [ ] `VITE_SENTRY_ENABLED=true` - Enable Sentry error tracking
- [ ] `VITE_SENTRY_DSN=<your-sentry-dsn>` - Sentry Data Source Name
- [ ] `VITE_SENTRY_ORG=satnam-pub` - Sentry organization name
- [ ] `VITE_SENTRY_PROJECT=satnam-pub` - Sentry project name
- [ ] `SENTRY_AUTH_TOKEN=<your-auth-token>` - Sentry authentication token for source map upload

**Application Configuration:**
- [ ] `NODE_ENV=production` - Set production environment
- [ ] `FRONTEND_URL=https://www.satnam.pub` - Primary frontend URL for CORS
- [ ] `VITE_LOG_LEVEL=info` - Set logging level (debug/info/warn/error)

#### Optional Environment Variables

- [ ] `VITE_SIMPLEPROOF_FEE_WARNINGS_ENABLED=true` - Enable fee warning modals (default: true)

---

### 2. Database Configuration

#### Supabase Migrations

**Required Migrations (in order):**
1. [ ] `034_simpleproof_timestamps.sql` - Create simpleproof_timestamps table with RLS policies
2. [ ] `040_pkarr_simpleproof_integration.sql` - Add SimpleProof integration to PKARR records

**Verification Queries:**
```sql
-- Verify simpleproof_timestamps table exists
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'simpleproof_timestamps';

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'simpleproof_timestamps';

-- Verify RLS policies exist
SELECT policyname, cmd, roles 
FROM pg_policies 
WHERE tablename = 'simpleproof_timestamps';
```

**Expected RLS Policies:**
- [ ] `service_role_insert_timestamps` - Service role can insert
- [ ] `users_view_own_timestamps` - Users can view their own
- [ ] `service_role_update_timestamps` - Service role can update

#### Database Permissions

- [ ] `authenticated` role has SELECT permission on `simpleproof_timestamps`
- [ ] `service_role` has INSERT, UPDATE permission on `simpleproof_timestamps`
- [ ] `anon` role has NO direct access to `simpleproof_timestamps`

---

### 3. Netlify Functions Configuration

#### Function Settings (netlify.toml)

**simpleproof-timestamp:**
- [ ] Memory: 256MB
- [ ] Timeout: 30 seconds
- [ ] Included files: `utils/env.ts`, `utils/rate-limiter.js`, `utils/logging.js`, `utils/sentry.server.js`

**simpleproof-verify:**
- [ ] Memory: 128MB
- [ ] Timeout: 15 seconds
- [ ] Included files: `utils/env.ts`, `utils/rate-limiter.js`, `utils/logging.js`, `utils/sentry.server.js`

#### Function Endpoints

- [ ] `/.netlify/functions/simpleproof-timestamp` - Accessible via POST
- [ ] `/.netlify/functions/simpleproof-verify` - Accessible via POST

---

### 4. Security Configuration

#### CORS Settings

**Allowed Origins (Production):**
- [ ] `https://www.satnam.pub` (primary)
- [ ] `https://satnam.pub` (alternate)
- [ ] `https://app.satnam.pub` (app subdomain)

**Security Headers Verified:**
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `X-XSS-Protection: 1; mode=block`
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- [ ] `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`

#### Rate Limiting

**Timestamp Creation:**
- [ ] Limit: 10 requests per hour per IP
- [ ] Window: 3600000ms (1 hour)
- [ ] Response: 429 Too Many Requests

**Verification:**
- [ ] Limit: 100 requests per hour per IP
- [ ] Window: 3600000ms (1 hour)
- [ ] Response: 429 Too Many Requests

#### Input Validation

- [ ] `data` field: Max 10,000 characters (10KB)
- [ ] `ots_proof` field: Max 100,000 characters (100KB)
- [ ] `verification_id`: Valid UUID format required

---

### 5. Build & Test Verification

#### Local Build Test

```bash
# Run production build
npm run build

# Verify build output
ls -lh dist/

# Check for TypeScript errors
npm run type-check

# Run test suite
npm test -- --run tests/services/simpleProofService.test.ts tests/components/SimpleProofTimestampButton.test.tsx
```

**Expected Results:**
- [ ] Build completes without errors
- [ ] Zero TypeScript errors
- [ ] All 29 SimpleProof tests passing (100% pass rate)
- [ ] Source maps generated in `dist/` directory

#### Netlify Dev Server Test

```bash
# Start Netlify dev server
netlify dev

# Test endpoints
curl -X POST http://localhost:8888/.netlify/functions/simpleproof-timestamp \
  -H "Content-Type: application/json" \
  -d '{"data":"test","verification_id":"123e4567-e89b-12d3-a456-426614174000"}'

curl -X POST http://localhost:8888/.netlify/functions/simpleproof-verify \
  -H "Content-Type: application/json" \
  -d '{"ots_proof":"test-proof-data"}'
```

**Expected Results:**
- [ ] Functions load without errors
- [ ] Endpoints respond with proper CORS headers
- [ ] Rate limiting works correctly
- [ ] Input validation rejects invalid requests

---

### 6. Monitoring & Alerting Setup

#### Sentry Configuration

**Error Tracking:**
- [ ] Client-side errors captured and sent to Sentry
- [ ] Server-side (Netlify Functions) errors captured
- [ ] Source maps uploaded for readable stack traces
- [ ] Privacy-first sanitization active (no PII in error reports)

**Performance Monitoring:**
- [ ] Transaction tracking enabled
- [ ] Sample rate: 10% in production (0.1)
- [ ] Breadcrumbs capture user actions leading to errors

#### Logging Configuration

**Structured Logging:**
- [ ] Log level set to `info` in production
- [ ] Logs include context: component, action, userId, verificationId
- [ ] Error-level logs automatically sent to Sentry
- [ ] Rate limit events logged with metadata

**Log Retention:**
- [ ] Netlify Functions logs: 7 days (Netlify default)
- [ ] Sentry events: 90 days (Sentry default)

---

### 7. Feature Flags

**Production Feature Flags:**
- [ ] `VITE_SIMPLEPROOF_ENABLED=true` - Enable SimpleProof system
- [ ] `VITE_SENTRY_ENABLED=true` - Enable error tracking
- [ ] `VITE_SIMPLEPROOF_FEE_WARNINGS_ENABLED=true` - Enable fee warnings

**Rollback Flags (if needed):**
- [ ] Set `VITE_SIMPLEPROOF_ENABLED=false` to disable system without code changes

---

## Deployment Steps

### Step 1: Pre-Deployment Verification

1. [ ] All environment variables configured in Netlify dashboard
2. [ ] Database migrations applied in Supabase SQL editor
3. [ ] RLS policies verified and active
4. [ ] Local build and tests passing
5. [ ] Netlify dev server tested successfully

### Step 2: Deploy to Production

```bash
# Commit all changes
git add .
git commit -m "Phase 2B-2 Day 16: Security hardening and production deployment prep"

# Push to main branch (triggers Netlify deployment)
git push origin main
```

### Step 3: Post-Deployment Verification

**Immediate Checks (within 5 minutes):**
1. [ ] Netlify build completes successfully
2. [ ] No build errors in Netlify dashboard
3. [ ] Functions deployed and accessible
4. [ ] Frontend loads without errors

**Functional Tests (within 15 minutes):**
1. [ ] Create timestamp via UI - verify success
2. [ ] Verify timestamp via UI - verify success
3. [ ] Check Sentry dashboard for errors
4. [ ] Verify rate limiting works (test with 11 requests)
5. [ ] Test CORS from production domain

**Monitoring Checks (within 1 hour):**
1. [ ] Check Netlify Functions logs for errors
2. [ ] Check Sentry for any error spikes
3. [ ] Verify database RLS policies working (no unauthorized access)
4. [ ] Monitor API response times

---

## Rollback Procedure

### Emergency Rollback (if critical issues found)

**Option 1: Feature Flag Rollback (Fastest - 2 minutes)**
```bash
# In Netlify dashboard, set:
VITE_SIMPLEPROOF_ENABLED=false

# Trigger rebuild
netlify deploy --prod
```

**Option 2: Git Rollback (5 minutes)**
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Netlify will auto-deploy previous version
```

**Option 3: Netlify Dashboard Rollback (1 minute)**
1. Go to Netlify dashboard → Deploys
2. Find previous successful deploy
3. Click "Publish deploy"

### Post-Rollback Actions

1. [ ] Verify system is stable
2. [ ] Investigate root cause of issues
3. [ ] Fix issues in development environment
4. [ ] Re-test thoroughly before re-deployment
5. [ ] Document incident in post-mortem

---

## Production Monitoring Checklist

### Daily Monitoring (First Week)

- [ ] Check Sentry dashboard for new errors
- [ ] Review Netlify Functions logs
- [ ] Monitor rate limiting violations
- [ ] Check database performance metrics
- [ ] Verify no RLS policy violations

### Weekly Monitoring (Ongoing)

- [ ] Review Sentry error trends
- [ ] Analyze rate limiting patterns
- [ ] Check API response time trends
- [ ] Review database query performance
- [ ] Verify source maps uploading correctly

---

## Troubleshooting Guide

### Common Issues & Solutions

**Issue: "SimpleProof API key not configured"**
- **Cause:** Missing `VITE_SIMPLEPROOF_API_KEY` environment variable
- **Solution:** Add variable in Netlify dashboard and redeploy

**Issue: "Rate limit exceeded"**
- **Cause:** User exceeded 10 requests/hour for timestamp creation
- **Solution:** Expected behavior - user should wait or contact support

**Issue: "CORS error from production domain"**
- **Cause:** Origin not in whitelist
- **Solution:** Verify origin is `https://www.satnam.pub` or add to whitelist

**Issue: "Database error: permission denied"**
- **Cause:** RLS policy blocking access
- **Solution:** Verify user is authenticated and owns the verification_id

**Issue: "Sentry errors not appearing"**
- **Cause:** `VITE_SENTRY_ENABLED=false` or invalid DSN
- **Solution:** Verify Sentry configuration and redeploy

---

## Success Criteria

**Deployment is successful when:**
- ✅ All environment variables configured
- ✅ Database migrations applied
- ✅ Netlify build completes without errors
- ✅ All functions accessible and responding
- ✅ CORS working from production domain
- ✅ Rate limiting active and working
- ✅ Sentry capturing errors
- ✅ No critical errors in first 24 hours
- ✅ All tests passing (29/29)
- ✅ Zero TypeScript errors

---

## Sign-Off

**Prepared by:** Augment Agent  
**Date:** 2025-10-26  
**Status:** ✅ READY FOR PRODUCTION DEPLOYMENT

**Deployment Approval:**
- [ ] Technical Lead: _________________ Date: _______
- [ ] Security Review: _________________ Date: _______
- [ ] Product Owner: _________________ Date: _______

