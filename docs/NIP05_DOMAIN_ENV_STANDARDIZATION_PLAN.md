# NIP-05 & Lightning Domain Environment Standardization Plan

## 1. Goals

- Standardize all NIP-05 and Lightning Address domain logic on `my.satnam.pub`.
- Use a single canonical env var for the NIP-05/Lightning domain and avoid drift.
- Keep the codebase white-label friendly so domains can be overridden via env vars only.
- Remove `satnam.pub` / `www.satnam.pub` fallbacks from identity-related logic (NIP-05, Lightning, identity APIs) while preserving them for website/front-end domains.

## 2. Current env vars and roles (summary)

| Variable                                                                  | Primary role                                  | Notes                                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `VITE_PLATFORM_LIGHTNING_DOMAIN`                                          | NIP-05 + Lightning Address domain (most code) | Default in `src/config/env.client.ts` is `my.satnam.pub`. Used by client + server helper. |
| `NIP05_DOMAIN`                                                            | NIP-05 domain (legacy)                        | Used in `config/index.ts`, `src/lib/browser-config.ts`.                                   |
| `NIP05_ALLOWED_DOMAINS` / `VITE_NIP05_ALLOWED_DOMAINS`                    | Allow-list of acceptable NIP-05 domains       | Already default `my.satnam.pub`.                                                          |
| `LIGHTNING_DOMAIN` / `VITE_LIGHTNING_DOMAIN` / `LIGHTNING_ADDRESS_DOMAIN` | Lightning Address domain overrides            | A few places still default to `satnam.pub`.                                               |
| `VITE_APP_DOMAIN` / `FRONTEND_URL`                                        | Browser origin for CORS                       | Several handlers still fall back to `https://www.satnam.pub`.                             |

Canonical config helpers already in good shape:

- Client: `src/config/env.client.ts` + `src/config/domain.client.ts`.
- Server (Netlify Functions): `netlify/functions_active/utils/domain.server.ts`.
- General config: `config/index.ts`, `config/config.js`.

## 3. Canonical domain decision (answers to Step 2)

1. **Canonical env var for NIP-05 domain**

   Use **`VITE_PLATFORM_LIGHTNING_DOMAIN`** as the single canonical env var for both:

   - NIP-05 domain (`username@domain`)
   - Lightning Address domain (`username@domain`)

   Server-side Netlify Functions should always go through:

   - `resolvePlatformLightningDomainServer()` in `netlify/functions_active/utils/domain.server.ts`.

2. **Relationship between NIP-05 and Lightning Address domains**

   - They should be **identical by default**.
   - Advanced deployments MAY override Lightning domain via `LIGHTNING_ADDRESS_DOMAIN` / `VITE_LIGHTNING_DOMAIN`, but if unset, Lightning should fall back to `VITE_PLATFORM_LIGHTNING_DOMAIN`.

3. **Inconsistencies to fix**

   - Browser-side NIP-05 config defaults to `"satnam.pub"` (`src/lib/browser-config.ts`).
   - Several server handlers still hardcode `"satnam.pub"` or `"https://www.satnam.pub"`:
     - `netlify/functions/nip05-artifact-upsert.js`
     - `netlify/functions/nostr-json.js`
     - `api/lnurl/[username].js`
     - `api/lnurl/[username]/callback.js`
     - `lib/lightning/custom-node-service.ts`
     - `lib/api/register-identity.js`
     - `api/auth/clear-refresh-cookie.js`
     - `api/auth/nip07-challenge.js`
     - `api/auth/logout.js`

4. **Do we need separate variables for app, NIP-05, and Lightning domains?**

   Recommended separation:

   - **App origin / CORS**: `VITE_APP_DOMAIN` (client) and `VITE_APP_DOMAIN` / `FRONTEND_URL` (server). This is the website/frontend domain and should default to `https://satnam.pub` or `https://www.satnam.pub`.
   - **NIP-05 + Lightning domain**: `VITE_PLATFORM_LIGHTNING_DOMAIN` (canonical identity domain). This should default to `my.satnam.pub`.
   - **API base URL**: `VITE_API_BASE_URL` / `API_BASE_URL` (if used) for routing to API hostnames such as `https://api.my.satnam.pub`.

   `NIP05_DOMAIN` is considered deprecated and will be removed from runtime usage as part of this plan (no fallback usage).

## 4. Implementation plan (per file)

