# API Documentation: Public Profile URL System

**Last Updated:** October 24, 2025  
**Feature:** Public Profile URL System (Phase 3)  
**Endpoint:** `/.netlify/functions/unified-profiles`  
**Architecture:** Action-based routing with scope-based access control

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Actions Reference](#actions-reference)
5. [Error Handling](#error-handling)
6. [RLS Policies](#rls-policies)
7. [Helper Functions](#helper-functions)
8. [Privacy-First Analytics](#privacy-first-analytics)

---

## Overview

The Unified Profiles endpoint consolidates all profile-related operations into a single Netlify Function with action-based routing. This architecture reduces cold start overhead, improves maintainability, and provides consistent error handling.

### Base URL

```
Production:  https://www.satnam.pub/.netlify/functions/unified-profiles
Development: http://localhost:8888/.netlify/functions/unified-profiles
```

### Action-Based Routing

All requests must include an `action` parameter specifying the operation to perform:

```
GET  /.netlify/functions/unified-profiles?action={actionName}&{params}
POST /.netlify/functions/unified-profiles?action={actionName}
PATCH /.netlify/functions/unified-profiles?action={actionName}
```

### Supported Actions

| Action             | Scope  | HTTP Method | Authentication Required |
| ------------------ | ------ | ----------- | ----------------------- |
| `getProfile`       | public | GET         | No                      |
| `searchProfiles`   | public | GET         | No                      |
| `trackView`        | public | POST        | No                      |
| `updateVisibility` | user   | PATCH       | Yes (JWT)               |
| `getAnalytics`     | user   | GET         | Yes (JWT)               |

---

## Authentication

### Public-Scoped Actions

Public actions (`getProfile`, `searchProfiles`, `trackView`) do not require authentication and can be called anonymously.

### User-Scoped Actions

User actions (`updateVisibility`, `getAnalytics`) require JWT authentication via the `Authorization` header:

```http
Authorization: Bearer {jwt_token}
```

**JWT Token Requirements:**

- Issued by Satnam.pub authentication system
- Contains `userId` claim (user's DUID)
- Valid expiration timestamp
- HMAC-SHA256 signature

**Example:**

```javascript
const response = await fetch(
  "/.netlify/functions/unified-profiles?action=getAnalytics",
  {
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      "Content-Type": "application/json",
    },
  }
);
```

---

## Rate Limiting

**Limit:** 100 requests per hour per IP address  
**Scope:** Applies to all actions (shared rate limit)  
**Response:** HTTP 429 (Too Many Requests)

**Rate Limit Response:**

```json
{
  "success": false,
  "error": "Rate limit exceeded. Maximum 100 requests per hour."
}
```

**Headers:**

- `X-RateLimit-Limit: 100`
- `X-RateLimit-Remaining: {remaining}`
- `X-RateLimit-Reset: {timestamp}`

---

## Actions Reference

### 1. getProfile

**Description:** Retrieve a public profile by username or npub

**Scope:** Public (no authentication required)  
**HTTP Method:** GET

#### Request Parameters

| Parameter  | Type   | Required | Description                    |
| ---------- | ------ | -------- | ------------------------------ |
| `action`   | string | Yes      | Must be `"getProfile"`         |
| `username` | string | No\*     | Username to lookup             |
| `npub`     | string | No\*     | Nostr public key (npub format) |

\*Either `username` OR `npub` is required (not both)

#### TypeScript Types

```typescript
interface GetProfileRequest {
  action: "getProfile";
  username?: string;
  npub?: string;
}

interface GetProfileResponse {
  success: boolean;
  data?: PublicProfile;
  error?: string;
}

interface PublicProfile {
  id: string;
  username: string;
  npub: string;
  nip05?: string;
  lightning_address?: string;
  display_name?: string;
  bio?: string;
  picture?: string;
  website?: string;
  profile_visibility:
    | "public"
    | "contacts_only"
    | "trusted_contacts_only"
    | "private";
  profile_banner_url?: string;
  social_links?: Record<string, string>;
  is_discoverable: boolean;
  profile_views_count: number;
  analytics_enabled: boolean;
  verification_methods?: VerificationMethods;
  created_at: string;
  updated_at: string;
}
```

#### Example Request

```bash
# By username
curl "https://www.satnam.pub/.netlify/functions/unified-profiles?action=getProfile&username=alice"

# By npub
curl "https://www.satnam.pub/.netlify/functions/unified-profiles?action=getProfile&npub=npub1abc123..."
```

#### Example Response (Success)

```json
{
  "success": true,
  "data": {
    "id": "duid_abc123",
    "username": "alice",
    "npub": "npub1abc123...",
    "nip05": "alice@my.satnam.pub",
    "lightning_address": "alice@my.satnam.pub",
    "display_name": "Alice Smith",
    "bio": "Bitcoin educator and privacy advocate",
    "picture": "https://example.com/avatar.jpg",
    "website": "https://alice.com",
    "profile_visibility": "public",
    "is_discoverable": true,
    "profile_views_count": 142,
    "analytics_enabled": true,
    "verification_methods": {
      "physical_mfa_verified": true,
      "simpleproof_verified": true,
      "kind0_verified": true,
      "pkarr_verified": false,
      "iroh_dht_verified": false
    },
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-10-24T12:00:00Z"
  }
}
```

#### Error Responses

```json
// Profile not found
{
  "success": false,
  "error": "Profile not found"
}

// Profile is private
{
  "success": false,
  "error": "Profile is private or you do not have permission to view it"
}

// Missing parameters
{
  "success": false,
  "error": "Either username or npub parameter is required"
}
```

---

### 2. searchProfiles

**Description:** Search for public profiles by username, display name, or NIP-05

**Scope:** Public (no authentication required)  
**HTTP Method:** GET

#### Request Parameters

| Parameter | Type   | Required | Description                         |
| --------- | ------ | -------- | ----------------------------------- |
| `action`  | string | Yes      | Must be `"searchProfiles"`          |
| `q`       | string | Yes      | Search query (min 2 characters)     |
| `limit`   | number | No       | Max results (default: 20, max: 100) |

#### TypeScript Types

```typescript
interface SearchProfilesRequest {
  action: "searchProfiles";
  q: string;
  limit?: number;
}

interface SearchProfilesResponse {
  success: boolean;
  data?: PublicProfile[];
  error?: string;
}
```

#### Example Request

```bash
curl "https://www.satnam.pub/.netlify/functions/unified-profiles?action=searchProfiles&q=alice&limit=10"
```

#### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "duid_abc123",
      "username": "alice",
      "npub": "npub1abc123...",
      "display_name": "Alice Smith",
      "bio": "Bitcoin educator",
      "picture": "https://example.com/avatar.jpg",
      "profile_visibility": "public",
      "is_discoverable": true,
      "profile_views_count": 142,
      "analytics_enabled": true
    },
    {
      "id": "duid_def456",
      "username": "alice_btc",
      "npub": "npub1def456...",
      "display_name": "Alice Johnson",
      "bio": "Lightning developer",
      "picture": "https://example.com/avatar2.jpg",
      "profile_visibility": "public",
      "is_discoverable": true,
      "profile_views_count": 89,
      "analytics_enabled": false
    }
  ]
}
```

#### Search Behavior

- **Deduplication:** Results are deduplicated by `id` (DUID)
- **Visibility Filter:** Only profiles with `profile_visibility = 'public'` AND `is_discoverable = true`
- **Case-Insensitive:** Search is case-insensitive
- **Partial Matching:** Supports partial matches (e.g., "ali" matches "alice")
- **Fields Searched:** username, display_name, nip05

---

### 3. trackView

**Description:** Record a profile view (privacy-first analytics)

**Scope:** Public (no authentication required)  
**HTTP Method:** POST

#### Request Body

| Field         | Type   | Required | Description                                      |
| ------------- | ------ | -------- | ------------------------------------------------ |
| `action`      | string | Yes      | Must be `"trackView"`                            |
| `profile_id`  | string | Yes      | DUID of profile being viewed                     |
| `viewer_hash` | string | Yes      | SHA-256 hash of viewer identity (first 50 chars) |
| `referrer`    | string | No       | Referrer domain (not full URL)                   |

#### TypeScript Types

```typescript
interface TrackViewRequest {
  action: "trackView";
  profile_id: string;
  viewer_hash: string;
  referrer?: string;
}

interface TrackViewResponse {
  success: boolean;
  error?: string;
}
```

#### Example Request

```javascript
const viewerHash = await crypto.subtle
  .digest("SHA-256", new TextEncoder().encode(viewerIdentity))
  .then((buf) =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 50)
  );

const response = await fetch(
  "/.netlify/functions/unified-profiles?action=trackView",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile_id: "duid_abc123",
      viewer_hash: viewerHash,
      referrer: "twitter.com",
    }),
  }
);
```

#### Example Response

```json
{
  "success": true
}
```

#### Privacy Protections

- ✅ Viewer identity is hashed (SHA-256, first 50 chars only)
- ✅ No IP addresses stored
- ✅ No tracking cookies
- ✅ Referrer domain only (no full URLs)
- ✅ Aggregated data only (no individual tracking)

---

### 4. updateVisibility

**Description:** Update profile visibility settings

**Scope:** User (JWT authentication required)  
**HTTP Method:** PATCH

#### Request Body

| Field               | Type    | Required | Description                   |
| ------------------- | ------- | -------- | ----------------------------- |
| `action`            | string  | Yes      | Must be `"updateVisibility"`  |
| `visibility`        | string  | No       | Visibility mode               |
| `is_discoverable`   | boolean | No       | Enable search discoverability |
| `analytics_enabled` | boolean | No       | Enable analytics tracking     |

#### TypeScript Types

```typescript
type ProfileVisibility =
  | "public"
  | "contacts_only"
  | "trusted_contacts_only"
  | "private";

