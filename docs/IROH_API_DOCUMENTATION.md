# Iroh API Documentation

**Phase 2B-2 Week 2: Iroh Integration**  
**Status:** ✅ COMPLETE (Task 1 & Task 2)  
**Feature Flag:** `VITE_IROH_ENABLED` (default: `false`, opt-in)

---

## Overview

The Iroh integration provides **optional 5th verification method** for decentralized identity verification using peer-to-peer node discovery via the Iroh DHT (Distributed Hash Table). Iroh complements the existing 4 primary verification methods:

1. **kind:0** - Nostr Event (Centralized but Sovereign)
2. **PKARR** - Public Key Addressable Resource Records (Decentralized and Sovereign)
3. **DNS** - Domain Name System (Centralized and Permissioned, but Convenient)
4. **SimpleProof** - Blockchain-Anchored Timestamping
5. **Iroh** - Self-Hosted Distributed Backup (Optional, Opt-In) **[NEW]**

---

## Architecture

### Unified Proxy Pattern

Following the established `pkarr-proxy` and `lnbits-proxy` patterns, all Iroh operations are consolidated into a single unified endpoint:

**Endpoint:** `/.netlify/functions/iroh-proxy`

**Actions:**
- `discover_node` - Discover Iroh nodes via DHT lookup
- `verify_node` - Verify node reachability with caching
- `get_node_info` - Retrieve stored node information
- `update_node_status` - Update node reachability status (admin only)

---

## API Reference

### 1. Discover Node

**Action:** `discover_node`  
**Scope:** User (requires authentication)  
**Rate Limit:** 20 requests/hour per IP

**Request:**
```json
{
  "action": "discover_node",
  "payload": {
    "verification_id": "550e8400-e29b-41d4-a716-446655440000",
    "node_id": "abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqr"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "node_id": "abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqr",
  "relay_url": "https://relay.iroh.computer",
  "direct_addresses": [
    "192.168.1.100:4433",
    "2001:db8::1:4433"
  ],
  "is_reachable": true,
  "discovered_at": 1698765432
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "DHT lookup timeout (>10s)"
}
```

---

### 2. Verify Node

**Action:** `verify_node`  
**Scope:** User (requires authentication)  
**Rate Limit:** 50 requests/hour per IP  
**Caching:** 1-hour TTL (in-memory)

**Request:**
```json
{
  "action": "verify_node",
  "payload": {
    "node_id": "abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqr"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "is_reachable": true,
  "relay_url": "https://relay.iroh.computer",
  "direct_addresses": ["192.168.1.100:4433"],
  "last_seen": 1698765432,
  "cached": false
}
```

**Headers:**
- `X-Cache: HIT` - Result from cache
- `X-Cache: MISS` - Fresh DHT lookup

---

### 3. Get Node Info

**Action:** `get_node_info`  
**Scope:** User (requires authentication)  
**Rate Limit:** 60 requests/hour per IP