> NOTE: This section is a plan only. No code has been changed yet.

### Phase 1 – Env mapping & NIP-05 config

1. **`src/lib/browser-config.ts` (NIP-05 client config)**

   - Current (line ~32):

     ```ts
     export const nip05Config = {
       domain: getEnvVar("NIP05_DOMAIN") || "satnam.pub",
     };
     ```

   - Proposed:

     ```ts
     export const nip05Config = {
       domain: getEnvVar("VITE_PLATFORM_LIGHTNING_DOMAIN") || "my.satnam.pub",
     };
     ```

   - Reason: ensure browser uses same canonical domain as the rest of the system and remove `"satnam.pub"` default.

2. **`lib/lightning/custom-node-service.ts` (custom node Lightning domain)**

   - Current (comment + domain resolution):

     ```ts
     // 1. 🏠 Self-custodial node + @satnam.pub
     const domain =
       customDomain || getEnvVar("LIGHTNING_DOMAIN") || "satnam.pub";
     ```

   - Proposed:

     ```ts
     // 1. 🏠 Self-custodial node + @my.satnam.pub
     const domain =
       customDomain ||
       getEnvVar("LIGHTNING_DOMAIN") ||
       getEnvVar("VITE_PLATFORM_LIGHTNING_DOMAIN") ||
       "my.satnam.pub";
     ```

   - Reason: keep comments accurate, use canonical domain, but still allow advanced `LIGHTNING_DOMAIN` override.

3. **`lib/api/register-identity.js` (Lightning address generation)**

   - Current (line ~233):

     ```js
     const domain = getEnvVar("VITE_LIGHTNING_DOMAIN") || "satnam.pub";
     ```

   - Proposed:

     ```js
     const domain =
       getEnvVar("VITE_LIGHTNING_DOMAIN") ||
       getEnvVar("VITE_PLATFORM_LIGHTNING_DOMAIN") ||
       "my.satnam.pub";
     ```

   - Reason: make Lightning Address generation follow the canonical domain, with optional `VITE_LIGHTNING_DOMAIN` override.

### Phase 2 – NIP-05 storage functions

4. **`netlify/functions/nip05-artifact-upsert.js`**

   - **CORS origin** (line ~8):

     - Current:

       ```js
       const allowed = isProd
         ? process.env.FRONTEND_URL || "https://www.satnam.pub"
         : origin || "*";
       ```

     - Proposed:

       ```js
       const allowed = isProd
         ? process.env.FRONTEND_URL ||
           process.env.VITE_APP_DOMAIN ||
           "https://www.satnam.pub"
         : origin || "*";
       ```

   - **Domain defaults** (line ~26-28):

     - Current:

       ```js
       const {
         nip05,
         newNpub,
         username,
         domain = "satnam.pub",
       } = JSON.parse(event.body || "{}");
       const effectiveDomain =
         domain ||
         (typeof nip05 === "string"
           ? String(nip05).split("@")[1]
           : "satnam.pub") ||
         "satnam.pub";
       ```

     - Proposed:

       ```js
       const defaultDomain =
         process.env.VITE_PLATFORM_LIGHTNING_DOMAIN ||
         process.env.PLATFORM_LIGHTNING_DOMAIN ||
         "my.satnam.pub";

       const {
         nip05,
         newNpub,
         username,
         domain = defaultDomain,
       } = JSON.parse(event.body || "{}");

       const effectiveDomain =
         domain ||
         (typeof nip05 === "string"
           ? String(nip05).split("@")[1]
           : defaultDomain) ||
         defaultDomain;
       ```

   - **Storage path** (line ~83) already uses `effectiveDomain` and will automatically match new RLS policies (`nip05_artifacts/my.satnam.pub/...`).

5. **`netlify/functions/nostr-json.js`**

   - **CORS origin** (line ~10):

     - Current:

       ```js
       const allowed = isProd
         ? process.env.FRONTEND_URL || "https://www.satnam.pub"
         : origin || "*";
       ```

     - Proposed (same pattern as above):

       ```js
       const allowed = isProd
         ? process.env.FRONTEND_URL ||
           process.env.VITE_APP_DOMAIN ||
           "https://www.satnam.pub"
         : origin || "*";
       ```

   - **NIP-05 domain** (line ~52):

     - Current:

       ```js
       const domain = "satnam.pub";
       ```

     - Proposed:

       ```js
       const domain =
         process.env.VITE_PLATFORM_LIGHTNING_DOMAIN || "my.satnam.pub";
       ```

   - **Storage path** (line ~73) will automatically use the updated `domain`.