interface UpdateVisibilityRequest {
  action: "updateVisibility";
  visibility?: ProfileVisibility;
  is_discoverable?: boolean;
  analytics_enabled?: boolean;
}

interface UpdateVisibilityResponse {
  success: boolean;
  error?: string;
}
```

#### Example Request

```javascript
const response = await fetch(
  "/.netlify/functions/unified-profiles?action=updateVisibility",
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      visibility: "public",
      is_discoverable: true,
      analytics_enabled: true,
    }),
  }
);
```

#### Example Response

```json
{
  "success": true
}
```

---

### 5. getAnalytics

**Description:** Get profile analytics data (owner only)

**Scope:** User (JWT authentication required)  
**HTTP Method:** GET

#### Request Parameters

| Parameter | Type   | Required | Description                                |
| --------- | ------ | -------- | ------------------------------------------ |
| `action`  | string | Yes      | Must be `"getAnalytics"`                   |
| `days`    | number | No       | Time range in days (default: 30, max: 365) |

#### TypeScript Types

```typescript
interface GetAnalyticsRequest {
  action: "getAnalytics";
  days?: number;
}

interface GetAnalyticsResponse {
  success: boolean;
  data?: ProfileAnalyticsData;
  error?: string;
}

interface ProfileAnalyticsData {
  total_views: number;
  recent_views: Array<{
    viewed_at: string;
    referrer?: string;
  }>;
}
```

#### Example Request

```bash
curl -H "Authorization: Bearer ${JWT_TOKEN}" \
  "https://www.satnam.pub/.netlify/functions/unified-profiles?action=getAnalytics&days=7"
