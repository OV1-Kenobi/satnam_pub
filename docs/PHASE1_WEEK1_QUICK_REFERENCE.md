# Phase 1 Week 1 - Quick Reference Guide

## What Was Implemented

### 1. PubkyDHTClient (lib/pubky-enhanced-client.ts)
```typescript
// Usage
const dhtClient = new PubkyDHTClient(relays, cacheTtl, timeout, debug);

// Publish a record
await dhtClient.publishRecord(record);

// Resolve a record
const record = await dhtClient.resolveRecord(publicKey);

// Clear cache
dhtClient.clearCache();
```

### 2. HybridNIP05Verifier (src/lib/nip05-verification.ts)
```typescript
// Usage
const verifier = new HybridNIP05Verifier({
  enableKind0Resolution: true,
  enablePkarrResolution: true,
  enableDnsResolution: true,
});

// Verify with hybrid method
const result = await verifier.verifyHybrid(identifier, pubkey);
// Returns: { verified, pubkey, nip05, name, picture, about, verificationMethod, ... }
```

### 3. CEPS kind:0 Resolution (lib/central_event_publishing_service.ts)
```typescript
// Usage
const ceps = new CentralEventPublishingService(config);
const identity = await ceps.resolveIdentityFromKind0(pubkey);
// Returns: { success, nip05, name, picture, about, error }
```

### 4. PKARR API Endpoints

#### Publish Endpoint
```bash
POST /.netlify/functions/pkarr-publish
Content-Type: application/json

{
  "public_key": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
  "records": [
    {
      "name": "@",
      "type": "TXT",
      "value": "v=nostr1 pubkey=...",
      "ttl": 3600
    }
  ],
  "timestamp": 1697000000,
  "sequence": 1,
  "signature": "..."
}
```

#### Resolve Endpoint
```bash
GET /.netlify/functions/pkarr-resolve?public_key=3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d
```

### 5. Enhanced NIP-05 Resolver
```bash
# Standard DNS resolution
GET /.netlify/functions/nip05-resolver?nip05=user@example.com

# With hybrid verification
GET /.netlify/functions/nip05-resolver?nip05=user@example.com&hybrid=true&pubkey=3bf0c63...
```

---

## Feature Flags

### Enable Hybrid Identity Verification
```bash
VITE_HYBRID_IDENTITY_ENABLED=true
```

### Enable PKARR Integration
```bash
VITE_PKARR_ENABLED=true
```

---

## Database Schema

### pkarr_records Table
```sql
CREATE TABLE pkarr_records (
  id UUID PRIMARY KEY,
  public_key VARCHAR(64) UNIQUE,      -- Ed25519 public key
  z32_address VARCHAR(52) UNIQUE,     -- z-base-32 encoded
  records JSONB,                      -- DNS records
  timestamp BIGINT,                   -- Unix timestamp
  sequence INTEGER,                   -- Update sequence
  signature VARCHAR(128),             -- Ed25519 signature
  verified BOOLEAN,                   -- Signature verified
  relay_urls TEXT[],                  -- Published relays
  ttl INTEGER,                        -- Time to live
  cache_expires_at BIGINT,            -- Cache expiration
  created_at BIGINT,
  updated_at BIGINT
);
```

### pkarr_resolution_cache Table
```sql
CREATE TABLE pkarr_resolution_cache (
  id UUID PRIMARY KEY,
  query_key VARCHAR(64) UNIQUE,       -- Public key or z32
  resolved_record JSONB,              -- Full record
  expires_at BIGINT,                  -- Cache expiration
  relay_source VARCHAR(255),          -- Source relay
  resolution_time_ms INTEGER,         -- Query time
  success BOOLEAN,
  created_at BIGINT,
  accessed_at BIGINT
);
```

### pkarr_publish_history Table
```sql
CREATE TABLE pkarr_publish_history (
  id UUID PRIMARY KEY,
  pkarr_record_id UUID,               -- Record reference
  relay_url VARCHAR(255),             -- Target relay
  publish_timestamp BIGINT,           -- When published
  success BOOLEAN,                    -- Success status
  status_code INTEGER,                -- HTTP status
  error_message TEXT,                 -- Error details
  response_time_ms INTEGER,           -- Response time
  attempt_number INTEGER,             -- Retry attempt
  created_at BIGINT
);
```