### Phase 3 – LNURL endpoints

6. **`api/lnurl/[username].js`**

## 5. Risk Assessment & Website Safety

This section summarizes why the planned changes are safe for the public website and which areas of the codebase are affected.

### 5.1 Scope of changes

- **In scope:** NIP-05 records, Lightning Address configuration, and identity-related API endpoints that must use the identity domain (`my.satnam.pub`).
- **Out of scope:** Website origin, marketing/landing pages, and CORS origins that must continue to use the website domain (`satnam.pub` / `www.satnam.pub`) via `VITE_APP_DOMAIN` or `FRONTEND_URL`.

### 5.2 Files by category

**A. Identity / NIP-05 / Lightning (safe to migrate to `my.satnam.pub`)**

- `src/lib/browser-config.ts` – NIP-05 browser config
- `netlify/functions/nip05-artifact-upsert.js` – NIP-05 artifact upload handler
- `netlify/functions/nostr-json.js` – NIP-05 `.well-known/nostr.json` resolver
- `api/lnurl/[username].js` – LNURL pay/Lightning Address metadata
- `api/lnurl/[username]/callback.js` – LNURL callback handler
- `lib/lightning/custom-node-service.ts` – Lightning domain utilities
- `lib/api/register-identity.js` – Registration flow building NIP-05 / Lightning identifiers

These files deal with user identities, NIP-05 DNS-style records, and Lightning Addresses. Standardizing them on `VITE_PLATFORM_LIGHTNING_DOMAIN` → `my.satnam.pub` does **not** affect where the public website is hosted.

**B. Website / CORS / Frontend URLs (must preserve `satnam.pub` / use `VITE_APP_DOMAIN`)**

- `api/auth/clear-refresh-cookie.js` – uses `VITE_APP_DOMAIN` for cookie domain & CORS
- `api/auth/logout.js` – uses `VITE_APP_DOMAIN` for cookie clearing & CORS
- `api/auth/nip07-challenge.js` – validates browser origin; should rely on `VITE_APP_DOMAIN`
- `netlify/functions/nip05-artifact-upsert.js` – CORS `Access-Control-Allow-Origin` via `FRONTEND_URL` / `https://www.satnam.pub`
- `netlify/functions/nostr-json.js` – CORS `Access-Control-Allow-Origin` via `FRONTEND_URL` / `https://www.satnam.pub`

In these files, **only the identity-related pieces** (e.g., NIP-05 domain values inside payloads or storage paths) will be pointed to `my.satnam.pub`. Any CORS logic and cookie domain logic will continue to use `VITE_APP_DOMAIN` / `FRONTEND_URL` with defaults pointing at `https://satnam.pub` or `https://www.satnam.pub`.

### 5.3 CORS and website behavior

- All planned CORS snippets in this document are explicitly using `FRONTEND_URL` and/or `VITE_APP_DOMAIN` with defaults of `https://satnam.pub` or `https://www.satnam.pub`.
- No change is proposed that would switch CORS origins to the identity domain (`my.satnam.pub`).
- As a result, the browser at `https://satnam.pub` / `https://www.satnam.pub` will continue to be treated as the trusted origin when talking to Netlify Functions and API routes.

### 5.4 Environment variable separation (safety guarantee)

- `VITE_APP_DOMAIN` = **website/frontend domain** (e.g., `https://satnam.pub` or `https://www.satnam.pub`). Used for:
  - CORS origin checks
  - Cookie domain and redirect URLs
- `FRONTEND_URL` = server-side alias for the same website origin in Netlify Functions.
- `VITE_PLATFORM_LIGHTNING_DOMAIN` = **identity/NIP-05/Lightning domain** (e.g., `my.satnam.pub`). Used for:
  - NIP-05 records and JSON artifacts
  - Lightning Addresses (`username@my.satnam.pub`)
  - Identity-related API endpoints and LNbits integration.

By keeping these variables distinct and using them only in their appropriate contexts, **website behavior remains unchanged**, while identity behavior is standardized on `my.satnam.pub`.

### 5.5 Website safety conclusion