```

#### Example Response

```json
{
  "success": true,
  "data": {
    "total_views": 142,
    "recent_views": [
      {
        "viewed_at": "2025-10-24T12:34:56Z",
        "referrer": "twitter.com"
      },
      {
        "viewed_at": "2025-10-24T11:20:30Z",
        "referrer": "github.com"
      },
      {
        "viewed_at": "2025-10-23T18:45:12Z"
      }
    ]
  }
}
```

---

## Error Handling

### Standard Error Response

```typescript
interface ErrorResponse {
  success: false;
  error: string;
}
```

### HTTP Status Codes

| Code | Meaning               | Example                                        |
| ---- | --------------------- | ---------------------------------------------- |
| 200  | Success               | Profile retrieved successfully                 |
| 400  | Bad Request           | Missing required parameters                    |
| 401  | Unauthorized          | Invalid or missing JWT token                   |
| 403  | Forbidden             | Profile is private or insufficient permissions |
| 404  | Not Found             | Profile does not exist                         |
| 429  | Too Many Requests     | Rate limit exceeded                            |
| 500  | Internal Server Error | Database error or unexpected exception         |
| 503  | Service Unavailable   | Feature flag disabled                          |

### Common Error Messages

```json
// Feature disabled
{
  "success": false,
  "error": "Public profiles feature is disabled"
}

