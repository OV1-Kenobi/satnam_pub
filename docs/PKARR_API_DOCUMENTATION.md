# PKARR API Documentation

**Phase 2A + Phase 2B-1 + Consolidation - Production Implementation**

## Overview

This document provides comprehensive API documentation for all PKARR (Public Key Addressable Resource Records) endpoints and integrations implemented in Phase 2A, Phase 2B-1, and the unified proxy consolidation.

**Phase 2A**: Core verification and publishing infrastructure
**Phase 2B-1**: Enhancements, optimizations, analytics, and admin features
**Consolidation**: Unified proxy pattern for all PKARR operations (following `lnbits-proxy` architecture)

---

## 🚀 **IMPORTANT: Unified Proxy Architecture**

All PKARR operations now use a **unified proxy endpoint** with action-based routing:

```
POST /.netlify/functions/pkarr-proxy
```

**Request Format:**

```json
{
  "action": "verify_contact" | "verify_batch" | "get_analytics" | "reset_circuit_breaker" | "get_circuit_breaker_state" | "force_open_circuit_breaker" | "force_close_circuit_breaker",
  "payload": { /* action-specific parameters */ }
}
```

**Benefits:**

- ✅ Reduced memory usage (single function vs. multiple functions)
- ✅ Improved maintainability (centralized error handling, rate limiting, authentication)
- ✅ Consistent API patterns (follows established `lnbits-proxy` architecture)
- ✅ Shared circuit breaker and error metrics across all actions

---

## Table of Contents

