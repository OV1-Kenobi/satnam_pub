# Phase 1: NIP-85 API Specifications & Examples

---

## 1. Public Trust Query API

### Endpoint: `GET /api/trust/query`

**Purpose**: Query public trust scores for any Nostr user

**Authentication**: None (rate limited by IP)

**Rate Limiting**: 100 requests/hour per IP

**Query Parameters**:
```
npub (required)     - Nostr public key (npub1... or hex)
metrics (optional)  - Comma-separated list of metrics to return
                      Default: all visible metrics
```

**Response (200 OK)**:
```json
{
  "success": true,
  "pubkey": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
  "exposure_level": "public",
  "metrics": {
    "rank": 85,
    "followers": 1500,
    "hops": 2,
    "influence": 72,
    "reliability": 90,
    "recency": 95,
    "composite": 82
  },
  "relay_hints": ["wss://relay.satnam.pub"],
  "published_at": "2025-10-22T12:00:00Z"
}
```

**Error Responses**:

```json
// 400 Bad Request - Missing npub
{
  "error": "Missing npub parameter"
}

// 404 Not Found - User not found
{
  "error": "User not found"
}

// 403 Forbidden - User has not shared trust scores
{
  "error": "User has not shared trust scores"
}

// 429 Too Many Requests - Rate limit exceeded
{
  "error": "Rate limit exceeded"
}
```

**Example Requests**:

```bash
# Query with npub
curl "https://satnam.pub/api/trust/query?npub=npub1..."

# Query with hex pubkey
curl "https://satnam.pub/api/trust/query?npub=3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"

# Query specific metrics
curl "https://satnam.pub/api/trust/query?npub=npub1...&metrics=rank,followers,composite"
```

**JavaScript Example**:
```typescript
async function queryTrustScore(npub: string) {
  const response = await fetch(
    `/api/trust/query?npub=${encodeURIComponent(npub)}`
  );
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response.json();
}

// Usage
const trustScore = await queryTrustScore("npub1...");
console.log(`Trust rank: ${trustScore.metrics.rank}/100`);
```

---

## 2. Provider Configuration API

### Endpoint: `GET /api/trust/provider-config`

**Purpose**: Get Satnam.pub trust provider configuration

**Authentication**: None

**Response (200 OK)**:
```json
{
  "provider": {
    "name": "Satnam.pub",
    "pubkey": "satnam_provider_pubkey_hex",
    "description": "Bitcoin-only, privacy-first trust provider",
    "website": "https://satnam.pub"
  },
  "supported_metrics": [
    {
      "name": "rank",
      "description": "Composite trust rank (0-100)",
      "type": "number"
    },
    {
      "name": "followers",
      "description": "Number of followers",
      "type": "number"
    },
    {
      "name": "hops",
      "description": "Network distance (degrees of separation)",
      "type": "number"
    },
    {
      "name": "influence",
      "description": "PageRank-style influence score (0-100)",
      "type": "number"
    },
    {
      "name": "reliability",
      "description": "Action-based reliability score (0-100)",
      "type": "number"
    },
    {
      "name": "recency",
      "description": "Activity recency score (0-100)",
      "type": "number"
    },
    {
      "name": "composite",
      "description": "Weighted composite score (0-100)",
      "type": "number"
    }
  ],
  "relay_urls": ["wss://relay.satnam.pub"],
  "api_documentation": "https://satnam.pub/docs/trust-api",
  "nip85_kinds": [30382, 30383, 30384, 10040]
}
```

**Example Request**:
```bash
curl "https://satnam.pub/api/trust/provider-config"
```

---

## 3. User Preferences API

### Endpoint: `GET /api/trust/preferences`

**Purpose**: Get current user's trust provider preferences

**Authentication**: JWT (required)

**Response (200 OK)**:
```json
{
  "exposure_level": "public",
  "visible_metrics": ["rank", "followers", "composite"],
  "whitelisted_pubkeys": [],
  "encryption_enabled": false,
  "created_at": "2025-10-22T10:00:00Z",
  "updated_at": "2025-10-22T12:00:00Z"
}
```

---

### Endpoint: `POST /api/trust/preferences`

**Purpose**: Update user's trust provider preferences

**Authentication**: JWT (required)

**Request Body**:
```json
{
  "exposure_level": "public",
  "visible_metrics": ["rank", "followers", "hops", "composite"],
  "whitelisted_pubkeys": ["npub1...", "npub1..."],
  "encryption_enabled": true
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Preferences updated successfully"
}
```