// Invalid action
{
  "success": false,
  "error": "Invalid or missing action parameter"
}

// Authentication required
{
  "success": false,
  "error": "Authentication required for this action"
}

// Invalid JWT
{
  "success": false,
  "error": "Invalid or expired token"
}
```

---

## RLS Policies

Row-Level Security (RLS) policies enforce access control at the database level.

### Policy: `public_profiles_select`

**Table:** `user_identities`  
**Operation:** SELECT  
**Description:** Allow public access to profiles with `profile_visibility = 'public'`

```sql
CREATE POLICY public_profiles_select ON user_identities
FOR SELECT
USING (profile_visibility = 'public');
```

### Policy: `contacts_only_profiles_select`

**Table:** `user_identities`  
**Operation:** SELECT  
**Description:** Allow contacts to view profiles with `profile_visibility = 'contacts_only'`

```sql
CREATE POLICY contacts_only_profiles_select ON user_identities
FOR SELECT
USING (
  profile_visibility = 'contacts_only'
  AND is_contact_of_owner(id, get_current_user_duid())
);
```

### Policy: `trusted_contacts_only_profiles_select`

**Table:** `user_identities`  
**Operation:** SELECT  
**Description:** Allow trusted contacts to view profiles with `profile_visibility = 'trusted_contacts_only'`

```sql
CREATE POLICY trusted_contacts_only_profiles_select ON user_identities
FOR SELECT
USING (
  profile_visibility = 'trusted_contacts_only'
  AND is_trusted_contact_of_owner(id, get_current_user_duid())
);
```

---

## Helper Functions

### `get_current_user_duid()`

**Description:** Resolves the current viewer's DUID from session context or JWT claims

**Returns:** `TEXT` (DUID) or `NULL` (anonymous)

**SQL Definition:**

```sql
CREATE OR REPLACE FUNCTION get_current_user_duid()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'userId',
    NULL
  );
END;
$$;
```

---

### `is_contact_of_owner(p_owner_duid TEXT, p_viewer_duid TEXT)`

**Description:** Checks if viewer is in owner's encrypted_contacts list

**Parameters:**

- `p_owner_duid`: Profile owner's DUID
- `p_viewer_duid`: Viewer's DUID

**Returns:** `BOOLEAN`

**SQL Definition:**

```sql
CREATE OR REPLACE FUNCTION is_contact_of_owner(
  p_owner_duid TEXT,
  p_viewer_duid TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM encrypted_contacts
    WHERE owner_hash = p_owner_duid
      AND contact_hash = p_viewer_duid
  );
END;
$$;
```

---

### `is_trusted_contact_of_owner(p_owner_duid TEXT, p_viewer_duid TEXT)`

**Description:** Checks if viewer is a trusted contact (verification_level IN ('verified', 'trusted'))

**Parameters:**

- `p_owner_duid`: Profile owner's DUID
- `p_viewer_duid`: Viewer's DUID

**Returns:** `BOOLEAN`

**SQL Definition:**

```sql
CREATE OR REPLACE FUNCTION is_trusted_contact_of_owner(
  p_owner_duid TEXT,
  p_viewer_duid TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM encrypted_contacts
    WHERE owner_hash = p_owner_duid
      AND contact_hash = p_viewer_duid
      AND verification_level IN ('verified', 'trusted')
  );