- The public website at `satnam.pub` / `www.satnam.pub` will continue to function exactly as before, with identical CORS and cookie behavior.
- Only identity-related domains and artifacts are being updated to consistently use `my.satnam.pub` via `VITE_PLATFORM_LIGHTNING_DOMAIN`.
- No CORS rule, redirect, or cookie configuration is being switched to `my.satnam.pub`.

**Therefore, the planned changes are not expected to introduce any breaking changes to user-facing website functionality.**

- **API base URL fallback** (line ~13): optionally update if API host changes:

  ```js
  // Current production LNbits API endpoint:
  return "https://api.my.satnam.pub";
  ```

- **Request-domain fallback** (line ~38-40):

  ```js
  // Current:
  return allowed.has(host)
    ? host
    : process.env.LIGHTNING_ADDRESS_DOMAIN || "satnam.pub";

  // Proposed:
  const defaultDomain =
    process.env.LIGHTNING_ADDRESS_DOMAIN ||
    process.env.VITE_PLATFORM_LIGHTNING_DOMAIN ||
    "my.satnam.pub";

  return allowed.has(host) ? host : defaultDomain;
  ```

- **Base-URL decision** (line ~155):

  ```js
  // Current:
  if (customDomain && customDomain !== "satnam.pub") {
    return `https://${customDomain}`;
  }

  // Proposed:
  const defaultDomain =
    process.env.VITE_PLATFORM_LIGHTNING_DOMAIN || "my.satnam.pub";

  if (customDomain && customDomain !== defaultDomain) {
    return `https://${customDomain}`;
  }
  ```

7. **`api/lnurl/[username]/callback.js`**

   - **Request-domain fallback** (line ~22-25):

     ```js
     // Current:
     return allowed.has(host)
       ? host
       : process.env.LIGHTNING_ADDRESS_DOMAIN || "satnam.pub";

     // Proposed:
     const defaultDomain =
       process.env.LIGHTNING_ADDRESS_DOMAIN ||
       process.env.VITE_PLATFORM_LIGHTNING_DOMAIN ||
       "my.satnam.pub";

     return allowed.has(host) ? host : defaultDomain;
     ```

   - **Success message** (line ~41):

     ```js
     // Current:
     message: `Payment sent to ${username}@${domain || "satnam.pub"}`;

     // Proposed:
     message: `Payment sent to ${username}@${domain || "my.satnam.pub"}`;
     ```

### Phase 4 – CORS and app domain

8. **`api/auth/clear-refresh-cookie.js`**

   - Current:

     ```js
     const corsHeaders = {
       'Access-Control-Allow-Origin':
         process.env.VITE_APP_DOMAIN || 'https://www.satnam.pub',
       ...
     };
     ```

   - Proposed:

     ```js
     const corsHeaders = {
       'Access-Control-Allow-Origin':
         process.env.VITE_APP_DOMAIN || 'https://my.satnam.pub',
       ...
     };
     ```

9. **`api/auth/nip07-challenge.js`**

   - **Allowed production origin check** (line ~221):

     ```js
     // Current:
     if (origin && new URL(origin).origin === "https://satnam.pub")
       return origin;

     // Proposed:
     const allowedOrigin =
       process.env.VITE_APP_DOMAIN || "https://my.satnam.pub";
     if (origin && new URL(origin).origin === allowedOrigin) return origin;
     ```

   - **Domain used in challenge payload** (line ~310) already uses `VITE_APP_DOMAIN` as fallback and does not need changes.

10. **`api/auth/logout.js`**

    - Current (line ~36):

      ```js
      'Access-Control-Allow-Origin':
        process.env.VITE_APP_DOMAIN || 'https://www.satnam.pub',
      ```

    - Proposed:

      ```js
      'Access-Control-Allow-Origin':
        process.env.VITE_APP_DOMAIN || 'https://my.satnam.pub',
      ```

### Phase 5 – Verification

- Add/update tests to assert:
  - All NIP-05 JSON lookups and storage use `my.satnam.pub` when envs are unset.
  - Lightning Address generation (`register-identity`, LNURL endpoints, custom-node service) uses the canonical domain by default.
  - CORS headers reflect `VITE_APP_DOMAIN` or `https://my.satnam.pub` without any remaining `satnam.pub` / `www.satnam.pub` literals.
- Run existing integration tests around:
  - `register-identity` flows.
  - NIP-05 verification / `.well-known/nostr.json`.
  - LNURL payment flows and logout/auth endpoints.
