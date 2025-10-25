# Environment Variables

This project splits environment configuration between browser (Vite, public) and server (Netlify Functions, private). Public variables use the VITE\_\* prefix and are safe to expose in the client bundle. All others must remain server-only.

## Critical Pattern: Dynamic Environment Variable Inclusion

**IMPORTANT:** The codebase uses a dynamic pattern to automatically include ALL `VITE_*` environment variables in production builds without manual maintenance.

### Implementation

In `vite.config.js`, the `getAllViteEnvVars()` helper function automatically collects all environment variables:

```javascript
// Helper to collect all VITE_* environment variables
function getAllViteEnvVars() {
  const viteEnv = {};
  if (typeof process !== 'undefined' && process.env) {
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('VITE_') || key === 'NODE_ENV' || key === 'NOSTR_RELAYS') {
        viteEnv[key] = process.env[key] || '';
      }
    });
  }
  return viteEnv;
}

// In defineConfig:
define: {
  global: "globalThis",
  __DEV__: isDevelopment,
  'process.env': JSON.stringify(getAllViteEnvVars()),
}
```

### Why This Matters

- **Prevents production failures:** Hardcoded variable lists cause white screen errors when new feature flags are added
- **Zero maintenance:** New `VITE_*` variables are automatically included without updating `vite.config.js`
- **Consistent access:** All code uses `process.env.VITE_*` pattern (populated by Vite's `define`)
- **No CommonJS warnings:** Avoids `import.meta.env` which causes bundling issues in Netlify Functions

### Client-Side Access Pattern

In `src/config/env.client.ts`, use a simple helper that accesses `process.env`:

```typescript
function getEnvVar(key: string): string | undefined {
  if (
    typeof process !== "undefined" &&
    process.env &&
    process.env[key] !== undefined
  ) {
    return process.env[key];
  }
  return undefined;
}
```

**DO NOT** use `import.meta.env` in files that may be imported by Netlify Functions, as this causes CommonJS bundling errors.

## LNbits (server-only)

- LNBITS_BASE_URL (required)
  - The base URL of your LNbits deployment (e.g., https://my.satnam.pub)
- LNBITS_ADMIN_KEY (required in production)
  - Primary server-side admin key for bootstrap operations (create user/wallet)
- LNBITS_BOOTSTRAP_ADMIN_KEY (optional fallback)
  - Alternate admin key; if set, the server will use this when LNBITS_ADMIN_KEY is absent
- LNBITS_KEY_ENC_SECRET (optional)
  - App-level secret for encryption helpers. If not set, DUID_SERVER_SECRET is used as fallback

Notes:

- ADMIN_KEYs are NEVER exposed to the browser. Netlify Functions use them only for admin operations.
- Per-user wallet actions always use per-user keys stored server-side and decrypted at runtime.

## Phoenixd (server-only)

- PHOENIXD_API_URL (required)
  - Base REST URL of phoenixd
- PHOENIXD_API_PASSWORD (required)
  - Password used for Basic auth (username is empty). The header is `Authorization: Basic Base64(":" + password)`

## Domains (server-only)

- SATNAM_DOMAIN
- SATNAM_API_DOMAIN
- SATNAM_DASHBOARD_DOMAIN

## Browser/Public (Vite)

- VITE_LNBITS_BASE_URL (required)
  - Public base for linking to LNbits wallet dashboard
- VITE_API_BASE_URL (optional; default: /api)
  - Client API proxy prefix
- VITE_LNBITS_INTEGRATION_ENABLED (optional; default: false)
  - Feature flag to enable LNbits UI
- VITE_SATNAM_DOMAIN (optional)
- VITE_DASHBOARD_URL (optional)

## Setup

1. Netlify UI → Site settings → Environment

   - Set the server-only vars above
   - Set the Vite public vars
   - Redeploy for new values to take effect

2. Local development
   - Create `.env.local` (gitignored) mirroring the values as needed

## Best Practices

- Never place admin keys into VITE\_\* variables
- Rotate admin keys regularly and after audits
- Keep rate limits enabled for payment endpoints
- Avoid logging secrets; logs should contain only minimal metadata
- Use HTTPS-only with HSTS and a strict CSP in production

## Amber signer (browser/public)

- VITE_ENABLE_AMBER_SIGNING (optional; default: false)
  - Master flag to enable Amber signer adapter
- VITE_ENABLE_AMBER_NIP55 (optional; default: true)
  - Enables Android intent-based NIP-55 flow; if false, adapter uses NIP-46 only
- VITE_AMBER_PACKAGE_NAME (optional; default: "com.greenart.amber")
  - Package whitelist for intent:// URIs
- VITE_AMBER_INTENT_SCHEME (optional; default: "nostrsigner")
  - Intent scheme used for NIP-55 requests