END;
$$;
```

---

## Privacy-First Analytics

### Hashed Viewer Identity

Viewer identities are hashed using SHA-256 (first 50 characters only) to prevent PII storage:

```javascript
const viewerIdentity = `${npub || "anonymous"}_${Date.now()}`;
const hashBuffer = await crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(viewerIdentity)
);
const viewerHash = Array.from(new Uint8Array(hashBuffer))
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("")
  .substring(0, 50);
```

### Data Retention

- **Profile Views:** Retained indefinitely (aggregated data only)
- **Recent Views:** Last 100 views per profile
- **Referrer Data:** Domain only (no full URLs)

### Owner-Only Access

Analytics data is only accessible to the profile owner via JWT authentication. No third-party access is permitted.

---

## Feature Flags

### `VITE_PUBLIC_PROFILES_ENABLED`

**Type:** Boolean
**Default:** `false`
**Description:** Master feature flag for Public Profile URL System

**Behavior:**

- When `false`: All unified-profiles actions return HTTP 503 (Service Unavailable)
- When `true`: All actions are enabled based on scope and authentication

**Environment Configuration:**

```bash
# .env (local development)
VITE_PUBLIC_PROFILES_ENABLED=true

# netlify.toml (build environment)
[build.environment]
VITE_PUBLIC_PROFILES_ENABLED = "true"

# Netlify Dashboard (production)
VITE_PUBLIC_PROFILES_ENABLED=true
```

---

## CORS Configuration

**Allowed Origins:**

- Production: `https://www.satnam.pub`
- Development: `http://localhost:8888`, `http://localhost:5173`

**Allowed Methods:** `GET, POST, PATCH, OPTIONS`

**Allowed Headers:** `Content-Type, Authorization`

**CORS Headers:**

```http
Access-Control-Allow-Origin: https://www.satnam.pub
Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Vary: Origin
Content-Security-Policy: default-src 'none'
```

---

## Backward Compatibility

### Deprecated Endpoints

The following endpoints are deprecated and redirect to the unified function:

| Old Endpoint                             | New Endpoint                                                   | Status       |
| ---------------------------------------- | -------------------------------------------------------------- | ------------ |
| `/.netlify/functions/profile`            | `/.netlify/functions/unified-profiles?action=getProfile`       | 301 Redirect |
| `/.netlify/functions/profile-visibility` | `/.netlify/functions/unified-profiles?action=updateVisibility` | 301 Redirect |
| `/.netlify/functions/profile-analytics`  | `/.netlify/functions/unified-profiles?action=getAnalytics`     | 301 Redirect |
| `/.netlify/functions/profile-view`       | `/.netlify/functions/unified-profiles?action=trackView`        | 301 Redirect |
| `/.netlify/functions/search-profiles`    | `/.netlify/functions/unified-profiles?action=searchProfiles`   | 301 Redirect |

**Migration Timeline:**

- **Phase 1 (Current):** Redirects active, old endpoints deprecated
- **Phase 2 (30 days):** Old endpoints removed, redirects remain
- **Phase 3 (90 days):** Redirects removed, unified endpoint only

---

## Code Examples

### JavaScript/TypeScript Client

```typescript
import { ProfileAPI } from "@/lib/api/profile-endpoints";

// Get public profile by username
const { success, data, error } = await ProfileAPI.getPublicProfileByUsername(
  "alice"
);

if (success && data) {
  console.log("Profile:", data);
} else {
  console.error("Error:", error);
}

// Search profiles
const searchResults = await ProfileAPI.searchProfiles("alice", 10);

// Update visibility (requires authentication)
const token = getJWTToken(); // Your auth implementation
await ProfileAPI.updateProfileSettings(token, {
  visibility: "public",
  is_discoverable: true,
  analytics_enabled: true,
});

// Get analytics (requires authentication)
const analytics = await ProfileAPI.getProfileAnalytics(token, 30);
console.log("Total views:", analytics.data?.total_views);

// Track profile view
const viewerHash = await generateViewerHash();
await ProfileAPI.recordProfileView("duid_abc123", viewerHash, "twitter.com");
```

