# SimpleProof Environment Variables Documentation

**System:** SimpleProof Blockchain Attestation  
**Version:** Phase 2B-2 Day 16  
**Last Updated:** 2025-10-26

---

## Overview

This document provides comprehensive documentation for all environment variables used by the SimpleProof blockchain attestation system. Variables are categorized by scope (client-side vs server-side) and priority (required vs optional).

---

## Required Environment Variables

### SimpleProof API Configuration

#### `VITE_SIMPLEPROOF_ENABLED`
- **Type:** Boolean (`"true"` or `"false"`)
- **Scope:** Client-side (browser) + Server-side (Netlify Functions)
- **Required:** Yes
- **Default:** `false`
- **Description:** Master feature flag to enable/disable the entire SimpleProof blockchain attestation system
- **Production Value:** `true`
- **Development Value:** `true` (for testing)
- **Security:** Public (safe to expose in client bundle)
- **Usage:**
  ```typescript
  // Client-side
  const enabled = clientConfig.flags.simpleproofEnabled;
  
  // Server-side
  const enabled = getEnvVar("VITE_SIMPLEPROOF_ENABLED") === "true";
  ```

#### `VITE_SIMPLEPROOF_API_KEY`
- **Type:** String (API key)
- **Scope:** Server-side ONLY (Netlify Functions)
- **Required:** Yes (when `VITE_SIMPLEPROOF_ENABLED=true`)
- **Default:** None
- **Description:** Authentication key for SimpleProof API requests
- **Production Value:** `<your-simpleproof-api-key>` (obtain from SimpleProof dashboard)
- **Development Value:** `<your-test-api-key>` (use test/sandbox key)
- **Security:** ⚠️ **SENSITIVE** - Never expose to client-side code
- **Storage:** Netlify environment variables (encrypted at rest)
- **Rotation:** Recommended every 90 days
- **Usage:**
  ```typescript
  // Server-side only (Netlify Functions)
  const apiKey = getEnvVar("VITE_SIMPLEPROOF_API_KEY");
  if (!apiKey) {
    throw new Error("SimpleProof API key not configured");
  }
  ```

#### `VITE_SIMPLEPROOF_API_URL`
- **Type:** String (URL)
- **Scope:** Server-side (Netlify Functions)
- **Required:** No (has default)
- **Default:** `https://api.simpleproof.com`
- **Description:** Base URL for SimpleProof API endpoints
- **Production Value:** `https://api.simpleproof.com`
- **Development Value:** `https://api.simpleproof.com` (or sandbox URL if available)
- **Security:** Public (safe to expose)
- **Usage:**
  ```typescript
  const apiUrl = getEnvVar("VITE_SIMPLEPROOF_API_URL") || "https://api.simpleproof.com";
  ```

---

### Supabase Configuration

#### `VITE_SUPABASE_URL`
- **Type:** String (URL)
- **Scope:** Client-side + Server-side
- **Required:** Yes
- **Default:** None
- **Description:** Supabase project URL for database access
- **Production Value:** `https://<your-project>.supabase.co`
- **Development Value:** Same as production (or local Supabase if using)
- **Security:** Public (safe to expose)
- **Usage:**
  ```typescript
  const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  ```

#### `VITE_SUPABASE_ANON_KEY`
- **Type:** String (JWT token)
- **Scope:** Client-side + Server-side
- **Required:** Yes
- **Default:** None
- **Description:** Supabase anonymous key for public database access (RLS-protected)
- **Production Value:** `<your-anon-key>` (from Supabase dashboard)
- **Development Value:** Same as production
- **Security:** Public (safe to expose - RLS policies protect data)
- **Note:** This is a public key designed to be exposed. Row Level Security (RLS) policies enforce access control.
- **Usage:**
  ```typescript
  const supabaseAnonKey = getEnvVar("VITE_SUPABASE_ANON_KEY");
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  ```

#### `SUPABASE_SERVICE_ROLE_KEY`
- **Type:** String (JWT token)
- **Scope:** Server-side ONLY (Netlify Functions)
- **Required:** No (only for admin operations)
- **Default:** None
- **Description:** Supabase service role key with full database access (bypasses RLS)
- **Production Value:** `<your-service-role-key>` (from Supabase dashboard)
- **Development Value:** Same as production
- **Security:** ⚠️ **HIGHLY SENSITIVE** - Never expose to client-side code
- **Storage:** Netlify environment variables (encrypted at rest)
- **Usage:** Only use when RLS bypass is absolutely necessary
- **Note:** SimpleProof system does NOT currently use this key (uses anon key with RLS)

