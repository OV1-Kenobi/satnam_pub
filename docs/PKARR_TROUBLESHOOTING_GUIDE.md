# PKARR Troubleshooting Guide
**Phase 2B-1: Common Issues and Solutions**

## Table of Contents

1. [Verification Issues](#verification-issues)
2. [Publishing Issues](#publishing-issues)
3. [Republishing Issues](#republishing-issues)
4. [Performance Issues](#performance-issues)
5. [Error Handling Issues](#error-handling-issues)
6. [Database Issues](#database-issues)
7. [Admin Dashboard Issues](#admin-dashboard-issues)
8. [Feature Flag Issues](#feature-flag-issues)
9. [Network Issues](#network-issues)
10. [Debugging Tools](#debugging-tools)

---

## Verification Issues

### Issue: Contact verification always fails

**Symptoms:**
- All PKARR verification attempts return `verified: false`
- Error message: "PKARR verification failed"

**Possible Causes:**
1. PKARR relays are unavailable
2. Public key format is invalid
3. NIP-05 identifier format is incorrect
4. Network timeout (>3000ms)

**Solutions:**

1. **Check relay availability:**
   ```bash
   curl -X POST https://pkarr.relay.pubky.tech/publish
   curl -X POST https://pkarr.relay.synonym.to/publish
   ```

2. **Validate public key format:**
   - Must be 64-character hex string
   - Must be valid Ed25519 public key
   - Example: `a1b2c3d4e5f6...` (64 chars)

3. **Validate NIP-05 identifier:**
   - Format: `username@domain.com`
   - Username: alphanumeric + underscore/hyphen
   - Domain: valid DNS domain

4. **Check timeout settings:**
   ```typescript
   // In verify-contact-pkarr.ts
   const PKARR_TIMEOUT_MS = 3000; // Increase if needed
   ```

---

### Issue: Batch verification partially fails

**Symptoms:**
- Some contacts verify successfully, others fail
- Inconsistent results across batches

**Possible Causes:**
1. Rate limiting (>10 batch requests/hour)
2. Some contacts have invalid data
3. Network instability

**Solutions:**

1. **Check rate limiting:**
   ```sql
   -- Query rate limit status
   SELECT * FROM rate_limit_log 
   WHERE endpoint = 'verify-contacts-batch' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

2. **Validate all contacts before batch:**
   ```typescript
   const validContacts = contacts.filter(c => 
     c.npub && c.nip05 && 
     c.npub.length === 64 && 
     c.nip05.includes('@')
   );
   ```

3. **Reduce batch size:**
   ```typescript
   // Split into smaller batches
   const BATCH_SIZE = 25; // Instead of 50
   ```

---

### Issue: Verification cache not working

**Symptoms:**
- Same contact verified multiple times
- No performance improvement from caching

**Possible Causes:**
1. Cache TTL expired (>5 minutes)
2. Cache disabled via feature flag
3. Cache key mismatch

**Solutions:**

1. **Check cache status:**
   ```sql
   SELECT * FROM pkarr_resolution_cache 
   WHERE nip05 = 'user@satnam.pub' 
   ORDER BY cached_at DESC 
   LIMIT 1;
   ```

2. **Verify feature flag:**
   ```bash
   # In .env
   VITE_PKARR_CACHE_ENABLED=true
   ```

3. **Check cache TTL:**
   ```typescript
   // In verify-contact-pkarr.ts
   const CACHE_TTL_MS = 300000; // 5 minutes
   ```

---

## Publishing Issues

### Issue: PKARR publishing fails

**Symptoms:**
- Error: "Failed to publish to DHT"
- No records in `pkarr_publish_history`

**Possible Causes:**
1. Invalid signature
2. Relay unavailable
3. Sequence number incorrect
4. Timeout (>5000ms)

**Solutions:**

1. **Verify signature:**
   ```typescript
   // Ensure nsec is valid Ed25519 private key
   const isValid = await verifySignature(publicKey, signature, message);
   ```

2. **Check relay status:**
   ```bash
   # Test relay connectivity
   curl -X POST https://pkarr.relay.pubky.tech/publish \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

3. **Verify sequence number:**
   ```sql
   -- Get current sequence for public key
   SELECT sequence FROM pkarr_records 
   WHERE public_key = 'your_public_key_here';
   ```

4. **Increase timeout:**
   ```typescript
   // In scheduled-pkarr-republish.ts
   const DHT_PUBLISH_TIMEOUT_MS = 10000; // Increase to 10s
   ```

---

### Issue: Publishing succeeds but verification fails

**Symptoms:**
- `pkarr_publish_history` shows successful publish
- Verification still returns `verified: false`

**Possible Causes:**
1. DHT propagation delay (can take 1-2 minutes)
2. DNS TXT records not updated
3. Cache serving stale data

**Solutions:**

1. **Wait for DHT propagation:**
   ```typescript
   // Wait 2 minutes after publishing before verifying
   await new Promise(resolve => setTimeout(resolve, 120000));
   ```

2. **Clear cache:**
   ```sql
   DELETE FROM pkarr_resolution_cache 
   WHERE nip05 = 'user@satnam.pub';
   ```

3. **Force re-verification:**
   ```typescript
   // Add cache-busting parameter
   const result = await verifyContact(nip05, { bypassCache: true });
   ```

---

## Republishing Issues

### Issue: Scheduled republishing not running

**Symptoms:**
- No new entries in `pkarr_publish_history`
- Stale records not being republished

**Possible Causes:**
1. Cron schedule misconfigured
2. Function timeout (>60 seconds)
3. Database connection issues

**Solutions:**

1. **Verify cron schedule:**
   ```toml
   # In netlify.toml
   [functions."scheduled-pkarr-republish"]
     schedule = "0 */6 * * *"  # Every 6 hours
   ```

2. **Check function logs:**
   ```bash
   # In Netlify dashboard
   Functions → scheduled-pkarr-republish → Logs
   ```

3. **Test function manually:**
   ```bash
   # Trigger function via Netlify CLI
   netlify functions:invoke scheduled-pkarr-republish
   ```

---

### Issue: Stale records not detected

**Symptoms:**
- Records >18 hours old not being republished
- `find_stale_pkarr_records()` returns empty

**Possible Causes:**
1. Threshold too high
2. No verified records in database
3. Index not being used

**Solutions:**

1. **Check stale threshold:**
   ```typescript
   // In scheduled-pkarr-republish.ts
   const STALE_THRESHOLD_HOURS = 18; // Reduce if needed
   ```

2. **Query stale records manually:**
   ```sql
   SELECT * FROM find_stale_pkarr_records(50, 18);
   ```

3. **Verify index usage:**
   ```sql
   EXPLAIN ANALYZE 
   SELECT * FROM find_stale_pkarr_records(50, 18);
   ```

---

## Performance Issues

### Issue: Verification is slow (>5 seconds)

**Symptoms:**
- Verification takes longer than expected
- Timeout errors

**Possible Causes:**
1. Network latency to PKARR relays
2. Database query performance
3. Cache not being used

**Solutions:**

1. **Enable query result caching:**
   ```bash
   # In .env
   VITE_PKARR_CACHE_ENABLED=true
   ```

2. **Check database indexes:**
   ```sql
   -- Verify indexes exist
   SELECT indexname FROM pg_indexes 
   WHERE tablename = 'pkarr_records';
   ```

3. **Monitor relay response times:**
   ```typescript
   // Add timing logs
   const startTime = Date.now();
   const result = await publishToDHT(record);
   console.log(`Publish time: ${Date.now() - startTime}ms`);
   ```

---

### Issue: High database load

**Symptoms:**
- Slow query performance
- Database connection errors

**Possible Causes:**
1. Missing indexes
2. Too many concurrent requests
3. Inefficient queries

**Solutions:**

1. **Run migration 038 (performance indexes):**
   ```bash
   # Execute in Supabase SQL editor
   database/migrations/038_pkarr_performance_indexes.sql
   ```

2. **Check query performance:**
   ```sql
   -- Analyze slow queries
   SELECT query, mean_exec_time, calls 
   FROM pg_stat_statements 
   WHERE query LIKE '%pkarr%' 
   ORDER BY mean_exec_time DESC 
   LIMIT 10;
   ```

3. **Reduce batch size:**
   ```typescript
   const MAX_RECORDS_PER_BATCH = 25; // Reduce from 50
   ```

---

## Error Handling Issues

### Issue: Circuit breaker stuck in OPEN state

**Symptoms:**
- All requests fail with "Circuit breaker is OPEN"
- No automatic recovery

**Possible Causes:**
1. Failure threshold too low
2. Timeout too long
3. Underlying issue not resolved

**Solutions:**

1. **Check circuit breaker state:**
   ```sql
   SELECT * FROM pkarr_error_metrics 
   WHERE error_code = 'CIRCUIT_BREAKER_OPEN' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

2. **Manually reset circuit breaker (Admin only):**
   ```bash
   # Via admin dashboard or API
   POST /api/pkarr-admin
   {
     "action": "reset_circuit_breaker"
   }
   ```

3. **Adjust circuit breaker settings:**
   ```typescript
   // In pkarr-error-handler.ts
   const FAILURE_THRESHOLD = 10; // Increase from 5
   const TIMEOUT_MS = 60000; // Increase from 30000
   ```

---

### Issue: Retry logic not working

**Symptoms:**
- Requests fail immediately without retries
- No exponential backoff

**Possible Causes:**
1. Error classified as permanent (non-retryable)
2. Max retries exceeded
3. Retry logic disabled

**Solutions:**

1. **Check error classification:**
   ```typescript
   // In pkarr-error-handler.ts
   const errorCode = classifyError(error);
   console.log(`Error code: ${errorCode}`);
   ```

2. **Verify retry configuration:**
   ```typescript
   const MAX_RETRY_ATTEMPTS = 3;
   const BASE_DELAY_MS = 1000;
   const MAX_DELAY_MS = 8000;
   ```

3. **Check error logs:**
   ```sql
   SELECT * FROM pkarr_error_metrics 
   ORDER BY created_at DESC 
   LIMIT 20;
   ```

---

## Database Issues

### Issue: Migration 039 fails

**Symptoms:**
- Error: "column already exists"
- Migration script fails partway through

**Possible Causes:**
1. Migration already partially executed
2. Column name conflicts
3. Missing dependencies (Migration 029)

**Solutions:**

1. **Check if columns exist:**
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'pkarr_records' 
   AND column_name IN ('last_republish_attempt', 'republish_count');
   ```

2. **Run migration 029 first:**
   ```bash
   # Execute in order
   1. database/migrations/029_pkarr_records_integration.sql
   2. database/migrations/037_pkarr_analytics_views.sql
   3. database/migrations/038_pkarr_performance_indexes.sql
   4. database/migrations/039_pkarr_republishing_tracking.sql
   ```

3. **Use idempotent migration:**
   ```sql
   -- Migration 039 uses IF NOT EXISTS checks
   ALTER TABLE pkarr_records 
   ADD COLUMN IF NOT EXISTS last_republish_attempt BIGINT;
   ```

---

## Admin Dashboard Issues

### Issue: Admin dashboard not accessible

**Symptoms:**
- 403 Forbidden error
- "Insufficient permissions" message

**Possible Causes:**
1. User role is not guardian/admin
2. Feature flag disabled
3. Authentication issue

**Solutions:**

1. **Verify user role:**
   ```sql
   SELECT role FROM user_identities 
   WHERE user_duid = 'your_duid_here';
   ```

2. **Enable admin features:**
   ```bash
   # In .env
   VITE_PKARR_ADMIN_ENABLED=true
   ```

3. **Check authentication:**
   ```typescript
   // Ensure valid session token
   const session = await SecureSessionManager.validateSession(req);
   ```

---

## Feature Flag Issues

### Issue: Feature flags not working

**Symptoms:**
- PKARR features not available
- UI components not rendering

**Possible Causes:**
1. Environment variables not set
2. Vite not restarted after env changes
3. Feature flag typo

**Solutions:**

1. **Verify all PKARR feature flags:**
   ```bash
   # In .env
   VITE_PKARR_ENABLED=true
   VITE_PKARR_AUTO_VERIFY_ON_ADD=true
   VITE_PKARR_ADMIN_ENABLED=true
   VITE_PKARR_CACHE_ENABLED=true
   VITE_PKARR_CIRCUIT_BREAKER_ENABLED=true
   ```

2. **Restart Vite dev server:**
   ```bash
   npm run dev
   ```

3. **Check feature flag usage:**
   ```typescript
   import { clientConfig } from '@/config/env.client';
   const isPkarrEnabled = clientConfig.VITE_PKARR_ENABLED;
   ```

---

## Network Issues

### Issue: PKARR relays unreachable

**Symptoms:**
- All relay requests timeout
- Error: "Network timeout"

**Possible Causes:**
1. Firewall blocking DHT traffic
2. Relay servers down
3. DNS resolution issues

**Solutions:**

1. **Test relay connectivity:**
   ```bash
   ping pkarr.relay.pubky.tech
   ping pkarr.relay.synonym.to
   ```

2. **Check firewall rules:**
   ```bash
   # Allow HTTPS traffic to PKARR relays
   # Port 443 must be open
   ```

3. **Use alternative relays:**
   ```typescript
   // Add backup relays
   const PKARR_RELAYS = [
     'https://pkarr.relay.pubky.tech',
     'https://pkarr.relay.synonym.to',
     'https://your-backup-relay.com'
   ];
   ```

---

## Debugging Tools

### SQL Queries for Debugging

**Check verification status:**
```sql
SELECT 
  nip05,
  verified,
  verification_method,
  last_verified_at,
  error_message
FROM pkarr_records
ORDER BY last_verified_at DESC
LIMIT 20;
```

**Check republishing metrics:**
```sql
SELECT * FROM get_pkarr_republish_stats();
```

**Check error distribution:**
```sql
SELECT 
  error_code,
  COUNT(*) as count,
  MAX(created_at) as last_occurrence
FROM pkarr_error_metrics
GROUP BY error_code
ORDER BY count DESC;
```

**Check analytics:**
```sql
SELECT * FROM pkarr_verification_summary;
SELECT * FROM pkarr_publish_summary;
SELECT * FROM pkarr_relay_performance;
SELECT * FROM pkarr_error_summary;
```

### Logging

**Enable debug logging:**
```typescript
// In verify-contact-pkarr.ts
const DEBUG = true;
if (DEBUG) {
  console.log('[PKARR] Verification attempt:', { nip05, npub });
}
```

**Check Netlify function logs:**
```bash
# Via Netlify CLI
netlify functions:log scheduled-pkarr-republish
```

---

## Getting Help

If you're still experiencing issues after trying these solutions:

1. **Check the documentation:**
   - [PKARR Deployment Checklist](PKARR_DEPLOYMENT_CHECKLIST.md)
   - [PKARR API Documentation](PKARR_API_DOCUMENTATION.md)
   - [PKARR Error Handling](PKARR_ERROR_HANDLING.md)

2. **Review test files:**
   - `tests/pkarr-verification.test.ts`
   - `tests/pkarr-error-handling.test.ts`
   - `tests/pkarr-e2e-integration.test.ts`

3. **Contact support:**
   - GitHub Issues: Report bugs and request features
   - Email: support@satnam.pub
   - Nostr: admin@my.satnam.pub

---

**Last Updated**: October 2025  
**Version**: 1.0.0  
**Phase**: 2B-1 Day 7 Complete

