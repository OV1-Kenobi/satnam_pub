# PKARR Error Handling Guide
**Phase 2B-1 Day 4: Enhanced Error Handling & Retry Logic**

## Overview

This document details the error handling architecture implemented for the PKARR verification system in Phase 2B-1 Day 4. The system provides robust error handling with automatic retry for transient failures, circuit breaker pattern to prevent cascading failures, and comprehensive error categorization.

## Error Handling Architecture

### Components

1. **Error Classification** - Categorizes errors as transient or permanent
2. **Exponential Backoff** - Implements retry delays with jitter
3. **Circuit Breaker** - Prevents cascading failures from unhealthy relays
4. **Error Metrics** - Tracks error rates and patterns
5. **Retry Logic** - Automatic retry for transient errors

### Error Flow

```
Request → Circuit Breaker Check → Retry with Backoff → PKARR Verification
                ↓                         ↓                      ↓
         Circuit Open?            Transient Error?        Success/Failure
                ↓                         ↓                      ↓
         Reject Request           Retry (max 3x)          Update DB
                                          ↓
                                  Permanent Error?
                                          ↓
                                   Fail Immediately
```

---

## Error Categories

### Transient Errors (Retryable)

These errors are temporary and may succeed on retry:

| Error Code | Description | Retry Strategy |
|------------|-------------|----------------|
| `NETWORK_TIMEOUT` | Network timeout during verification | Exponential backoff |
| `DHT_UNAVAILABLE` | DHT relay unavailable (ECONNREFUSED) | Exponential backoff |
| `RELAY_TIMEOUT` | Relay response timeout | Exponential backoff |
| `RATE_LIMITED` | Rate limited by DHT relay | Exponential backoff |
| `TEMPORARY_FAILURE` | Unknown temporary failure | Exponential backoff |

**Retry Configuration:**
- **Base Delay:** 1 second
- **Max Delay:** 8 seconds
- **Max Retries:** 3 attempts
- **Jitter:** ±30% of delay

**Example Retry Timeline:**
```
Attempt 1: Immediate
Attempt 2: ~1s delay (1s ± 30%)
Attempt 3: ~2s delay (2s ± 30%)
Attempt 4: ~4s delay (4s ± 30%)
Total: ~7s for 4 attempts
```

---

### Permanent Errors (Non-Retryable)

These errors indicate a fundamental problem that won't be fixed by retrying:

| Error Code | Description | Action |
|------------|-------------|--------|
| `INVALID_PUBLIC_KEY` | Invalid public key format | Fail immediately |
| `INVALID_NIP05` | Invalid NIP-05 identifier | Fail immediately |
| `RECORD_NOT_FOUND` | PKARR record not found | Fail immediately |
| `SIGNATURE_INVALID` | Invalid PKARR signature | Fail immediately |
| `MALFORMED_RESPONSE` | Malformed DHT response | Fail immediately |

**No Retry:** These errors fail immediately without retry attempts.

---

### System Errors

| Error Code | Description | Action |
|------------|-------------|--------|
| `CIRCUIT_BREAKER_OPEN` | Circuit breaker is open | Reject request |
| `MAX_RETRIES_EXCEEDED` | Max retry attempts exceeded | Fail with metadata |
| `UNKNOWN_ERROR` | Unclassified error | Treat as temporary failure |

---

## Circuit Breaker Pattern

### States

```
┌─────────┐  5 failures   ┌──────┐  30s timeout  ┌────────────┐
│ CLOSED  │──────────────→│ OPEN │──────────────→│ HALF_OPEN  │
└─────────┘                └──────┘                └────────────┘
     ↑                        ↑                          │
     │                        │                          │
     │ 2 successes            │ 1 failure                │
     └────────────────────────┴──────────────────────────┘
```

### State Descriptions

#### CLOSED (Normal Operation)
- **Behavior:** All requests allowed
- **Transition:** Opens after 5 consecutive failures
- **Metrics:** Tracks failure count

#### OPEN (Failing)
- **Behavior:** All requests rejected immediately
- **Transition:** Half-opens after 30 seconds
- **Response:** Returns `CIRCUIT_BREAKER_OPEN` error

#### HALF_OPEN (Testing Recovery)
- **Behavior:** Limited requests allowed (testing)
- **Transition:** 
  - Closes after 2 consecutive successes
  - Reopens on any failure
- **Purpose:** Test if service has recovered

### Configuration