---

### Sentry Error Tracking

#### `VITE_SENTRY_ENABLED`
- **Type:** Boolean (`"true"` or `"false"`)
- **Scope:** Client-side + Server-side
- **Required:** No (recommended for production)
- **Default:** `false`
- **Description:** Enable Sentry error tracking and performance monitoring
- **Production Value:** `true`
- **Development Value:** `false` (to avoid polluting production error logs)
- **Security:** Public (safe to expose)
- **Usage:**
  ```typescript
  if (getEnvVar("VITE_SENTRY_ENABLED") === "true") {
    initializeSentry();
  }
  ```

#### `VITE_SENTRY_DSN`
- **Type:** String (Sentry DSN URL)
- **Scope:** Client-side + Server-side
- **Required:** Yes (when `VITE_SENTRY_ENABLED=true`)
- **Default:** None
- **Description:** Sentry Data Source Name for error reporting
- **Production Value:** `https://<key>@<org>.ingest.sentry.io/<project>`
- **Development Value:** Same as production (or separate dev project)
- **Security:** Public (safe to expose - DSN is designed to be public)
- **Usage:**
  ```typescript
  Sentry.init({
    dsn: getEnvVar("VITE_SENTRY_DSN"),
    environment: process.env.NODE_ENV,
  });
  ```

#### `VITE_SENTRY_ORG`
- **Type:** String
- **Scope:** Build-time (Vite plugin)
- **Required:** No (for source map upload)
- **Default:** `"satnam-pub"`
- **Description:** Sentry organization name for source map upload
- **Production Value:** `satnam-pub`
- **Security:** Public (safe to expose)

#### `VITE_SENTRY_PROJECT`
- **Type:** String
- **Scope:** Build-time (Vite plugin)
- **Required:** No (for source map upload)
- **Default:** `"satnam-pub"`
- **Description:** Sentry project name for source map upload
- **Production Value:** `satnam-pub`
- **Security:** Public (safe to expose)

#### `SENTRY_AUTH_TOKEN`
- **Type:** String (API token)
- **Scope:** Build-time (Vite plugin)
- **Required:** Yes (for source map upload in production)
- **Default:** None
- **Description:** Sentry authentication token for uploading source maps during build
- **Production Value:** `<your-sentry-auth-token>` (from Sentry dashboard)
- **Security:** ⚠️ **SENSITIVE** - Only used during build, not in runtime
- **Storage:** Netlify build environment variables
- **Scopes Required:** `project:releases`, `project:write`
- **Usage:** Automatically used by `@sentry/vite-plugin` during production builds

---

### Application Configuration

#### `NODE_ENV`
- **Type:** String (`"development"` | `"production"` | `"test"`)
- **Scope:** Client-side + Server-side
- **Required:** Yes (automatically set by build tools)
- **Default:** `"development"`
- **Description:** Node.js environment mode
- **Production Value:** `production`
- **Development Value:** `development`
- **Security:** Public (safe to expose)
- **Usage:**
  ```typescript
  const isDevelopment = process.env.NODE_ENV === "development";
  const isProduction = process.env.NODE_ENV === "production";
  ```

#### `FRONTEND_URL`
- **Type:** String (URL)
- **Scope:** Server-side (Netlify Functions)
- **Required:** No (has default)
- **Default:** `https://www.satnam.pub`
- **Description:** Primary frontend URL for CORS validation
- **Production Value:** `https://www.satnam.pub`
- **Development Value:** `http://localhost:5173`
- **Security:** Public (safe to expose)
- **Note:** CORS validation now uses hardcoded whitelist instead of this variable

#### `VITE_LOG_LEVEL`
- **Type:** String (`"debug"` | `"info"` | `"warn"` | `"error"`)
- **Scope:** Client-side + Server-side
- **Required:** No (has default)
- **Default:** `"debug"` (development), `"info"` (production)
- **Description:** Minimum log level for structured logging
- **Production Value:** `info`
- **Development Value:** `debug`
- **Security:** Public (safe to expose)
- **Usage:**
  ```typescript
  const logger = createLogger({ 
    component: "simpleproof-timestamp",
    minLevel: getEnvVar("VITE_LOG_LEVEL") || "info"
  });
  ```

---

