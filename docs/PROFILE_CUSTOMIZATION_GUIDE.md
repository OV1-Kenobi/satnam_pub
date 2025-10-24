# Profile Customization Guide

**Phase 4: Profile Customization System**  
**Version:** 1.0  
**Last Updated:** 2025-10-24

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Getting Started](#getting-started)
4. [User Guide](#user-guide)
5. [API Documentation](#api-documentation)
6. [Feature Flags](#feature-flags)
7. [Troubleshooting](#troubleshooting)
8. [Security](#security)

---

## Overview

The Profile Customization System allows users to personalize their public profiles with:

- **Theme Editor** (Phase 4A): Customize colors, typography, and layout
- **Banner Management** (Phase 4B): Upload and manage profile banner images
- **Social Links Editor** (Phase 4C): Add links to social profiles and websites

All customizations are stored in the `user_identities` table and displayed on public profiles.

---

## Features

### Phase 4A: Theme Editor

- **4 Preset Themes**: Light, Dark, Nostr Purple, Bitcoin Orange
- **Color Customization**: Primary, secondary, background, text, accent colors
- **Typography**: Font family, size, line height
- **Layout**: Max width, spacing, border radius
- **Live Preview**: See changes in real-time

### Phase 4B: Banner Management

- **Image Upload**: Upload banner images via Blossom protocol
- **Image Cropping**: 4:1 aspect ratio enforcement
- **Image Compression**: Automatic compression to <1MB
- **Fallback Support**: Base64 data URLs for images <500KB
- **Supported Formats**: JPEG, PNG, WebP
- **Size Limits**: Max 5MB before processing, target <1MB after

### Phase 4C: Social Links Editor

- **10 Platforms Supported**:
  - Twitter / X
  - GitHub
  - Telegram
  - Nostr (npub)
  - Lightning Address
  - YouTube
  - LinkedIn
  - Instagram
  - Facebook
  - Website (custom)
- **Custom Labels**: Add custom labels to links
- **Reordering**: Drag-and-drop style reordering
- **Live Preview**: See how links will appear
- **Max 10 Links**: Limit to prevent spam

---

## Getting Started

### Prerequisites

- Active Satnam.pub account
- JWT authentication token
- Profile customization feature enabled

### Enabling Profile Customization

Add the following environment variable:

```bash
VITE_PROFILE_CUSTOMIZATION_ENABLED=true
```

For Blossom image uploads (optional):

```bash
VITE_BLOSSOM_UPLOAD_ENABLED=true

# Phase 5A: Multi-Server Support with Automatic Failover
VITE_BLOSSOM_PRIMARY_URL=https://blossom.satnam.pub  # Your self-hosted server
VITE_BLOSSOM_FALLBACK_URL=https://blossom.nostr.build  # Fallback server
VITE_BLOSSOM_TIMEOUT_MS=30000  # 30 seconds before failover
VITE_BLOSSOM_RETRY_ATTEMPTS=2  # Retry attempts per server

# Legacy (Phase 4B compatibility)
VITE_BLOSSOM_NOSTR_BUILD_URL=https://blossom.nostr.build
```

---

## User Guide

### Customizing Your Theme

1. Navigate to **Profile Settings** → **Customization** → **Theme**
2. Choose a preset theme or customize colors manually
3. Adjust typography and layout settings
4. Preview your changes in real-time
5. Click **Save Changes**

**Tips:**

- Use high contrast colors for better readability
- Test your theme on both desktop and mobile
- Reset to default if you're not happy with changes

### Uploading a Banner

1. Navigate to **Profile Settings** → **Customization** → **Banner**
2. Click **Upload Banner** or drag-and-drop an image
3. Crop the image to 4:1 aspect ratio
4. Preview the banner with your profile
5. Click **Save**

**Requirements:**

- Image format: JPEG, PNG, or WebP
- Max file size: 5MB (before processing)
- Recommended dimensions: 1200x300 to 4000x1000 pixels
- Aspect ratio: 4:1 (enforced during crop)

**Tips:**

- Use high-quality images for best results
- Avoid text in banners (may be hard to read on mobile)
- Test banner on different screen sizes

### Adding Social Links

1. Navigate to **Profile Settings** → **Customization** → **Social Links**
2. Click **Add Link**
3. Select platform from dropdown
4. Enter URL or handle
5. (Optional) Add custom label
6. Reorder links using up/down arrows
7. Click **Save Changes**

**Supported Platforms:**

- **Twitter/X**: `https://twitter.com/username` or `https://x.com/username`
- **GitHub**: `https://github.com/username`
- **Telegram**: `https://t.me/username`
- **Nostr**: `npub1...` (63 characters)
- **Lightning**: `username@domain.com`
- **YouTube**: `https://youtube.com/@username`
- **LinkedIn**: `https://linkedin.com/in/username`
- **Instagram**: `https://instagram.com/username`
- **Facebook**: `https://facebook.com/username`
- **Website**: `https://example.com` (HTTPS required)

**Tips:**

- Verify URLs before saving
- Use custom labels for clarity (e.g., "My Blog", "Work Profile")
- Reorder links to prioritize important ones
- Max 10 links allowed

---

## API Documentation

### Base URL

```
https://your-domain.com/.netlify/functions/unified-profiles
```

### Authentication

All customization endpoints require JWT authentication:

```
Authorization: Bearer <your-jwt-token>
```

### Endpoints

#### 1. Update Theme

**Endpoint:** `GET /unified-profiles?action=updateTheme`  
**Method:** `PATCH`  
**Auth:** Required

**Request Body:**

```json
{
  "theme": {
    "colorScheme": {
      "primary": "#8b5cf6",
      "secondary": "#ec4899",
      "background": "#ffffff",
      "text": "#1f2937",
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
    "profile_theme": { ... }
  }
}
```

#### 2. Update Banner

**Endpoint:** `GET /unified-profiles?action=updateBanner`  
**Method:** `PATCH`  
**Auth:** Required

**Request Body:**

```json
{
  "bannerUrl": "https://blossom.nostr.build/abc123.jpg"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "profile_banner_url": "https://blossom.nostr.build/abc123.jpg"
  }
}
```

#### 3. Update Social Links

**Endpoint:** `GET /unified-profiles?action=updateSocialLinks`  
**Method:** `PATCH`  
**Auth:** Required

**Request Body:**

```json
{
  "links": [
    {
      "id": "link-1",
      "platform": "twitter",
      "url": "https://twitter.com/username",
      "order": 0
    },
    {
      "id": "link-2",
      "platform": "github",
      "url": "https://github.com/username",
      "label": "My Projects",
      "order": 1
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
      "0": { "id": "link-1", "platform": "twitter", ... },
      "1": { "id": "link-2", "platform": "github", ... }
    }
  }
}
```

### Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common Error Codes:**

- `400`: Bad Request (invalid data)
- `401`: Unauthorized (missing/invalid token)
- `503`: Service Unavailable (feature disabled)
- `500`: Internal Server Error

---

## Feature Flags

### Environment Variables

| Variable                             | Default                       | Description                                        |
| ------------------------------------ | ----------------------------- | -------------------------------------------------- |
| `VITE_PROFILE_CUSTOMIZATION_ENABLED` | `false`                       | Master toggle for all customization features       |
| `VITE_BLOSSOM_UPLOAD_ENABLED`        | `false`                       | Enable Blossom image uploads                       |
| **Phase 5A: Multi-Server**           |                               |                                                    |
| `VITE_BLOSSOM_PRIMARY_URL`           | `https://blossom.nostr.build` | Primary Blossom server URL (self-hosted)           |
| `VITE_BLOSSOM_FALLBACK_URL`          | `https://blossom.nostr.build` | Fallback Blossom server URL                        |
| `VITE_BLOSSOM_TIMEOUT_MS`            | `30000`                       | Request timeout before failover (milliseconds)     |
| `VITE_BLOSSOM_RETRY_ATTEMPTS`        | `2`                           | Number of retry attempts per server                |
| **Legacy (Phase 4B)**                |                               |                                                    |
| `VITE_BLOSSOM_NOSTR_BUILD_URL`       | `https://blossom.nostr.build` | Deprecated: Use `VITE_BLOSSOM_PRIMARY_URL` instead |

### Enabling Features

**Local Development (.env):**

```bash
VITE_PROFILE_CUSTOMIZATION_ENABLED=true
VITE_BLOSSOM_UPLOAD_ENABLED=true
```

**Netlify Dashboard:**

1. Go to **Site Settings** → **Environment Variables**
2. Add `VITE_PROFILE_CUSTOMIZATION_ENABLED` = `true`
3. Add `VITE_BLOSSOM_UPLOAD_ENABLED` = `true`
4. Redeploy site

---

## Self-Hosted Blossom Server Setup (Phase 5A)

### Overview

Phase 5A introduces multi-server support with automatic failover for banner image uploads. You can now configure a self-hosted Blossom server as the primary upload destination, with automatic failover to a public server (e.g., nostr.build) if the primary server is unavailable.

### Benefits

- **Sovereignty**: Host your own images on your infrastructure
- **Reliability**: Automatic failover ensures uploads always succeed
- **Performance**: Reduced latency with geographically closer servers
- **Privacy**: Keep image uploads on your own infrastructure

### Configuration

**1. Set up your self-hosted Blossom server**

Follow the [Blossom BUD-02 specification](https://github.com/hzrd149/blossom) to deploy your own Blossom server. Popular implementations:

- [blossom-server](https://github.com/hzrd149/blossom-server) - Reference implementation
- [blossom-drive](https://github.com/hzrd149/blossom-drive) - S3-compatible storage backend

**2. Configure environment variables**

```bash
# Primary server (your self-hosted instance)
VITE_BLOSSOM_PRIMARY_URL=https://blossom.satnam.pub

# Fallback server (public Blossom server)
VITE_BLOSSOM_FALLBACK_URL=https://blossom.nostr.build

# Timeout before failover (30 seconds recommended)
VITE_BLOSSOM_TIMEOUT_MS=30000

# Retry attempts per server (2-3 recommended)
VITE_BLOSSOM_RETRY_ATTEMPTS=2

# Enable Blossom uploads
VITE_BLOSSOM_UPLOAD_ENABLED=true
```

**3. Deploy and test**

1. Deploy your changes to Netlify
2. Upload a test banner image
3. Check browser console for failover logs:
   - `📤 Uploading to https://blossom.satnam.pub...` - Primary server attempt
   - `✅ Blossom server https://blossom.satnam.pub upload successful` - Success
   - `🔄 Failing over to next server...` - Failover triggered
   - `✅ Failover successful! Used fallback server` - Fallback success

### Failover Behavior

The system automatically handles server failures:

1. **Primary Server Attempt**: Uploads to `VITE_BLOSSOM_PRIMARY_URL` first
2. **Retry Logic**: Retries `VITE_BLOSSOM_RETRY_ATTEMPTS` times with exponential backoff
3. **Timeout Protection**: Aborts request after `VITE_BLOSSOM_TIMEOUT_MS` milliseconds
4. **Automatic Failover**: Switches to `VITE_BLOSSOM_FALLBACK_URL` if primary fails
5. **Graceful Degradation**: Returns error only if all servers fail

### Server Health Monitoring

The system tracks server health statistics:

```typescript
import { getServerHealthStats } from "../../src/lib/api/blossom-client";

const healthStats = getServerHealthStats();
// Returns: [
//   {
//     url: "https://blossom.satnam.pub",
//     successCount: 42,
//     failureCount: 3,
//     lastAttempt: 1234567890,
//     lastSuccess: 1234567890,
//     lastFailure: 1234567800
//   },
//   ...
// ]
```

Use this for monitoring dashboards or alerting systems.

### Authentication

Blossom uploads use Nostr signature-based authentication (BUD-02 spec):

- **With NIP-07 signer**: Authenticated upload with kind 24242 event
- **Without signer**: Anonymous upload (if server allows)

Both primary and fallback servers receive the same authentication.

### Troubleshooting

**Primary server always fails over**

1. Check server is accessible: `curl https://blossom.satnam.pub/upload`
2. Verify CORS headers allow your domain
3. Check server logs for authentication errors
4. Increase `VITE_BLOSSOM_TIMEOUT_MS` if server is slow

**Both servers fail**

1. Check network connectivity
2. Verify file size is within limits
3. Check browser console for detailed error messages
4. Verify Nostr signer is working (if using authenticated uploads)

**Images not displaying after upload**

1. Verify banner URL is HTTPS
2. Check server CORS headers
3. Verify image is accessible: open URL in browser
4. Check database for correct URL storage

---

## Troubleshooting

### Theme Not Saving

**Problem:** Theme changes don't persist after refresh.

**Solutions:**

1. Check if `VITE_PROFILE_CUSTOMIZATION_ENABLED=true`
2. Verify JWT token is valid
3. Check browser console for errors
4. Verify database connection

### Banner Upload Failing

**Problem:** Banner upload fails with error.

**Solutions:**

1. Check file size (<5MB)
2. Verify file format (JPEG, PNG, WebP only)
3. Check if `VITE_BLOSSOM_UPLOAD_ENABLED=true`
4. Verify Blossom server is accessible
5. Try fallback: use smaller image (<500KB)

### Social Links Not Displaying

**Problem:** Social links don't appear on public profile.

**Solutions:**

1. Verify links were saved (check database)
2. Check URL format matches platform requirements
3. Verify profile visibility is set to "public"
4. Clear browser cache and refresh

### Feature Not Available

**Problem:** Customization options not visible in UI.

**Solutions:**

1. Check `VITE_PROFILE_CUSTOMIZATION_ENABLED=true`
2. Rebuild and redeploy application
3. Clear browser cache
4. Check user permissions

---

## Security

### XSS Prevention

- All user inputs are sanitized
- HTML/script tags are blocked
- URLs are validated server-side

### HTTPS Enforcement

- Website URLs must use HTTPS
- Banner URLs must use HTTPS (Blossom)
- Data URLs validated for size (<500KB)

### Rate Limiting

- API endpoints are rate-limited
- Max 10 social links per profile
- File size limits enforced

### Zero-Knowledge Architecture

- No nsec exposure in customization data
- All sensitive data encrypted
- JWT authentication required

---

## Support

For issues or questions:

- GitHub Issues: [satnam_pub/issues](https://github.com/OV1-Kenobi/satnam_pub/issues)
- Documentation: [docs/](../docs/)
- Email: support@satnam.pub
