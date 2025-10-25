# PKARR Admin Dashboard Documentation

**Phase 2B-1 Day 5: Admin Dashboard Integration**  
**Version:** 1.0.0  
**Last Updated:** 2025-10-24

---

## Table of Contents

1. [Overview](#overview)
2. [Feature Flags](#feature-flags)
3. [Authentication & Authorization](#authentication--authorization)
4. [Dashboard Features](#dashboard-features)
5. [Error Metrics & Circuit Breaker](#error-metrics--circuit-breaker)
6. [Real-Time Monitoring](#real-time-monitoring)
7. [API Integration](#api-integration)
8. [Usage Guide](#usage-guide)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The PKARR Admin Dashboard provides comprehensive analytics and monitoring for the PKARR decentralized identity verification system. It includes:

- **Verification Statistics:** Total verifications, success rates, unique users, active relays
- **DHT Relay Health Monitoring:** Real-time health status, response times, success rates
- **Verification Method Distribution:** Breakdown by PKARR, SimpleProof, kind:0, Physical MFA
- **Recent Activity Logs:** Last 50 verification attempts with detailed status
- **Error Metrics & Circuit Breaker Status:** Real-time error tracking and circuit breaker monitoring (Phase 2B-1 Day 5)
- **Auto-Refresh:** Automatic data refresh every 30 seconds (optional)

---

## Feature Flags

### Required Feature Flags

```bash
# Master PKARR feature flag (required)
VITE_PKARR_ENABLED=true

# Admin dashboard feature flag (required)
VITE_PKARR_ADMIN_ENABLED=true

# Hybrid identity verification (optional, recommended)
VITE_HYBRID_IDENTITY_ENABLED=true
```

### Configuration

Add to `netlify.toml`:

```toml
[build.environment]
  VITE_PKARR_ENABLED = "true"
  VITE_PKARR_ADMIN_ENABLED = "true"
  VITE_HYBRID_IDENTITY_ENABLED = "true"
```

---

## Authentication & Authorization

### Role-Based Access Control

The admin dashboard requires **guardian** or **steward** role access.

**Allowed Roles:**
- ✅ **Guardian** (highest privilege)
- ✅ **Steward** (admin access)

**Denied Roles:**
- ❌ **Adult** (standard user)
- ❌ **Offspring** (limited user)
- ❌ **Private** (individual user)

### Authentication Flow

1. User must be authenticated with valid session token
2. Session token is validated via `SecureSessionManager.validateSessionFromHeader()`
3. User role is checked via `SecureSessionManager.hasRolePermission(session, 'steward')`
4. If role check fails, API returns `403 Forbidden`

---

## Dashboard Features

### 1. Verification Statistics

**Metrics Displayed:**
- Total Verifications (24h/7d/30d)
- Success Rate (percentage)
- Unique Users
- Active Relays

**Color Coding:**
- 🟢 **Excellent:** Success rate ≥ 95%
- 🟡 **Good:** Success rate ≥ 80%
- 🔴 **Poor:** Success rate < 80%

### 2. DHT Relay Health Monitoring

**Health Status Indicators:**
- 🟢 **Healthy:** Success rate ≥ 95%, avg response time < 1000ms
- 🟡 **Degraded:** Success rate ≥ 80%, avg response time < 2000ms
- 🟠 **Unhealthy:** Success rate ≥ 60%, avg response time < 3000ms
- 🔴 **Critical:** Success rate < 60% or avg response time ≥ 3000ms

**Metrics Per Relay:**
- Success Rate (%)
- Average Response Time (ms)
- Total Attempts (24h)
- P95 Response Time (ms)
- Most Common Error (if any)

### 3. Verification Method Distribution

**Methods Tracked:**
- **PKARR Verified:** BitTorrent DHT-based verification
- **SimpleProof:** Timestamped proof verification
- **kind:0 Verified:** Nostr kind:0 metadata verification
- **Physical MFA Verified:** NFC Name Tag verification

**Verification Levels:**
- **Unverified:** No verification methods
- **Basic:** 1 verification method
- **Enhanced:** 2 verification methods
- **Maximum:** 3+ verification methods

### 4. Recent Activity Logs

**Columns:**
- Public Key (truncated)
- Status (Verified/Unverified)
- Cache Status (valid/expired/missing)
- Publish Status (fresh/stale/expired)
- Created Timestamp

**Limit:** Last 50 verification attempts

---

## Error Metrics & Circuit Breaker

**Phase 2B-1 Day 5 Feature**

### Circuit Breaker Status

**States:**
- 🟢 **CLOSED:** Normal operation, requests allowed
- 🟡 **HALF_OPEN:** Testing recovery, limited requests allowed
- 🔴 **OPEN:** Circuit tripped, requests blocked

**Configuration:**
- **Failure Threshold:** 5 consecutive failures → OPEN
- **Success Threshold:** 2 consecutive successes → CLOSED (from HALF_OPEN)
- **Timeout:** 30 seconds (OPEN → HALF_OPEN)

### Error Metrics Overview

**Metrics Displayed:**
- **Total Requests:** All PKARR verification requests
- **Successful Requests:** Completed without errors
- **Failed Requests:** Completed with errors
- **Error Rate:** Percentage of failed requests

**Error Rate Color Coding:**
- 🟢 **Low:** < 5% error rate
- 🟡 **Moderate:** 5-15% error rate
- 🔴 **High:** > 15% error rate

### Error Type Breakdown

**Transient Errors (Retryable):**
- `NETWORK_TIMEOUT` - Network request timeout
- `DHT_UNAVAILABLE` - DHT service unavailable
- `RELAY_TIMEOUT` - Relay response timeout
- `RATE_LIMITED` - Rate limit exceeded
- `TEMPORARY_FAILURE` - Temporary service failure

**Permanent Errors (Non-Retryable):**
- `INVALID_PUBLIC_KEY` - Malformed public key
- `INVALID_NIP05` - Invalid NIP-05 identifier
- `RECORD_NOT_FOUND` - PKARR record not found
- `SIGNATURE_INVALID` - Invalid Ed25519 signature
- `MALFORMED_RESPONSE` - Invalid response format

### Error Code Distribution

Shows breakdown of errors by error code with:
- Error code name
- Count of occurrences
- Percentage of total errors

### Average Failed Response Time

Average response time for failed requests (in milliseconds).

---

## Real-Time Monitoring

### Auto-Refresh

**Configuration:**
- **Interval:** 30 seconds
- **Toggle:** Enable/disable via checkbox
- **Manual Refresh:** Click "Refresh" button anytime

**Last Updated Timestamp:**
- Displays last refresh time
- Updates automatically on each refresh

### Error Trend Indicators

**Trends:**
- 📈 **Increasing:** Error rate rising
- 📉 **Decreasing:** Error rate falling
- ➡️ **Stable:** Error rate unchanged

**Calculation:**
- Compare current error rate to previous period
- Threshold: ±2% change for stability

---

## API Integration

### Endpoint

```
GET /.netlify/functions/pkarr-analytics
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | `'24h' \| '7d' \| '30d'` | `'24h'` | Time period for analytics |
| `include_relay_health` | `'true' \| 'false'` | `'false'` | Include relay health data |
| `include_distribution` | `'true' \| 'false'` | `'false'` | Include verification distribution |
| `include_recent` | `'true' \| 'false'` | `'false'` | Include recent activity logs |
| `include_error_metrics` | `'true' \| 'false'` | `'false'` | Include error metrics (Day 5) |
| `error_period` | `'1h' \| '24h' \| '7d'` | `'24h'` | Error metrics time period (Day 5) |

### Request Example

```javascript
const response = await fetch(
  `/.netlify/functions/pkarr-analytics?period=24h&include_relay_health=true&include_distribution=true&include_recent=true&include_error_metrics=true&error_period=24h`,
  {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  }
);

const result = await response.json();
```

### Response Structure

```typescript
{
  success: true,
  data: {
    period: "24h",
    verification_stats: {
      total_verifications: 1250,
      successful_verifications: 1187,
      failed_verifications: 63,
      success_rate_percent: 94.96,
      unique_users: 342,
      unique_relays: 5
    },
    relay_health: [...],
    verification_distribution: {...},
    recent_activity: [...],
    error_metrics: {
      period: "24h",
      total_requests: 1250,
      successful_requests: 1187,
      failed_requests: 63,
      error_rate_percent: 5.04,
      transient_errors: 45,
      permanent_errors: 18,
      avg_failed_response_time_ms: 1250.5,
      error_code_distribution: {
        "NETWORK_TIMEOUT": 25,
        "DHT_UNAVAILABLE": 15,
        "INVALID_PUBLIC_KEY": 10,
        ...
      },
      circuit_breaker: {
        state: "CLOSED",
        estimated: true,
        note: "Circuit breaker state is estimated based on error rate."
      }
    }
  },
  response_time_ms: 125
}
```

---

## Usage Guide

### Accessing the Dashboard

1. **Navigate to Admin Section:**
   - Go to `/admin` or `/dashboard` (depending on your routing)
   - Click "PKARR Analytics" in the admin menu

2. **Verify Feature Flags:**
   - Ensure `VITE_PKARR_ENABLED=true`
   - Ensure `VITE_PKARR_ADMIN_ENABLED=true`

3. **Authenticate:**
   - Log in with guardian or steward role account
   - Session token will be automatically included in API requests

### Selecting Time Period

Use the period selector dropdown:
- **Last 24 Hours:** Most recent data
- **Last 7 Days:** Weekly trends
- **Last 30 Days:** Monthly overview

### Enabling Auto-Refresh

1. Check the "Auto-refresh" checkbox
2. Dashboard will refresh every 30 seconds
3. Uncheck to disable auto-refresh

### Manual Refresh

Click the "Refresh" button to manually reload data anytime.

---

## Troubleshooting

### Dashboard Not Loading

**Symptoms:**
- Blank screen or "Loading..." spinner indefinitely

**Solutions:**
1. Check feature flags: `VITE_PKARR_ENABLED` and `VITE_PKARR_ADMIN_ENABLED`
2. Verify authentication: Ensure valid session token
3. Check browser console for errors
4. Verify API endpoint is accessible: `/.netlify/functions/pkarr-analytics`

### "Admin access required" Error

**Symptoms:**
- 403 Forbidden error
- "Admin access required" message

**Solutions:**
1. Verify user role: Must be guardian or steward
2. Check session token validity
3. Re-authenticate if session expired

### No Error Metrics Displayed

**Symptoms:**
- Error metrics section not visible

**Solutions:**
1. Ensure `include_error_metrics=true` in API request
2. Check if error data exists in database (pkarr_publish_history table)
3. Verify error period parameter is valid ('1h', '24h', or '7d')

### Circuit Breaker Shows "Estimated"

**Explanation:**
- Circuit breaker state is per-instance (not shared across Netlify Functions)
- Dashboard estimates state based on error rate:
  - Error rate > 50% → OPEN
  - Error rate > 30% → HALF_OPEN
  - Error rate ≤ 30% → CLOSED

**Note:** This is expected behavior. Actual circuit breaker state is maintained in the verify-contact-pkarr function instance.

---

## Related Documentation

- [PKARR API Documentation](./PKARR_API_DOCUMENTATION.md)
- [PKARR Error Handling](./PKARR_ERROR_HANDLING.md)
- [PKARR Performance Optimization](./PKARR_PERFORMANCE_OPTIMIZATION.md)
- [PKARR Deployment Checklist](./PKARR_DEPLOYMENT_CHECKLIST.md)
- [PKARR Migration Guide](./PKARR_MIGRATION_GUIDE.md)

---

**End of Documentation**