```typescript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,    // Open after 5 failures
  successThreshold: 2,    // Close after 2 successes in half-open
  timeoutMs: 30000,       // 30 seconds before half-open
});
```

### Usage Example

```typescript
// Execute with circuit breaker protection
const result = await circuitBreaker.execute(async () => {
  return await performPkarrVerification();
});
```

---

## Exponential Backoff

### Algorithm

```
delay = min(baseDelay * 2^attemptNumber, maxDelay)
jitteredDelay = delay ± (delay * jitterFactor)
```

### Configuration

```typescript
const backoffConfig = {
  baseDelayMs: 1000,      // 1 second base delay
  maxDelayMs: 8000,       // 8 second max delay
  maxRetries: 3,          // Max 3 retry attempts
  jitterFactor: 0.3,      // ±30% jitter
};
```

### Delay Calculation Examples

| Attempt | Base Delay | With Jitter (±30%) |
|---------|------------|-------------------|
| 0 | 1000ms | 700-1300ms |
| 1 | 2000ms | 1400-2600ms |
| 2 | 4000ms | 2800-5200ms |
| 3 | 8000ms (capped) | 5600-10400ms |

### Why Jitter?

Jitter prevents **thundering herd** problem where multiple clients retry simultaneously, overwhelming the service.

---

## Error Metrics

### Tracked Metrics

```typescript
interface ErrorMetrics {
  totalErrors: number;              // Total errors recorded
  transientErrors: number;          // Transient (retryable) errors
  permanentErrors: number;          // Permanent (non-retryable) errors
  retriedErrors: number;            // Errors that were retried
  circuitBreakerTrips: number;      // Circuit breaker open events
  errorsByCode: Map<ErrorCode, number>;  // Errors by error code
}
```

### Usage

```typescript
const metrics = errorMetrics.getMetrics();

console.log(`Total errors: ${metrics.totalErrors}`);
console.log(`Transient: ${metrics.transientErrors}`);
console.log(`Permanent: ${metrics.permanentErrors}`);
console.log(`Retried: ${metrics.retriedErrors}`);
console.log(`Circuit breaker trips: ${metrics.circuitBreakerTrips}`);

// Errors by code
metrics.errorsByCode.forEach((count, code) => {
  console.log(`${code}: ${count}`);
});
```

---

## API Response Format

### Successful Verification

```json
{
  "success": true,
  "verified": true,
  "verification_level": "verified",
  "response_time_ms": 245,
  "cached": false,
  "retried": false
}
```

### Failed Verification (Transient Error)

```json
{
  "success": true,
  "verified": false,
  "verification_level": "unverified",
  "error": "Network timeout during PKARR verification",
  "error_code": "NETWORK_TIMEOUT",
  "response_time_ms": 3150,
  "cached": false,
  "retried": true
}
```

### Failed Verification (Permanent Error)

```json
{
  "success": true,
  "verified": false,
  "verification_level": "unverified",
  "error": "Invalid public key format",
  "error_code": "INVALID_PUBLIC_KEY",
  "response_time_ms": 12,
  "cached": false,
  "retried": false
}
```

### Circuit Breaker Open

```json
{
  "success": true,
  "verified": false,
  "verification_level": "unverified",
  "error": "Circuit breaker is open, request rejected",
  "error_code": "CIRCUIT_BREAKER_OPEN",
  "response_time_ms": 5,
  "cached": false,
  "retried": false
}
```

---

## Error Code Reference

### Quick Reference Table

| Code | Type | Retryable | Typical Cause | Recommended Action |
|------|------|-----------|---------------|-------------------|
| `NETWORK_TIMEOUT` | Transient | ✅ Yes | Slow network | Retry with backoff |
| `DHT_UNAVAILABLE` | Transient | ✅ Yes | DHT relay down | Retry with backoff |
| `RELAY_TIMEOUT` | Transient | ✅ Yes | Relay timeout | Retry with backoff |
| `RATE_LIMITED` | Transient | ✅ Yes | Too many requests | Retry with backoff |
| `TEMPORARY_FAILURE` | Transient | ✅ Yes | Unknown issue | Retry with backoff |
| `INVALID_PUBLIC_KEY` | Permanent | ❌ No | Bad input | Fix input data |
| `INVALID_NIP05` | Permanent | ❌ No | Bad input | Fix input data |
| `RECORD_NOT_FOUND` | Permanent | ❌ No | No PKARR record | User needs to publish |
| `SIGNATURE_INVALID` | Permanent | ❌ No | Bad signature | Check PKARR record |
| `MALFORMED_RESPONSE` | Permanent | ❌ No | Bad DHT response | Report to relay |
| `CIRCUIT_BREAKER_OPEN` | System | ❌ No | Too many failures | Wait for recovery |
| `MAX_RETRIES_EXCEEDED` | System | ❌ No | All retries failed | Check service health |