### cURL Examples

```bash
# Get profile by username
curl "https://www.satnam.pub/.netlify/functions/unified-profiles?action=getProfile&username=alice"

# Search profiles
curl "https://www.satnam.pub/.netlify/functions/unified-profiles?action=searchProfiles&q=alice&limit=10"

# Update visibility (requires JWT)
curl -X PATCH \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"visibility":"public","is_discoverable":true}' \
  "https://www.satnam.pub/.netlify/functions/unified-profiles?action=updateVisibility"

# Get analytics (requires JWT)
curl -H "Authorization: Bearer ${JWT_TOKEN}" \
  "https://www.satnam.pub/.netlify/functions/unified-profiles?action=getAnalytics&days=30"

# Track view
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"profile_id":"duid_abc123","viewer_hash":"abc123...","referrer":"twitter.com"}' \
  "https://www.satnam.pub/.netlify/functions/unified-profiles?action=trackView"
```

---

## Performance Considerations

### Cold Start Optimization

- **Unified Function:** Single cold start for all profile operations (~80% reduction vs. 5 separate functions)
- **Shared Memory Pool:** Reduced memory allocation overhead
- **Lazy Loading:** Dependencies loaded on-demand per action

### Caching Recommendations

**Client-Side:**

- Cache public profiles for 5 minutes (stale-while-revalidate)
- Cache search results for 1 minute
- Do not cache user-scoped actions (updateVisibility, getAnalytics)

**CDN/Edge:**

- Cache public profile GET requests for 1 minute
- Do not cache authenticated requests
- Vary cache by query parameters

**Example Cache-Control Headers:**

```http
# Public profiles
Cache-Control: public, max-age=60, stale-while-revalidate=300

# Authenticated requests
Cache-Control: private, no-cache, no-store, must-revalidate
```

---

## Security Best Practices

### For API Consumers

1. ✅ **Always validate JWT tokens** before making user-scoped requests
2. ✅ **Use HTTPS only** (never HTTP in production)
3. ✅ **Implement rate limiting** on client-side to avoid 429 errors
4. ✅ **Sanitize user input** before passing to API (XSS prevention)
5. ✅ **Handle errors gracefully** with user-friendly messages
6. ✅ **Never log sensitive data** (JWT tokens, viewer hashes, etc.)

### For Profile Owners

1. ✅ **Review visibility settings** regularly
2. ✅ **Monitor analytics** for suspicious view patterns
3. ✅ **Use strong passwords** for NIP-05/password authentication
4. ✅ **Enable Physical MFA** for highest security
5. ✅ **Audit contacts list** periodically

---

## Troubleshooting

### Common Issues

**Issue:** "Profile is private or you do not have permission to view it"
**Solution:** Check profile visibility mode and ensure you're in the owner's contacts list

**Issue:** "Rate limit exceeded"
**Solution:** Wait 1 hour or implement exponential backoff on client-side

**Issue:** "Invalid or expired token"
**Solution:** Refresh JWT token using authentication system

**Issue:** "Feature disabled" (HTTP 503)
**Solution:** Verify `VITE_PUBLIC_PROFILES_ENABLED=true` in environment variables

**Issue:** "Profile not found"
**Solution:** Verify username/npub is correct and profile exists

---

## Support and Resources

- **GitHub Repository:** https://github.com/OV1-Kenobi/satnam_pub
- **API Issues:** https://github.com/OV1-Kenobi/satnam_pub/issues
- **User Guide:** [docs/USER_GUIDE_PUBLIC_PROFILES.md](./USER_GUIDE_PUBLIC_PROFILES.md)
- **Deployment Summary:** [docs/PHASE3_NETLIFY_FUNCTIONS_CONSOLIDATION_SUMMARY.md](./PHASE3_NETLIFY_FUNCTIONS_CONSOLIDATION_SUMMARY.md)

---

**Privacy-First. User-Sovereign. Zero-Knowledge.**
