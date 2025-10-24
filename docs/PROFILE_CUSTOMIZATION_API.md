# Profile Customization API Reference

**Phase 4: Profile Customization System**  
**Version:** 1.0  
**Last Updated:** 2025-10-24

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Endpoints](#endpoints)
4. [Data Models](#data-models)
5. [Validation Rules](#validation-rules)
6. [Error Handling](#error-handling)
7. [Examples](#examples)

---

## Overview

The Profile Customization API provides endpoints for managing user profile customizations including themes, banners, and social links. All endpoints use the unified profiles function with action-based routing.

**Base URL:** `/.netlify/functions/unified-profiles`

### Phase 5A: Multi-Server Blossom Support

The banner upload system supports multiple Blossom servers with automatic failover:

- **Primary Server**: Configured via `VITE_BLOSSOM_PRIMARY_URL` (e.g., self-hosted)
- **Fallback Server**: Configured via `VITE_BLOSSOM_FALLBACK_URL` (e.g., nostr.build)
- **Automatic Failover**: Seamless switching if primary server fails or times out
- **Retry Logic**: Configurable retry attempts per server with exponential backoff
- **Health Tracking**: Server success/failure statistics for monitoring

**Configuration:**

```bash
VITE_BLOSSOM_PRIMARY_URL=https://blossom.satnam.pub
VITE_BLOSSOM_FALLBACK_URL=https://blossom.nostr.build
VITE_BLOSSOM_TIMEOUT_MS=30000
VITE_BLOSSOM_RETRY_ATTEMPTS=2
```

**Upload Response includes server used:**

```json
{
  "success": true,
  "url": "https://blossom.satnam.pub/abc123.jpg",
  "sha256": "abc123...",
  "size": 123456,
  "type": "image/jpeg",
  "serverUsed": "https://blossom.satnam.pub"
}
```

**Server Health Monitoring:**

```typescript
import { getServerHealthStats } from "../../src/lib/api/blossom-client";

const stats = getServerHealthStats();
// Returns array of server health objects with success/failure counts
```

---

## Authentication

All customization endpoints require JWT authentication.

### Request Headers

```http
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

### Obtaining a JWT Token

JWT tokens are issued during login and stored in the client session. See authentication documentation for details.

---

## Endpoints

### 1. Update Theme

Update user's profile theme customization.

**Endpoint:** `GET /unified-profiles?action=updateTheme`  
**Method:** `PATCH`  
**Auth:** Required  
**Scope:** User

#### Request Body

```typescript
{
  theme: ProfileTheme;
}
```

#### Response

**Success (200):**

```json
{
  "success": true,
  "data": {
    "profile_theme": {
      "colorScheme": { ... },
      "typography": { ... },
      "layout": { ... },
      "version": "1.0"
    }
  }
}
```

**Error (400):**

```json
{
  "success": false,
  "error": "Invalid theme data"
}
```

**Error (503):**

```json
{
  "success": false,
  "error": "Profile customization is not enabled"
}
```

---

### 2. Update Banner

Update user's profile banner image.

**Endpoint:** `GET /unified-profiles?action=updateBanner`  
**Method:** `PATCH`  
**Auth:** Required  
**Scope:** User

#### Request Body

```typescript
{
  bannerUrl: string; // HTTPS URL or data URL (<500KB)
}
```

#### Response

**Success (200):**

```json
{
  "success": true,
  "data": {
    "profile_banner_url": "https://blossom.nostr.build/abc123.jpg"
  }
}
```

**Error (400):**

```json
{
  "success": false,
  "error": "Invalid banner URL"
}
```

---

### 3. Update Social Links

Update user's social links.

**Endpoint:** `GET /unified-profiles?action=updateSocialLinks`  
**Method:** `PATCH`  
**Auth:** Required  
**Scope:** User

#### Request Body

```typescript
{
  links: SocialLink[] // Max 10 links
}
```

#### Response

**Success (200):**

```json
{
  "success": true,
  "data": {
    "social_links": {
      "0": { "id": "link-1", "platform": "twitter", ... },
      "1": { "id": "link-2", "platform": "github", ... }
    }
  }
}
```

**Error (400):**

```json
{
  "success": false,
  "error": "Maximum 10 social links allowed"
}
```

---

## Data Models

### ProfileTheme

```typescript
interface ProfileTheme {
  colorScheme: {
    primary: string; // Hex color (e.g., "#8b5cf6")
    secondary: string; // Hex color
    background: string; // Hex color
    text: string; // Hex color
    accent: string; // Hex color
  };
  typography: {
    fontFamily: string; // Font name (e.g., "Inter")
    fontSize: string; // CSS size (e.g., "16px")
    lineHeight: string; // CSS line height (e.g., "1.5")
  };
  layout: {
    maxWidth: string; // CSS width (e.g., "1200px")
    spacing: "compact" | "normal" | "relaxed";
    borderRadius: string; // CSS radius (e.g., "8px")
  };
  version: string; // Schema version (e.g., "1.0")
}
```

### SocialLink

```typescript
interface SocialLink {
  id: string; // Unique identifier
  platform: SocialLinkPlatform; // Platform type
  url: string; // Full URL or handle
  label?: string; // Optional custom label (max 50 chars)
  order: number; // Display order (0-indexed)
}

type SocialLinkPlatform =
  | "twitter"
  | "github"
  | "telegram"
  | "nostr"
  | "lightning"
  | "website"
  | "youtube"
  | "linkedin"
  | "instagram"
  | "facebook";
```

### BannerUploadRequest

```typescript
interface BannerUploadRequest {
  bannerUrl: string; // HTTPS URL or data URL
}
```

---

## Validation Rules

### Theme Validation

- **Color Scheme**: All colors must be valid hex codes (e.g., `#8b5cf6`)
- **Typography**: Font family must be a valid CSS font name
- **Layout**: Max width must be valid CSS width value
- **Version**: Must be "1.0"

### Banner Validation

- **URL Format**: Must be HTTPS URL or data URL
- **Data URL Size**: Max 500KB for data URLs
- **Approved Domains** (Phase 5A: Dynamic from environment):
  - Domains extracted from `VITE_BLOSSOM_PRIMARY_URL`
  - Domains extracted from `VITE_BLOSSOM_FALLBACK_URL`
  - CDN subdomains (`cdn.*`, `i.*`) automatically included
  - Legacy: `blossom.nostr.build`, `nostr.build` (hardcoded fallback)
- **File Types**: JPEG, PNG, WebP only
- **File Size**: Max 5MB before processing, target <1MB after

### Social Links Validation

- **Maximum Links**: 10 links per profile
- **URL Length**: Max 500 characters
- **Label Length**: Max 50 characters
- **XSS Prevention**: HTML/script tags blocked

#### Platform-Specific Validation

**Twitter:**

```regex
^https?://(www\.)?(twitter\.com|x\.com)/[a-zA-Z0-9_]{1,15}/?$
```

**GitHub:**

```regex
^https?://(www\.)?github\.com/[a-zA-Z0-9_-]{1,39}/?$
```

**Telegram:**

```regex
^https?://(www\.)?t\.me/[a-zA-Z0-9_]{5,32}/?$
```

**Nostr:**

```regex
^(npub1[a-z0-9]{58,59}|nprofile1[a-z0-9]+)$
```

**Lightning:**

```regex
^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
```

**Website:**

```regex
^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(/[^\s]*)?$
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning               | Description                       |
| ---- | --------------------- | --------------------------------- |
| 200  | OK                    | Request successful                |
| 400  | Bad Request           | Invalid request data              |
| 401  | Unauthorized          | Missing or invalid JWT token      |
| 405  | Method Not Allowed    | Wrong HTTP method (must be PATCH) |
| 500  | Internal Server Error | Server error                      |
| 503  | Service Unavailable   | Feature disabled                  |

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: string; // Human-readable error message
}
```

### Common Errors

**Authentication Errors:**

```json
{
  "success": false,
  "error": "Unauthorized: Missing or invalid token"
}
```

**Validation Errors:**

```json
{
  "success": false,
  "error": "Invalid Twitter URL format. Expected: https://twitter.com/username"
}
```

**Feature Disabled:**

```json
{
  "success": false,
  "error": "Profile customization is not enabled"
}
```

---

## Examples

### Example 1: Update Theme to Dark Mode

**Request:**

```http
PATCH /.netlify/functions/unified-profiles?action=updateTheme
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "theme": {
    "colorScheme": {
      "primary": "#8b5cf6",
      "secondary": "#ec4899",
      "background": "#1f2937",
      "text": "#f9fafb",
      "accent": "#f59e0b"
    },
    "typography": {
      "fontFamily": "Inter",
      "fontSize": "16px",
      "lineHeight": "1.5"
    },
    "layout": {
      "maxWidth": "1200px",
      "spacing": "normal",
      "borderRadius": "8px"
    },
    "version": "1.0"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "profile_theme": {
      "colorScheme": {
        "primary": "#8b5cf6",
        "secondary": "#ec4899",
        "background": "#1f2937",
        "text": "#f9fafb",
        "accent": "#f59e0b"
      },
      "typography": {
        "fontFamily": "Inter",
        "fontSize": "16px",
        "lineHeight": "1.5"
      },
      "layout": {
        "maxWidth": "1200px",
        "spacing": "normal",
        "borderRadius": "8px"
      },
      "version": "1.0"
    }
  }
}
```

---

### Example 2: Upload Banner Image

**Request:**

```http
PATCH /.netlify/functions/unified-profiles?action=updateBanner
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "bannerUrl": "https://blossom.nostr.build/abc123def456.jpg"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "profile_banner_url": "https://blossom.nostr.build/abc123def456.jpg"
  }
}
```

---

### Example 3: Add Social Links

**Request:**

```http
PATCH /.netlify/functions/unified-profiles?action=updateSocialLinks
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "links": [
    {
      "id": "link-1",
      "platform": "twitter",
      "url": "https://twitter.com/satoshi",
      "order": 0
    },
    {
      "id": "link-2",
      "platform": "github",
      "url": "https://github.com/bitcoin",
      "label": "Bitcoin Core",
      "order": 1
    },
    {
      "id": "link-3",
      "platform": "lightning",
      "url": "satoshi@getalby.com",
      "label": "Tips",
      "order": 2
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "social_links": {
      "0": {
        "id": "link-1",
        "platform": "twitter",
        "url": "https://twitter.com/satoshi",
        "order": 0
      },
      "1": {
        "id": "link-2",
        "platform": "github",
        "url": "https://github.com/bitcoin",
        "label": "Bitcoin Core",
        "order": 1
      },
      "2": {
        "id": "link-3",
        "platform": "lightning",
        "url": "satoshi@getalby.com",
        "label": "Tips",
        "order": 2
      }
    }
  }
}
```

---

## Rate Limiting

Currently, no explicit rate limiting is implemented for customization endpoints. However, general API rate limits may apply.

**Recommended Limits:**

- Theme updates: 10 per hour
- Banner uploads: 5 per hour
- Social links updates: 20 per hour

---

## Changelog

### Version 1.0 (2025-10-24)

- Initial release
- Theme Editor API
- Banner Management API
- Social Links Editor API
