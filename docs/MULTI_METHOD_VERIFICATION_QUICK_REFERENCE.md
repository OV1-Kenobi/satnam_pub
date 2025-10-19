# Multi-Method Verification - Quick Reference

## Enable Multi-Method Verification

```bash
# Set environment variable
VITE_MULTI_METHOD_VERIFICATION_ENABLED=true
```

## Configuration

```typescript
import { HybridNIP05Verifier } from '@/lib/nip05-verification';

const verifier = new HybridNIP05Verifier({
  enableMultiMethodVerification: true,
  requireMinimumTrustLevel: "none", // or "low", "medium", "high"
  kind0Timeout: 3000,
  pkarrTimeout: 3000,
  default_timeout_ms: 5000,
});
```

## Usage

```typescript
// Verify identity with multi-method verification
const result = await verifier.verifyHybrid("alice@satnam.pub");

// Result includes trust score
console.log({
  verified: result.verified,
  trustScore: result.trustScore,      // 0-100
  trustLevel: result.trustLevel,      // "high" | "medium" | "low" | "none"
  methodAgreement: result.methodAgreement, // { kind0, pkarr, dns, agreementCount }
  multiMethodResults: result.multiMethodResults, // Results from each method
});
```

## Trust Score Interpretation

| Score | Level | Meaning |
|-------|-------|---------|
| 100 | HIGH | All 3 methods agree |
| 75 | MEDIUM | 2 methods agree |
| 50 | LOW | 1 method succeeds |
| 25 | LOW | Methods disagree |
| 0 | NONE | All methods fail |

## Database Queries

### Get recent verification results

```sql
SELECT 
  identifier_hash,
  trust_score,
  trust_level,
  agreement_count,
  created_at
FROM multi_method_verification_results
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 100;
```

### Get trust score distribution

```sql
SELECT 
  trust_level,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM multi_method_verification_results
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY trust_level
ORDER BY count DESC;
```

### Find disagreements

```sql
SELECT 
  identifier_hash,
  kind0_verified,
  pkarr_verified,
  dns_verified,
  trust_score,
  created_at
FROM multi_method_verification_results
WHERE methods_agree = false
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Method success rates

```sql
SELECT 
  'kind:0' as method,
  COUNT(*) FILTER (WHERE kind0_verified) as successes,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE kind0_verified) / COUNT(*), 2) as success_rate
FROM multi_method_verification_results
WHERE created_at > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT 'pkarr', COUNT(*) FILTER (WHERE pkarr_verified), COUNT(*), ...
UNION ALL
SELECT 'dns', COUNT(*) FILTER (WHERE dns_verified), COUNT(*), ...;
```

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
  "failure_rate_24h": 2.5
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
  "responseTimeMs": 3000
}

Response:
{
  "success": true,
  "failureId": "uuid"
}
```

## UI Components

### Display Trust Score

```typescript
import { VerificationStatusDisplay } from '@/components/identity/VerificationStatusDisplay';

<VerificationStatusDisplay
  status={verificationResult}
  showDetails={true}
  compact={false}
/>
```

### Method Selector

```typescript
import { VerificationMethodSelector } from '@/components/identity/VerificationMethodSelector';

<VerificationMethodSelector
  selectedMethod={selectedMethod}
  onMethodChange={setSelectedMethod}
  enabledMethods={["auto", "kind:0", "pkarr", "dns"]}
  disabled={isLoading}
/>
```

## Monitoring

### Check service health

```bash
curl https://your-domain.com/api/verification/health
```

### View recent failures

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

### Calculate failure rate

```sql
SELECT 
  COUNT(*) as total_failures,
  COUNT(*) * 100.0 / 1000 as failure_rate_percent
FROM verification_failures
WHERE timestamp > NOW() - INTERVAL '24 hours';
```

## Troubleshooting

### Enable debug logging

```typescript
const verifier = new HybridNIP05Verifier({
  enableMultiMethodVerification: true,
});

// Results will include detailed method information
const result = await verifier.verifyHybrid("alice@satnam.pub");
console.log(result.multiMethodResults);
```

### Check method agreement

```typescript
if (result.methodAgreement?.agreementCount === 3) {
  console.log("All methods agree - highest trust");
} else if (result.methodAgreement?.agreementCount === 2) {
  console.log("Two methods agree - medium trust");
} else if (result.methodAgreement?.agreementCount === 1) {
  console.log("One method only - low trust");
} else {
  console.log("No methods succeeded");
}
```

### Analyze disagreements

```typescript
if (result.multiMethodResults) {
  const disagreements = result.multiMethodResults
    .filter(r => r.verified)
    .map(r => `${r.method}: ${r.nip05}`);
  
  if (new Set(disagreements).size > 1) {
    console.warn("Methods disagree on identity:", disagreements);
  }
}
```

## Performance Targets

| Metric | Target |
|--------|--------|
| kind:0 response time | < 1000ms |
| PKARR response time | < 2000ms |
| DNS response time | < 3000ms |
| Total (parallel) | < 3000ms |
| Cache hit | < 10ms |
| Failure rate (24h) | < 5% |

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/nip05-verification.ts` | HybridNIP05Verifier implementation |
| `src/config/env.client.ts` | Feature flag configuration |
| `database/migrations/031_multi_method_verification_results.sql` | Database schema |
| `src/components/auth/NIP05PasswordAuth.tsx` | Authentication component |
| `src/components/identity/VerificationStatusDisplay.tsx` | Trust score display |

## Support

For issues or questions:
1. Check `MULTI_METHOD_VERIFICATION_GUIDE.md` for detailed documentation
2. Review health check endpoint for service status
3. Check database for verification results
4. Monitor response times for performance issues