**Validation Rules**:
- `exposure_level`: Must be one of: public, contacts, whitelist, private
- `visible_metrics`: Array of valid metric names
- `whitelisted_pubkeys`: Array of valid npub/hex pubkeys
- `encryption_enabled`: Boolean

---

## 4. Manual Publish API

### Endpoint: `POST /api/trust/publish`

**Purpose**: Manually publish trust scores to Nostr relays

**Authentication**: JWT (required)

**Request Body**:
```json
{
  "target_pubkey": "npub1...",
  "relay_urls": ["wss://relay.satnam.pub"]
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "event_id": "event_id_hex",
  "published_at": "2025-10-22T12:00:00Z",
  "relay_urls": ["wss://relay.satnam.pub"]
}
```

**Error Response (403 Forbidden)**:
```json
{
  "error": "User has disabled public trust score publishing"
}
```

---

## 5. NIP-85 Event Formats

### Kind 30382: User-Level Assertion

```json
{
  "kind": 30382,
  "tags": [
    ["d", "target_pubkey_hex"],
    ["rank", "85"],
    ["followers", "1500"],
    ["hops", "2"],
    ["influence", "72"],
    ["reliability", "90"],
    ["recency", "95"],
    ["composite", "82"],
    ["relay", "wss://relay.satnam.pub"]
  ],
  "content": "",
  "created_at": 1729610400,
  "pubkey": "satnam_provider_pubkey_hex",
  "sig": "event_signature_hex"
}
```

### Kind 10040: Provider Declaration

```json
{
  "kind": 10040,
  "tags": [
    ["d", "satnam-trust-provider"],
    ["name", "Satnam.pub Trust Provider"],
    ["description", "Publishes trust scores for Satnam.pub users"],
    ["kinds", "30382", "30383", "30384"],
    ["relay", "wss://relay.satnam.pub"]
  ],
  "content": "Satnam.pub publishes NIP-85 trust assertions",
  "created_at": 1729610400,
  "pubkey": "satnam_provider_pubkey_hex",
  "sig": "event_signature_hex"
}
```

---

## 6. Audit Logging

All trust queries are logged with:
- Queried user ID
- Querier pubkey (if available)
- Query type (api, relay, internal)
- IP hash (SHA-256, first 16 chars)
- User-Agent hash (SHA-256, first 16 chars)
- Success/failure status
- Metrics returned
- Timestamp

**Privacy Note**: IP and User-Agent are hashed to prevent tracking while maintaining audit trail.

---

## 7. Rate Limiting

### API Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/trust/query` | 100 | 1 hour per IP |
| `/api/trust/preferences` | 10 | 1 hour per user |
| `/api/trust/publish` | 10 | 1 hour per user |

### Publishing Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| Publish user assertion | 100 | 1 hour per user |
| Publish provider declaration | 1 | 1 day |

---

## 8. Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Missing/invalid JWT |
| 403 | Forbidden | User privacy settings prevent access |
| 404 | Not Found | User not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

---

## 9. CORS Configuration

All public endpoints support CORS:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## 10. Integration Examples

### Nostr Client Integration

```typescript
// Query trust score for a user
async function getTrustScore(npub: string) {
  const response = await fetch(
    `https://satnam.pub/api/trust/query?npub=${npub}`
  );
  return response.json();
}

// Display in UI
const trustScore = await getTrustScore(userNpub);
if (trustScore.success) {
  console.log(`${userNpub} has rank ${trustScore.metrics.rank}`);
}
```

### Relay Query

```typescript
// Query kind 30382 events directly from relay
const events = await relay.list([
  {
    kinds: [30382],
    "#d": [targetPubkeyHex],
  },
]);

// Parse metrics from tags
const metrics = {};
for (const tag of events[0].tags) {
  if (!["d", "relay"].includes(tag[0])) {
    metrics[tag[0]] = tag[1];
  }
}
```

---

## 11. Deployment Checklist

- [ ] Database migration applied
- [ ] Feature flags enabled in production
- [ ] Netlify functions deployed
- [ ] CEPS integration tested
- [ ] Relay connectivity verified
- [ ] Rate limiting configured
- [ ] Monitoring/alerting set up
- [ ] Documentation published
- [ ] Security audit completed
- [ ] Load testing passed