---

## Verification Flow

### Priority Order
1. **kind:0 Metadata** - Fastest, most decentralized
2. **PKARR (DHT)** - Decentralized, fallback
3. **DNS (NIP-05)** - Centralized, reliable fallback

### Example Flow
```
User requests verification of "alice@satnam.pub"
  ↓
Check cache (5 min TTL)
  ↓
Try kind:0 resolution (3 sec timeout)
  ├─ Success → Return with method="kind:0"
  └─ Fail → Continue
  ↓
Try PKARR resolution (3 sec timeout)
  ├─ Success → Return with method="pkarr"
  └─ Fail → Continue
  ↓
Try DNS resolution (5 sec timeout)
  ├─ Success → Return with method="dns"
  └─ Fail → Return error
```

---

## Testing

### Run Tests
```bash
npm test tests/nip05-resolver.integration.test.ts
```

### Test Coverage
- ✅ Standard NIP-05 resolution
- ✅ Hybrid verification with pubkey
- ✅ Missing did.json handling
- ✅ Issuer registry lookup
- ✅ Cache behavior

---

## Configuration Examples

### Enable All Features
```typescript
// .env.local
VITE_HYBRID_IDENTITY_ENABLED=true
VITE_PKARR_ENABLED=true
```

### Hybrid Verifier Config
```typescript
const verifier = new HybridNIP05Verifier({
  enableKind0Resolution: true,
  enablePkarrResolution: true,
  enableDnsResolution: true,
  kind0Timeout: 3000,
  pkarrTimeout: 3000,
  cache_duration_ms: 300000, // 5 minutes
});
```

### PubkyDHTClient Config
```typescript
const dhtClient = new PubkyDHTClient(
  [
    "https://pkarr.relay.pubky.tech",
    "https://pkarr.relay.synonym.to",
  ],
  3600000,  // 1 hour cache TTL
  5000,     // 5 second timeout
  true      // debug logging
);
```

---

## Rate Limiting

### nip05-resolver
- **Limit**: 60 requests per 60 seconds per IP
- **Status Code**: 429 Too Many Requests

### pkarr-publish
- **Limit**: 30 requests per 60 seconds per IP
- **Status Code**: 429 Too Many Requests

### pkarr-resolve
- **Limit**: 60 requests per 60 seconds per IP
- **Status Code**: 429 Too Many Requests

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "PKARR integration is not enabled" | Feature flag disabled | Set `VITE_PKARR_ENABLED=true` |
| "Invalid public key format" | Wrong format | Use 64 hex characters |
| "Sequence number must be greater" | Replay attack | Use higher sequence number |
| "Too many requests" | Rate limited | Wait before retrying |
| "All verification methods failed" | No method succeeded | Check network connectivity |

---

## Next Week (Week 2)

- [ ] Integrate kind:0 resolution into HybridNIP05Verifier
- [ ] Integrate PKARR resolution into HybridNIP05Verifier
- [ ] Create client-side UI components
- [ ] Add verification method selection UI
- [ ] Performance benchmarking
- [ ] Relay connectivity testing

---

## Files Reference

| File | Purpose |
|------|---------|
| `lib/pubky-enhanced-client.ts` | PubkyDHTClient implementation |
| `lib/central_event_publishing_service.ts` | CEPS kind:0 resolution |
| `src/lib/nip05-verification.ts` | HybridNIP05Verifier class |
| `src/config/env.client.ts` | Feature flags |
| `netlify/functions_active/nip05-resolver.ts` | Enhanced NIP-05 resolver |
| `netlify/functions_active/pkarr-publish.ts` | PKARR publish endpoint |
| `netlify/functions_active/pkarr-resolve.ts` | PKARR resolve endpoint |
| `database/migrations/029_pkarr_records_integration.sql` | Database schema |
| `tests/nip05-resolver.integration.test.ts` | Integration tests |

---

## Support

For issues or questions:
1. Check `PHASE1_WEEK1_IMPLEMENTATION_SUMMARY.md` for detailed documentation
2. Review code comments in implementation files
3. Run tests to verify functionality
4. Check feature flag configuration

