# Phase 1 Week 3 - Quick Reference Guide

## What Was Implemented

### 1. Hybrid Verification Integration in NIP05PasswordAuth
```typescript
// Hybrid verification now runs before password authentication
const verificationPassed = await performHybridVerification(nip05.trim());

if (!verificationPassed && hybridEnabled) {
  // Verification failed - show error
  setError('Identity verification failed...');
  return;
}

// Continue with password authentication
const success = await auth.authenticateNIP05Password(nip05, password);
```

### 2. Verification Status Display
```typescript
<VerificationStatusDisplay
  status={verificationStatus}
  showDetails={true}
  compact={false}
/>
```

### 3. Verification Method Selector
```typescript
<VerificationMethodSelector
  selectedMethod={selectedVerificationMethod}
  onMethodChange={setSelectedVerificationMethod}
  enabledMethods={["auto", "kind:0", "pkarr", "dns"]}
  disabled={isLoading || isVerifying}
/>
```

---

## API Endpoints

### Health Check
```bash
GET /api/verification/health

Response:
{
  "status": "healthy|degraded|unhealthy",
  "kind0_relay_health": "healthy|degraded|unhealthy",
  "pkarr_dht_health": "healthy|degraded|unhealthy",
  "dns_resolution_health": "healthy|degraded|unhealthy",
  "average_resolution_time_ms": 1234,
  "failure_rate_24h": 2.5,
  "timestamp": 1729267200
}
```

### Log Verification Failure
```bash
POST /api/verification/log-failure

Request:
{
  "failureType": "kind0_timeout",
  "identifierHash": "sha256_hex_hash",
  "verificationMethod": "kind:0",
  "errorMessage": "Timeout after 3000ms",
  "responseTimeMs": 3000,
  "userDuid": "optional_user_duid"
}

Response:
{
  "success": true,
  "failureId": "uuid"
}
```

---

## Database Tables

### verification_failures
Tracks all verification failures for monitoring and analysis.

```sql
SELECT * FROM verification_failures
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

### verification_method_stats
Aggregated statistics by verification method.

```sql
SELECT * FROM verification_method_stats
WHERE period_end > NOW() - INTERVAL '24 hours'
ORDER BY period_end DESC;
```

### verification_health_checks
Health check results from monitoring endpoint.

```sql
SELECT * FROM verification_health_checks
WHERE checked_at > NOW() - INTERVAL '1 hour'
ORDER BY checked_at DESC;
```

---

## Feature Flags

### Enable Hybrid Verification
```bash
VITE_HYBRID_IDENTITY_ENABLED=true
```

### Enable PKARR Method
```bash
VITE_PKARR_ENABLED=true
```

---

## Configuration

### Hybrid Verifier Timeouts
```typescript
const verifier = new HybridNIP05Verifier({
  kind0Timeout: 3000,      // 3 seconds
  pkarrTimeout: 3000,      // 3 seconds
  default_timeout_ms: 5000, // 5 seconds for DNS
  cache_duration_ms: 300000, // 5 minutes cache
});
```

---

## Monitoring

### Check Service Health
```bash
curl https://your-domain.com/api/verification/health
```

### View Recent Failures
```sql
SELECT 
  failure_type,
  COUNT(*) as count,
  AVG(response_time_ms) as avg_response_time
FROM verification_failures
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY failure_type
ORDER BY count DESC;
```

### Calculate Failure Rate
```sql
SELECT 
  COUNT(*) as total_failures,
  COUNT(*) * 100.0 / 1000 as failure_rate_percent
FROM verification_failures
WHERE timestamp > NOW() - INTERVAL '24 hours';
```

---

## Troubleshooting

### Verification Always Fails
1. Check feature flag is enabled: `VITE_HYBRID_IDENTITY_ENABLED=true`
2. Check relay connectivity: `GET /api/verification/health`
3. Verify identifier format: `user@domain.com`
4. Check database migration was applied

### Slow Verification
1. Check response times: `GET /api/verification/health`
2. Monitor relay latency
3. Check cache is working
4. Consider increasing timeouts

### High Failure Rate
1. Check health endpoint: `GET /api/verification/health`
2. Review failure logs: `SELECT * FROM verification_failures`
3. Check relay status
4. Verify network connectivity

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/components/auth/NIP05PasswordAuth.tsx` | Signin component with hybrid verification |
| `netlify/functions_active/verification-health-check.ts` | Health check endpoint |
| `netlify/functions_active/log-verification-failure.ts` | Failure logging endpoint |
| `database/migrations/030_verification_failure_tracking.sql` | Database schema |

---

## Integration Checklist

- [ ] Database migration applied
- [ ] Feature flags configured
- [ ] Health check endpoint tested
- [ ] Failure logging working
- [ ] UI components displaying correctly
- [ ] Verification status showing in signin
- [ ] Method selector visible (if enabled)
- [ ] Error messages clear and helpful

---

## Performance Targets

| Metric | Target |
|--------|--------|
| kind:0 response time | < 1000ms |
| PKARR response time | < 2000ms |
| DNS response time | < 3000ms |
| Cache hit response time | < 10ms |
| Failure rate (24h) | < 5% |
| Health check response time | < 5000ms |

---

## Support

For issues or questions:
1. Check `PHASE1_WEEK3_IMPLEMENTATION_SUMMARY.md` for detailed documentation
2. Review health check endpoint for service status
3. Check failure logs for error details
4. Monitor response times for performance issues