## Optional Environment Variables

### Feature Flags

#### `VITE_SIMPLEPROOF_FEE_WARNINGS_ENABLED`
- **Type:** Boolean (`"true"` | `"false"`)
- **Scope:** Client-side
- **Required:** No
- **Default:** `true`
- **Description:** Enable fee warning modals before creating blockchain timestamps
- **Production Value:** `true` (recommended)
- **Development Value:** `false` (for faster testing)
- **Security:** Public (safe to expose)
- **Usage:**
  ```typescript
  const feeWarningsEnabled = clientConfig.flags.simpleproofFeeWarningsEnabled !== false;
  ```

---

## Environment Variable Setup

### Netlify Dashboard Setup

1. Go to Netlify dashboard → Site settings → Environment variables
2. Add each required variable with appropriate value
3. Set scope:
   - **All deploys** - For production variables
   - **Deploy previews** - For development/testing variables
4. Click "Save"
5. Trigger new deployment to apply changes

### Local Development Setup

Create `.env.local` file in project root:

```bash
# SimpleProof Configuration
VITE_SIMPLEPROOF_ENABLED=true
VITE_SIMPLEPROOF_API_KEY=your-test-api-key
VITE_SIMPLEPROOF_API_URL=https://api.simpleproof.com

# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Sentry Configuration (optional for local dev)
VITE_SENTRY_ENABLED=false
VITE_SENTRY_DSN=https://your-dsn@sentry.io/project

# Application Configuration
NODE_ENV=development
VITE_LOG_LEVEL=debug
```

**Note:** Never commit `.env.local` to version control (already in `.gitignore`)

---

## Security Best Practices

### Sensitive Variables

**Never expose these to client-side:**
- ❌ `VITE_SIMPLEPROOF_API_KEY`
- ❌ `SUPABASE_SERVICE_ROLE_KEY`
- ❌ `SENTRY_AUTH_TOKEN`

**Safe to expose to client-side:**
- ✅ `VITE_SIMPLEPROOF_ENABLED`
- ✅ `VITE_SUPABASE_URL`
- ✅ `VITE_SUPABASE_ANON_KEY` (RLS-protected)
- ✅ `VITE_SENTRY_DSN` (public by design)

### Variable Rotation Schedule

| Variable | Rotation Frequency | Priority |
|----------|-------------------|----------|
| `VITE_SIMPLEPROOF_API_KEY` | Every 90 days | High |
| `SUPABASE_SERVICE_ROLE_KEY` | Every 180 days | Critical |
| `SENTRY_AUTH_TOKEN` | Every 365 days | Medium |
| `VITE_SUPABASE_ANON_KEY` | Only if compromised | Low |

---

## Troubleshooting

### Common Issues

**Issue: "SimpleProof API key not configured"**
- **Cause:** Missing or incorrect `VITE_SIMPLEPROOF_API_KEY`
- **Solution:** Verify variable is set in Netlify dashboard and redeploy

**Issue: "Supabase client initialization failed"**
- **Cause:** Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`
- **Solution:** Verify both variables are set correctly

**Issue: "Sentry not capturing errors"**
- **Cause:** `VITE_SENTRY_ENABLED=false` or invalid `VITE_SENTRY_DSN`
- **Solution:** Enable Sentry and verify DSN is correct

**Issue: "CORS error in production"**
- **Cause:** `FRONTEND_URL` mismatch (legacy - no longer used)
- **Solution:** CORS now uses hardcoded whitelist - verify origin is `https://www.satnam.pub`

---

## Verification Checklist

Before deploying to production, verify:

- [ ] All required variables are set in Netlify dashboard
- [ ] Sensitive variables are NOT in client-side code
- [ ] `NODE_ENV=production` for production builds
- [ ] `VITE_SIMPLEPROOF_ENABLED=true` to enable system
- [ ] `VITE_SENTRY_ENABLED=true` for error tracking
- [ ] `SENTRY_AUTH_TOKEN` set for source map upload
- [ ] `.env.local` is in `.gitignore` (never committed)

---

## References

- [Netlify Environment Variables Documentation](https://docs.netlify.com/environment-variables/overview/)
- [Vite Environment Variables Guide](https://vitejs.dev/guide/env-and-mode.html)
- [Supabase Environment Variables](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs#get-the-api-keys)
- [Sentry Configuration](https://docs.sentry.io/platforms/javascript/guides/react/configuration/)