---

## Troubleshooting

### High Transient Error Rate (>20%)

**Symptoms:**
- Many `NETWORK_TIMEOUT` or `DHT_UNAVAILABLE` errors
- High retry rate
- Slow verification times

**Solutions:**
1. Check DHT relay health in analytics dashboard
2. Increase timeout from 3s to 4-5s if relays are slow
3. Add more reliable DHT relays
4. Check network connectivity

### Circuit Breaker Frequently Opening

**Symptoms:**
- Many `CIRCUIT_BREAKER_OPEN` errors
- Circuit state frequently OPEN
- Verification requests rejected

**Solutions:**
1. Investigate root cause of failures (check error metrics)
2. Increase failure threshold from 5 to 7-10
3. Decrease timeout from 30s to 15-20s for faster recovery
4. Check DHT relay health

### High Permanent Error Rate (>10%)

**Symptoms:**
- Many `INVALID_PUBLIC_KEY` or `INVALID_NIP05` errors
- No retries occurring
- Immediate failures

**Solutions:**
1. Validate input data before calling endpoint
2. Check client-side validation logic
3. Review error logs for patterns
4. Update user-facing error messages

### Max Retries Exceeded

**Symptoms:**
- Many `MAX_RETRIES_EXCEEDED` errors
- All 3 retries failing
- Long verification times (~7s)

**Solutions:**
1. Check if errors are truly transient
2. Increase max retries from 3 to 4-5
3. Increase max delay from 8s to 10-15s
4. Investigate underlying service issues

---

## Monitoring Recommendations

### Key Metrics to Monitor

1. **Error Rate**
   - Target: <5% total error rate
   - Alert: >10% error rate for 5 minutes

2. **Transient Error Rate**
   - Target: <3% transient error rate
   - Alert: >5% transient error rate for 5 minutes

3. **Circuit Breaker State**
   - Target: CLOSED 99%+ of time
   - Alert: OPEN state for >2 minutes

4. **Retry Rate**
   - Target: <10% of requests retried
   - Alert: >20% retry rate for 5 minutes

5. **Max Retries Exceeded Rate**
   - Target: <1% of requests
   - Alert: >2% for 5 minutes

### Monitoring Queries

```typescript
// Get error metrics
const metrics = errorMetrics.getMetrics();

// Calculate error rate
const errorRate = (metrics.totalErrors / totalRequests) * 100;

// Calculate retry rate
const retryRate = (metrics.retriedErrors / totalRequests) * 100;

// Check circuit breaker state
const circuitState = circuitBreaker.getState();
```

---

## Best Practices

### 1. Always Use Circuit Breaker

```typescript
// ✅ Good: Use circuit breaker
const result = await circuitBreaker.execute(async () => {
  return await performVerification();
});

// ❌ Bad: Direct call without protection
const result = await performVerification();
```

### 2. Classify Errors Properly

```typescript
// ✅ Good: Classify and handle appropriately
const error = classifyError(err);
if (isRetryableError(error)) {
  await retryWithBackoff(fn);
} else {
  return failImmediately(error);
}

// ❌ Bad: Retry all errors blindly
await retryWithBackoff(fn); // May retry permanent errors
```

### 3. Log Errors with Context

```typescript
// ✅ Good: Privacy-safe logging with context
console.error("PKARR verification error:", {
  code: error.code,
  message: error.message,
  isTransient: error.isTransient,
  wasRetried: true,
});

// ❌ Bad: Log sensitive data
console.error("Error for user", userId, pubkey); // PII leak
```

### 4. Cache Error Results

```typescript
// ✅ Good: Cache errors to prevent repeated failures
setCachedResult(cacheKey, errorResult);

// ❌ Bad: Don't cache, retry same error repeatedly
// (wastes resources)
```

---

## References

- **Implementation:** `netlify/functions/utils/pkarr-error-handler.ts`
- **Integration:** `netlify/functions_active/verify-contact-pkarr.ts`
- **Tests:** `tests/pkarr-error-handling.test.ts`
- **Performance Guide:** `docs/PKARR_PERFORMANCE_OPTIMIZATION.md`

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-24  
**Phase:** 2B-1 Day 4  
**Status:** ✅ COMPLETE