1. [pkarr-proxy (Unified Endpoint)](#pkarr-proxy-unified-endpoint) **CONSOLIDATED**
   - [verify_contact](#action-verify_contact) (Phase 2A)
   - [verify_batch](#action-verify_batch) (Phase 2B-1 Day 1)
   - [get_analytics](#action-get_analytics) (Phase 2B-1 Day 2 + Day 5)
   - [reset_circuit_breaker](#action-reset_circuit_breaker) (Admin, Phase 2B-1 Day 5)
   - [get_circuit_breaker_state](#action-get_circuit_breaker_state) (Admin, Phase 2B-1 Day 5)
   - [force_open_circuit_breaker](#action-force_open_circuit_breaker) (Admin, Testing Only)
   - [force_close_circuit_breaker](#action-force_close_circuit_breaker) (Admin, Emergency Only)
2. [scheduled-pkarr-republish](#scheduled-pkarr-republish) (Phase 2A + Phase 2B-1 Day 6)
3. [PKARR Publishing Integration](#pkarr-publishing-integration)
4. [Database Schema](#database-schema)
5. [Environment Variables](#environment-variables)
6. [Error Codes](#error-codes)
7. [Rate Limiting](#rate-limiting)

---

## pkarr-proxy (Unified Endpoint)

### Endpoint

```
POST /.netlify/functions/pkarr-proxy
```

### Description

Unified proxy endpoint for all PKARR operations. Uses action-based routing to handle verification, analytics, and admin operations through a single consolidated function.

### Authentication

**Required:** Yes (for all actions)
**Method:** JWT Bearer token in `Authorization` header

```http
Authorization: Bearer <session_token>
```

### Action Scopes

- **`user` scope**: Requires authentication (verify_contact, verify_batch, get_analytics)
- **`admin` scope**: Requires authentication + guardian/steward role (reset_circuit_breaker, get_circuit_breaker_state, force_open_circuit_breaker, force_close_circuit_breaker)

### Rate Limiting

- **verify_contact**: 60 requests/hour per IP
- **verify_batch**: 10 requests/hour per IP
- **get_analytics**: 60 requests/hour per IP
- **Admin actions**: 60 requests/hour per IP
- **Response on limit exceeded:** 429 Too Many Requests

---

## Action: verify_contact

### Description

Verifies a single contact via PKARR (Public Key Addressable Resource Records). This action performs PKARR resolution using the HybridNIP05Verifier and updates the `pkarr_verified` flag in the `encrypted_contacts` table.

### Scope

**`user`** - Requires authentication

### Rate Limiting

- **Limit:** 60 requests per hour per IP address
- **Response on limit exceeded:** 429 Too Many Requests

### Request

```json
{
  "action": "verify_contact",
  "payload": {
    "contact_hash": "string (required)",
    "nip05": "string (required)",
    "pubkey": "string (required)"
  }
}
```

**Payload Parameters:**

- `contact_hash` (string, required): SHA-256 hash of the contact identifier
- `nip05` (string, required): NIP-05 identifier (e.g., `username@domain.com`)
- `pubkey` (string, required): Nostr public key (npub or hex format)

### Response

#### Success (200 OK)

```json
{
  "success": true,
  "verified": true,
  "verification_level": "basic",
  "response_time_ms": 1234,
  "cached": false,
  "retried": false
}
```

#### Verification Failed (200 OK)

```json
{
  "success": true,
  "verified": false,
  "verification_level": "unverified",
  "error": "PKARR verification failed: Record not found",
  "error_code": "RECORD_NOT_FOUND",
  "response_time_ms": 1234,
  "cached": false,
  "retried": false
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": "Missing required fields: contact_hash, nip05, pubkey"
}
```

**401 Unauthorized**

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**404 Not Found**

```json
{
  "success": false,
  "error": "Contact not found"
}
```

**429 Too Many Requests**

```json
{
  "success": false,
  "error": "Rate limit exceeded"
}
```

**500 Internal Server Error**

```json
{
  "success": false,
  "error": "RLS context setup failed"
}
```

### Example Usage

#### JavaScript/TypeScript

```typescript
const response = await fetch("/.netlify/functions/pkarr-proxy", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  },
  body: JSON.stringify({
    action: "verify_contact",
    payload: {
      contact_hash: "abc123...",
      nip05: "alice@my.satnam.pub",
      pubkey: "npub1...",
    },
  }),
});

const result = await response.json();
if (result.success && result.verified) {
  console.log(`Contact verified! Level: ${result.verification_level}`);
}
```

#### cURL

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/pkarr-proxy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{
    "action": "verify_contact",
    "payload": {
      "contact_hash": "abc123...",
      "nip05": "alice@my.satnam.pub",
      "pubkey": "npub1..."
    }
  }'
```

### Behavior Details

1. **Authentication & RLS:**

   - Validates session token via `SecureSessionManager.validateSessionFromHeader()`
   - Sets RLS context using `owner_hash` from session
   - All database queries respect Row Level Security policies

2. **PKARR Verification:**

   - Uses `HybridNIP05Verifier.tryPkarrResolution()` method
   - Queries PKARR DHT relays for DNS records
   - Validates that `pubkey` matches the PKARR record
   - Timeout: 3 seconds (optimized from 5s in Phase 2B-1 Day 3)

3. **Performance Optimizations:**

   - **Query result caching**: 5-minute TTL using in-memory Map
   - **Request deduplication**: 60-second window to prevent duplicate concurrent requests
   - **Circuit breaker protection**: Shared global circuit breaker across all actions
   - **Exponential backoff retry**: Max 3 retries with 1s-8s delay range

4. **Database Updates:**

   - Updates `pkarr_verified` flag in `encrypted_contacts` table
   - Triggers `auto_update_verification_level()` function automatically
   - Returns updated `verification_level` in response

5. **Non-Blocking:**
   - Can be called asynchronously without blocking UI

---

## verify-contacts-batch

**Phase 2B-1 Day 1: Batch Verification Implementation**

### Endpoint

```
POST /.netlify/functions/verify-contacts-batch
```

### Description

Server-side endpoint for verifying multiple contacts simultaneously via PKARR. Supports up to 50 contacts per request with parallel processing using `Promise.allSettled()`.

### Authentication

**Required:** Yes
**Method:** JWT Bearer token in `Authorization` header

```http
Authorization: Bearer <session_token>
```

### Rate Limiting

- **Limit:** 10 batch requests per hour per IP address
- **Response on limit exceeded:** 429 Too Many Requests

### Request Body

```json
{
  "contacts": [
    {
      "contact_hash": "string (required)",
      "nip05": "string (required)",
      "pubkey": "string (required)"
    }
  ]
}
```

**Parameters:**

- `contacts` (array, required): Array of contact objects (max 50)
  - `contact_hash` (string, required): SHA-256 hash of the contact identifier
  - `nip05` (string, required): NIP-05 identifier (e.g., `username@domain.com`)
  - `pubkey` (string, required): Nostr public key (npub or hex format)

### Response

#### Success (200 OK)

```json
{
  "success": true,
  "results": [
    {
      "contact_hash": "abc123...",
      "verified": true,
      "verification_level": "basic",
      "method": "pkarr"
    },
    {
      "contact_hash": "def456...",
      "verified": false,
      "verification_level": "unverified",
      "method": "pkarr",
      "error": "Record not found"
    }
  ],
  "summary": {
    "total": 50,
    "successful": 48,
    "failed": 2,
    "duration_ms": 2345
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": "Invalid request",
  "message": "Contacts array exceeds maximum size of 50"
}
```

**429 Too Many Requests**

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Maximum 10 batch requests per hour. Please try again later."
}
```

### Example Usage

#### JavaScript/TypeScript

```typescript
const contacts = [
  {
    contact_hash: "abc123...",
    nip05: "alice@my.satnam.pub",
    pubkey: "npub1...",
  },
  {
    contact_hash: "def456...",
    nip05: "bob@my.satnam.pub",
    pubkey: "npub1...",
  },
];

const response = await fetch("/.netlify/functions/verify-contacts-batch", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  },
  body: JSON.stringify({ contacts }),
});

const result = await response.json();
console.log(
  `Verified ${result.summary.successful}/${result.summary.total} contacts`
);
```

### Behavior Details

1. **Parallel Processing:**

   - All contacts verified in parallel using `Promise.allSettled()`
   - Individual failures don't block other verifications
   - Returns partial results even if some verifications fail

2. **Performance:**

   - Typical batch of 50 contacts completes in 2-5 seconds
   - Uses query result caching (5-minute TTL) for repeated verifications
   - Request deduplication prevents duplicate concurrent requests

3. **Error Handling:**
   - Each contact result includes success/failure status
   - Failed verifications include error message
   - Summary provides aggregate statistics

---

## pkarr-analytics

**Phase 2B-1 Day 2 + Day 5: Analytics & Monitoring + Admin Dashboard Integration**

### Endpoint

```
GET /.netlify/functions/pkarr-analytics
```

### Description

Server-side endpoint for retrieving PKARR analytics data including verification metrics, publish metrics, relay performance, and error metrics (admin only).

### Authentication

**Required:** Yes
**Method:** JWT Bearer token in `Authorization` header

### Rate Limiting

- **Limit:** 60 requests per hour per IP address
- **Response on limit exceeded:** 429 Too Many Requests

### Query Parameters

```
?include_error_metrics=true&error_period=24h
```

**Parameters:**

- `include_error_metrics` (boolean, optional): Include error metrics in response (admin only, default: false)
- `error_period` (string, optional): Time period for error metrics ('1h' | '24h' | '7d', default: '24h')

### Response

#### Success (200 OK) - Basic Analytics

```json
{
  "success": true,
  "analytics": {
    "verification_summary": {
      "total_verifications": 1000,
      "verified_count": 950,
      "unverified_count": 50,
      "success_rate": 95.0,
      "avg_response_time_ms": 1200
    },
    "publish_summary": {
      "total_publishes": 500,
      "successful_publishes": 490,
      "failed_publishes": 10,
      "success_rate": 98.0,
      "avg_publish_time_ms": 2000
    },
    "relay_performance": [
      {
        "relay_url": "https://pkarr.relay.pubky.tech",
        "total_requests": 500,
        "successful_requests": 495,
        "failed_requests": 5,
        "success_rate": 99.0,
        "avg_response_time_ms": 1800
      }
    ]
  }
}
```

#### Success (200 OK) - With Error Metrics (Admin Only)

```json
{
  "success": true,
  "analytics": {
    "verification_summary": { ... },
    "publish_summary": { ... },
    "relay_performance": [ ... ],
    "error_metrics": {
      "total_requests": 1000,
      "successful_requests": 950,
      "failed_requests": 50,
      "error_rate": 5.0,
      "transient_errors": 45,
      "permanent_errors": 5,
      "error_distribution": [
        { "code": "NETWORK_TIMEOUT", "count": 30 },
        { "code": "DHT_UNAVAILABLE", "count": 15 },
        { "code": "INVALID_PUBLIC_KEY", "count": 5 }
      ],
      "avg_failed_response_time_ms": 3000,
      "circuit_breaker_state": "CLOSED"
    }
  }
}
```

### Example Usage

#### JavaScript/TypeScript

```typescript
// Basic analytics (all users)
const response = await fetch("/.netlify/functions/pkarr-analytics", {
  headers: {
    Authorization: `Bearer ${sessionToken}`,
  },
});

const result = await response.json();
console.log(
  `Success rate: ${result.analytics.verification_summary.success_rate}%`
);

// Admin analytics with error metrics
const adminResponse = await fetch(
  "/.netlify/functions/pkarr-analytics?include_error_metrics=true&error_period=24h",
  {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  }
);

const adminResult = await adminResponse.json();
console.log(
  `Circuit breaker state: ${adminResult.analytics.error_metrics.circuit_breaker_state}`
);
```

### Behavior Details

1. **Access Control:**

   - Basic analytics available to all authenticated users
   - Error metrics require guardian/admin role
   - Non-admin users receive 403 Forbidden if requesting error metrics

2. **Data Sources:**

   - Uses database views for efficient queries (`pkarr_verification_summary`, `pkarr_publish_summary`, etc.)
   - Real-time data (no caching)
   - Aggregated statistics for privacy

3. **Performance:**
   - Typical response time: <500ms
   - Uses optimized database indexes
   - Minimal server load

---

## pkarr-admin

**Phase 2B-1 Day 5: Admin Dashboard Integration**

### Endpoint

```
POST /.netlify/functions/pkarr-admin
```

### Description

Server-side endpoint for admin-only PKARR system management including circuit breaker controls and system health monitoring.

### Authentication

**Required:** Yes (Guardian/Admin role only)
**Method:** JWT Bearer token in `Authorization` header

### Rate Limiting

- **Limit:** 60 requests per hour per IP address
- **Response on limit exceeded:** 429 Too Many Requests

### Request Body

```json
{
  "action": "reset_circuit_breaker" | "get_circuit_breaker_state" | "force_open_circuit_breaker" | "force_close_circuit_breaker"
}
```

**Parameters:**

- `action` (string, required): Admin action to perform
  - `reset_circuit_breaker` - Reset circuit breaker to CLOSED state
  - `get_circuit_breaker_state` - Get current circuit breaker state
  - `force_open_circuit_breaker` - Force circuit breaker to OPEN state (testing only)
  - `force_close_circuit_breaker` - Force circuit breaker to CLOSED state (emergency only)

### Response

#### Success (200 OK) - Reset Circuit Breaker

```json
{
  "success": true,
  "action": "reset_circuit_breaker",
  "result": {
    "previous_state": "OPEN",
    "new_state": "CLOSED",
    "reset_at": 1698765432000
  }
}
```

#### Success (200 OK) - Get Circuit Breaker State

```json
{
  "success": true,
  "action": "get_circuit_breaker_state",
  "result": {
    "state": "CLOSED",
    "failure_count": 2,
    "success_count": 98,
    "last_failure_at": 1698765432000,
    "opened_at": null
  }
}
```

#### Error Responses

**403 Forbidden**

```json
{
  "success": false,
  "error": "Forbidden",
  "message": "Admin access required. User role: adult"
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": "Invalid action",
  "message": "Action must be one of: reset_circuit_breaker, get_circuit_breaker_state, force_open_circuit_breaker, force_close_circuit_breaker"
}
```

### Example Usage

#### JavaScript/TypeScript

```typescript
// Reset circuit breaker
const response = await fetch("/.netlify/functions/pkarr-admin", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  },
  body: JSON.stringify({
    action: "reset_circuit_breaker",
  }),
});

const result = await response.json();
if (result.success) {
  console.log(
    `Circuit breaker reset: ${result.result.previous_state} → ${result.result.new_state}`
  );
}
```

### Behavior Details

1. **Access Control:**

   - Requires guardian or admin role
   - Role validation via `SecureSessionManager`
   - Audit logging for all admin actions

2. **Circuit Breaker Management:**

   - Reset clears failure count and transitions to CLOSED
   - Force open/close for testing and emergency scenarios
   - State changes logged to database

3. **Safety:**
   - Confirmation dialogs required in UI
   - Audit trail for all state changes
   - Rate limiting prevents abuse

---

## scheduled-pkarr-republish

### Endpoint

```
POST /.netlify/functions/scheduled-pkarr-republish
```

### Description

Scheduled function that republishes expired PKARR records to maintain 24-hour TTL compliance. Runs automatically every 6 hours via Netlify scheduled functions.

### Schedule

```
Cron: 0 */6 * * *
Frequency: Every 6 hours
Next runs: 00:00, 06:00, 12:00, 18:00 UTC
```

### Authentication

**Required:** No (scheduled function, not user-facing)  
**Note:** Can be triggered manually for testing purposes

### Request Body

None (scheduled function)

### Response

#### Success (200 OK)

```json
{
  "success": true,
  "republished": 15,
  "failed": 2,
  "message": "Republished 15 PKARR records, 2 failed"
}
```

#### Error (500 Internal Server Error)

```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Failed to republish PKARR records"
}
```

### Behavior Details

1. **Query Expired Records:**

   - Queries `pkarr_records` table for records older than 24 hours
   - Uses condition: `last_published_at IS NULL OR last_published_at < NOW() - INTERVAL '24 hours'`
   - Limits to 100 records per run (prevents timeout)

2. **Republish to DHT:**

   - Publishes to PKARR DHT relays:
     - `https://pkarr.relay.pubky.tech`
     - `https://pkarr.relay.synonym.to`
   - Increments `sequence` number for each republish
   - Updates `timestamp` to current Unix timestamp

3. **Database Updates:**

   - Updates `sequence`, `timestamp`, `relay_urls`, `last_published_at` in `pkarr_records`
   - Logs publish attempt to `pkarr_publish_history` table
   - Records success/failure status and error messages

4. **Error Handling:**
   - Continues processing remaining records if one fails
   - Logs errors to `pkarr_publish_history` with `success=false`
   - Returns summary of successful and failed republishes

### Example Manual Trigger

```bash
# Trigger scheduled function manually (for testing)
curl -X POST https://your-site.netlify.app/.netlify/functions/scheduled-pkarr-republish
```

### Database Queries

**Check records due for republishing:**

```sql
SELECT
  public_key,
  sequence,
  last_published_at,
  NOW() - last_published_at AS age
FROM pkarr_records
WHERE last_published_at IS NULL
   OR last_published_at < NOW() - INTERVAL '24 hours'
ORDER BY last_published_at ASC NULLS FIRST
LIMIT 100;
```

**Check publish history:**

```sql
SELECT
  public_key,
  sequence,
  success,
  error_message,
  published_at
FROM pkarr_publish_history
ORDER BY published_at DESC
LIMIT 20;
```

---

## PKARR Publishing Integration

### IdentityForge (Client-Side Publishing)

**Location:** `src/components/IdentityForge.tsx`

**Trigger:** During identity creation (after Nostr key generation)

**Behavior:**

1. Generates PKARR DNS records:

   ```json
   [
     {
       "name": "_nostr",
       "type": "TXT",
       "value": "nostr=npub1...",
       "ttl": 3600
     },
     {
       "name": "_nip05",
       "type": "TXT",
       "value": "username@my.satnam.pub",
       "ttl": 3600
     }
   ]
   ```

2. Signs records with Ed25519 private key:

   ```typescript
   const message = `${recordsJson}${timestamp}${sequence}`;
   const signature = ed25519.sign(messageBytes, privateKeyBytes);
   ```

3. Publishes to `/.netlify/functions/pkarr-publish` endpoint

4. **Non-blocking:** Registration succeeds even if PKARR publishing fails

**Feature Flag:** `VITE_PKARR_ENABLED` (default: false)

**UI Indicator:**

```
PKARR Attestation: ✓ Published | ⚠ Optional | ○ Skipped
```

---

### register-identity (Server-Side Publishing)

**Location:** `netlify/functions_active/register-identity.ts`

**Trigger:** After successful identity registration

**Behavior:**

1. Extracts `npub`, `username`, `domain` from registration data
2. Creates PKARR DNS records (same format as IdentityForge)
3. Stores record in `pkarr_records` table with `sequence=1`
4. **Non-blocking:** Runs asynchronously, doesn't block registration response

**Feature Flag:** `VITE_PKARR_ENABLED` (default: false)

**Code Example:**

```typescript
// Optional: Publish PKARR record (non-blocking)
const pkarrEnabled = process.env.VITE_PKARR_ENABLED === "true";
if (pkarrEnabled && validatedData.npub) {
  publishPkarrRecordAsync(
    validatedData.npub,
    validatedData.username,
    resolvePlatformLightningDomainServer()
  ).catch((err) => {
    console.warn("⚠️ PKARR publishing failed (non-blocking):", err);
  });
}
```

---

### add-contact (Automatic Verification)

**Location:** `api/communications/add-contact.js`

**Trigger:** After contact creation (when `VITE_PKARR_AUTO_VERIFY_ON_ADD=true`)

**Behavior:**

1. Creates contact in `encrypted_contacts` table
2. If auto-verify enabled, triggers background PKARR verification
3. Calls `verify-contact-pkarr` endpoint asynchronously
4. **Non-blocking:** Contact creation succeeds even if verification fails

**Feature Flag:** `VITE_PKARR_AUTO_VERIFY_ON_ADD` (default: false)

**Code Example:**

```javascript
const autoVerifyPkarr = process.env.VITE_PKARR_AUTO_VERIFY_ON_ADD === "true";
if (autoVerifyPkarr && body.nip05 && body.pubkey) {
  fetch("/.netlify/functions/verify-contact-pkarr", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      contact_hash,
      nip05: body.nip05,
      pubkey: body.pubkey,
    }),
  }).catch((err) =>
    console.error("Background PKARR verification failed:", err)
  );
}
```

---

## Database Schema

### encrypted_contacts Table

**PKARR-Related Columns:**

```sql
pkarr_verified BOOLEAN DEFAULT FALSE,
verification_level TEXT DEFAULT 'unverified',
  CHECK (verification_level IN ('unverified', 'basic', 'verified', 'trusted'))
```

**Trigger Function:**

```sql
CREATE OR REPLACE FUNCTION public.auto_update_verification_level()
RETURNS TRIGGER AS $$
BEGIN
  -- Trusted: Physical MFA + (SimpleProof OR kind:0)
  IF NEW.physical_mfa_verified AND (NEW.simpleproof_verified OR NEW.kind0_verified) THEN
    NEW.verification_level := 'trusted';

  -- Verified: Physical MFA OR (SimpleProof AND kind:0)
  ELSIF NEW.physical_mfa_verified OR (NEW.simpleproof_verified AND NEW.kind0_verified) THEN
    NEW.verification_level := 'verified';

  -- Basic: Any single verification method
  ELSIF NEW.pkarr_verified OR NEW.iroh_dht_verified OR NEW.simpleproof_verified
        OR NEW.kind0_verified OR NEW.physical_mfa_verified THEN
    NEW.verification_level := 'basic';

  -- Unverified: No verification methods
  ELSE
    NEW.verification_level := 'unverified';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### pkarr_records Table

```sql
CREATE TABLE pkarr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key TEXT NOT NULL UNIQUE,
  records JSONB NOT NULL,
  timestamp INTEGER NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  signature TEXT NOT NULL,
  relay_urls TEXT[] DEFAULT '{}',
  last_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**

```sql
CREATE INDEX idx_pkarr_records_public_key ON pkarr_records(public_key);
CREATE INDEX idx_pkarr_records_last_published ON pkarr_records(last_published_at);
```

---

### pkarr_publish_history Table

```sql
CREATE TABLE pkarr_publish_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  relay_urls TEXT[] DEFAULT '{}',
  success BOOLEAN NOT NULL,
  error_message TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**

```sql
CREATE INDEX idx_pkarr_history_public_key ON pkarr_publish_history(public_key);
CREATE INDEX idx_pkarr_history_published_at ON pkarr_publish_history(published_at DESC);
```

---

## Environment Variables

### VITE_PKARR_ENABLED

- **Type:** Boolean (string)
- **Default:** `false`
- **Description:** Master feature flag for PKARR attestation system
- **Values:** `'true'` | `'false'`
- **Affects:**
  - PKARR publishing in IdentityForge
  - PKARR publishing in register-identity
  - AttestationsTab visibility in Settings
  - ContactVerificationBadge PKARR features

**Example:**

```bash
VITE_PKARR_ENABLED=true
```

---

### VITE_PKARR_AUTO_VERIFY_ON_ADD

- **Type:** Boolean (string)
- **Default:** `false`
- **Description:** Enable automatic PKARR verification when adding contacts
- **Values:** `'true'` | `'false'`
- **Affects:**
  - Automatic verification in `add-contact` endpoint
  - Background verification API calls

**Example:**

```bash
VITE_PKARR_AUTO_VERIFY_ON_ADD=true
```

---

### VITE_HYBRID_IDENTITY_ENABLED

- **Type:** Boolean (string)
- **Default:** `false`
- **Description:** Enable hybrid identity verification (PKARR + kind:0 + DNS)
- **Values:** `'true'` | `'false'`
- **Required for:** PKARR verification to work

**Example:**

```bash
VITE_HYBRID_IDENTITY_ENABLED=true
```

---

## Error Codes Reference

| Code | Description           | Resolution                                          |
| ---- | --------------------- | --------------------------------------------------- |
| 401  | Unauthorized          | Provide valid session token in Authorization header |
| 404  | Contact not found     | Verify contact_hash and owner_hash match            |
| 429  | Rate limit exceeded   | Wait before retrying (60 requests/hour limit)       |
| 500  | Internal server error | Check server logs, contact support                  |

---

## Best Practices

1. **Always use feature flags** to enable/disable PKARR features
2. **Handle failures gracefully** - PKARR operations should never block core functionality
3. **Respect rate limits** - Implement client-side throttling for bulk operations
4. **Monitor publish history** - Check `pkarr_publish_history` table for failed publishes
5. **Test with real DHT relays** - Verify PKARR records are accessible via public relays

---

## Support & Troubleshooting

**Common Issues:**

1. **PKARR verification always fails:**

   - Check `VITE_HYBRID_IDENTITY_ENABLED=true`
   - Verify NIP-05 and pubkey are valid
   - Check DHT relay connectivity

2. **Scheduled republishing not working:**

   - Verify Netlify scheduled functions are enabled
   - Check `netlify.toml` configuration
   - Review function logs in Netlify dashboard

3. **Rate limiting too aggressive:**
   - Adjust rate limit in `verify-contact-pkarr.ts`
   - Implement client-side request batching

---

**Last Updated:** 2025-10-24  
**Version:** Phase 2A Production Implementation