**Request:**
```json
{
  "action": "get_node_info",
  "payload": {
    "verification_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Response:**
```json
{
  "success": true,
  "nodes": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "node_id": "abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqr",
      "relay_url": "https://relay.iroh.computer",
      "direct_addresses": ["192.168.1.100:4433"],
      "discovered_at": 1698765432,
      "last_seen": 1698765500,
      "is_reachable": true
    }
  ]
}
```

---

### 4. Update Node Status (Admin Only)

**Action:** `update_node_status`  
**Scope:** Admin (requires guardian/steward role)  
**Rate Limit:** 60 requests/hour per IP

**Request:**
```json
{
  "action": "update_node_status",
  "payload": {
    "node_id": "abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqr",
    "is_reachable": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "updated_count": 1,
  "message": "Updated 1 node(s)"
}
```

---

## Client-Side Integration

### IrohVerificationService

**Import:**
```typescript
import { irohVerificationService } from '../services/irohVerificationService';
```

**Check if Enabled:**
```typescript
if (irohVerificationService.isEnabled()) {
  // Iroh is enabled via VITE_IROH_ENABLED feature flag
}
```

**Discover Node:**
```typescript
const result = await irohVerificationService.discoverNode({
  verification_id: '550e8400-e29b-41d4-a716-446655440000',
  node_id: 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqr'
});

if (result.success && result.is_reachable) {
  console.log('Node is reachable!');
}
```

**Verify Node:**
```typescript
const result = await irohVerificationService.verifyNode({
  node_id: 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqr'
});

console.log('Cached:', result.cached);
console.log('Reachable:', result.is_reachable);
```

---

## Multi-Method Verification Integration

### HybridNIP05Verifier

Iroh is integrated as an **optional 5th verification method** in the multi-method verification system.

**Enable Iroh:**
```typescript
import { HybridNIP05Verifier } from '../lib/nip05-verification';

const verifier = new HybridNIP05Verifier({
  enableMultiMethodVerification: true,
  enableIrohDiscovery: true, // Enable Iroh as 5th method
  irohTimeout: 10000, // 10 seconds (DHT lookups can be slow)
});

const result = await verifier.verifyHybrid('alice@satnam.pub', expectedPubkey);

// Check Iroh result
if (result.methodAgreement?.iroh) {
  console.log('Iroh node is reachable!');
}
```

**Method Agreement:**
```typescript
{
  kind0: true,
  pkarr: true,
  dns: true,
  iroh: true, // NEW: Iroh node reachability
  agreementCount: 4 // All 4 methods agree (Iroh is optional)
}
```

---

## Feature Flag Configuration

**Environment Variable:** `VITE_IROH_ENABLED`

**Default:** `false` (opt-in upgrade for advanced users)

**Enable Iroh:**
```bash
# .env.local
VITE_IROH_ENABLED=true
```

**Netlify Environment:**
```bash
netlify env:set VITE_IROH_ENABLED true
```

---

## Database Schema

**Table:** `iroh_node_discovery`

**Columns:**
- `id` - UUID (primary key)
- `verification_id` - UUID (foreign key to `multi_method_verification_results`)
- `node_id` - VARCHAR(64) (base32 encoded, 52 characters)
- `relay_url` - VARCHAR(255) (nullable)
- `direct_addresses` - JSONB (nullable)
- `discovered_at` - BIGINT (Unix timestamp)
- `last_seen` - BIGINT (Unix timestamp, nullable)
- `is_reachable` - BOOLEAN (nullable)

**Helper Functions:**
- `store_iroh_discovery()` - Store discovery result
- `get_iroh_discovery()` - Retrieve discovery by verification_id
- `update_iroh_reachability()` - Update node reachability status

---

## Error Handling

**Common Errors:**
- `"Missing required field: verification_id"` - Invalid request payload
- `"Invalid node_id format (must be 52-char base32)"` - Node ID validation failed
- `"DHT lookup timeout (>10s)"` - DHT operation exceeded timeout
- `"Rate limit exceeded (20 requests/hour)"` - Too many requests
- `"Iroh verification is disabled (feature flag: VITE_IROH_ENABLED)"` - Feature flag is OFF

**Graceful Degradation:**
- If Iroh is disabled, methods return `success: false` with descriptive error
- If DHT lookup fails, returns empty/unreachable result (no exception thrown)
- If node ID not found in kind:0 metadata, Iroh verification is skipped

---

## Performance Considerations

**Caching:**
- Verification results cached for 1 hour (in-memory)
- Cache cleanup runs every 5 minutes
- Cache key: First 32 characters of node ID

**Timeouts:**
- DHT lookup: 10 seconds (configurable via `irohTimeout`)
- kind:0 resolution: 3 seconds (for node ID extraction)

**Rate Limiting:**
- `discover_node`: 20 req/hour per IP
- `verify_node`: 50 req/hour per IP
- `get_node_info`: 60 req/hour per IP
- `update_node_status`: 60 req/hour per IP (admin only)

---

## Security

**Privacy-First:**
- No PII stored in database
- Only node identifiers and addresses
- RLS policies enforce user-scoped access

**Validation:**
- Node ID format: `/^[a-z2-7]{52}$/` (base32, 52 chars)
- UUID format: Standard UUID v4 validation
- HTTPS-only for DHT calls

**CORS:**
- Origin: `https://www.satnam.pub`
- Methods: `POST, OPTIONS`
- Headers: `Content-Type, Authorization`

---

## Testing

**Test Suite:** `tests/iroh-integration.test.ts`

**Coverage:**
- ✅ 36 tests passing (100% pass rate)
- ✅ Node discovery with valid/invalid inputs
- ✅ Node verification with caching
- ✅ Rate limiting enforcement
- ✅ Error handling and graceful degradation
- ✅ Database integration
- ✅ Privacy & security validation

**Run Tests:**
```bash
npm test -- tests/iroh-integration.test.ts --run
```

---

## Migration Path

**Deprecated Functions:**
- `netlify/functions_lazy/iroh-discover-node.ts` (moved to lazy loading)
- `netlify/functions_lazy/iroh-verify-node.ts` (moved to lazy loading)

**New Unified Proxy:**
- `netlify/functions/iroh-proxy.ts` (697 lines)
- `netlify/functions_active/iroh-proxy.ts` (2-line wrapper)

**Client Updates:**
- `src/lib/attestation-manager.ts` - Updated to use `iroh-proxy` with action parameter
- `src/lib/nip05-verification.ts` - Added `tryIrohDiscoveryMultiMethod()` method

---

_Built with ⚡ and 🧡 for Bitcoin, Identity, and Knowledge sovereignty_

