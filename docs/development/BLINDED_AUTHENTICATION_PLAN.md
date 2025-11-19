# Blinded Authentication Plan for Lightning Addresses on Satnam

## 0. Scope and Goals

This document analyzes how a **blinded-authentication service** (inspired by Mutiny’s “Blinded Authentication Tokens in Mutiny”) could enhance Satnam’s Lightning Address stack across:

1. **Security & Resilience**
2. **Privacy & Usefulness**
3. **Integration Architecture** (Netlify Functions, LNbits, NIP-05 / user_identities, Supabase)
4. **Cost–Benefit Trade-offs**

The intent is **design-only**: no implementation details here are committed; this is a blueprint for future work.

---

## 1. Background: Mutiny’s Blinded Authentication Approach

Mutiny’s blog describes a system with three key ideas:

1. **Federated Lightning Addresses via Fedimint**

   - Users receive payments to a **federation ecash gateway** instead of hodl invoices.
   - A “Hermes” LNURL server creates an **ecash contract** that spends to a pubkey-locked ecash note.
   - Once the gateway is paid, the federation issues ecash to the user; Hermes never controls the funds.

2. **Blinded Registration Tokens**

   - Paying users query a **blind auth server** for which services they’re entitled to use.
   - For a Lightning Address service, each eligible user can register **exactly one** username.
   - The client generates a random secret, blinds it, and asks the auth server to **blind-sign** it.
   - The auth server records only that it **issued one token** for that user + service; it never learns the unblinded secret.
   - The client stores the **unblinded token** locally (and in E2EE backup) as the capability to register an address.

3. **Decoupled Services and Spent-Token Tracking**
   - The **address server** (Hermes) receives the unblinded token when the user registers an address.
   - Hermes checks if the token is valid and **unused**, then marks it as spent.
   - The blind-signing key is isolated in the **auth server**; the address server can verify but not mint tokens.
   - This separation allows Mutiny to gate paid features **without learning who the user is** or correlating actions over time.

We will not copy the exact Fedimint-based flow, but we **reuse the architectural pattern**:

- **Blind-auth service** issues unlinkable tokens based on Satnam’s existing auth (JWT / NIP-07 / NIP-05-password / OTP).
- **LN address & LNbits services** (Netlify functions + Supabase) **consume** tokens to gate privacy-sensitive operations.

---

## 2. Current Satnam Architecture (Lightning & Identity)

### 2.1 LNbits Integration & LNURL

Key files:

- `netlify/functions/lnbits-proxy.ts` (wrapped by `netlify/functions_active/lnbits-proxy.ts`)

  - Central proxy for LNbits operations.
  - Uses Node `crypto` for encryption/HMAC; rate-limiting via `checkRateLimit()` and `RATE_LIMITS.WALLET_OPERATIONS`.
  - Handles public LNURL actions:
    - `lnurlpWellKnown` → LNURL-pay discovery for Lightning Addresses.
    - `lnurlpDirect` → direct forwarding to external Lightning Address.
    - `lnurlpPlatform` → platform LNURL callback backed by LNbits invoices.
  - Handles authenticated LNbits wallet operations:
    - `createLightningAddress` → creates LNURLp link via `/lnurlp/api/v1/links` using per-user admin key.
    - Payment sending, wallet provisioning, bolt cards, NWC, tapsigner flows, etc.

- `api/endpoints/lnbits.js`

  - Browser-side helpers (behind JWT via `fetchWithAuth`) that call the Netlify proxy:
    - `createLightningAddress(body?)` → POST `action: "createLightningAddress"` to `/.netlify/functions/lnbits-proxy`.

- `src/components/LNBitsIntegrationPanel.tsx`
  - UI flow for:
    - Wallet provisioning.
    - Lightning Address creation via LNbits (for Satnam or custom nodes).

### 2.2 Lightning Address Routing & LNURL HTTP Endpoints

Two LNURL stacks coexist:

1. **Platform LNURL via Netlify Functions + LNbits**

   - Exposed by `netlify/functions/lnbits-proxy.ts` for:
     - LNURL metadata (`lnurlpWellKnown`).
     - Direct and platform callbacks (`lnurlpDirect`, `lnurlpPlatform`).
   - Uses Supabase RPC `public.get_ln_proxy_data(p_username)` (`supabase/migrations/20251011_hybrid_minimal_custody_lightning.sql`) to load:
     - `external_ln_address`, `lnbits_wallet_id`, decrypted `invoice_key`, and `platform_ln_address`.

2. **Family-banking LNURL via `api/lnurl/[username].js` + `callback.js`**
   - `api/lnurl/[username].js`
     - Validates `username` and looks up a **family member**.
     - Builds LNURL-pay metadata:
       - `callback: https://{domain}/api/lnurl/{username}/callback`.
       - `metadata` with `text/identifier` and `text/plain` descriptions.
       - `allowsNostr` + `nostrPubkey` for zaps.
   - `api/lnurl/[username]/callback.js`
     - Handles LNURL callbacks and generates invoices (currently mock / demo logic).

### 2.3 Identity, NIP-05, and Privacy-First DB

- **NIP-05 resolution**

  - `netlify/functions/nostr.ts` and `netlify/functions_active/nip05-resolver.ts` work with `nip05_records` to expose `.well-known/nostr.json`.
  - `netlify/functions/nip05-artifact-upsert.js` securely updates NIP-05 artifacts and writes `nip05_records` with HMAC-based `name_duid` and `pubkey_duid`.

- **User identities & Lightning address fields**

  - `database/minimal-register-identity-migration.sql` / `database/step-by-step-table-creation.sql` / `database/unified-user-table-migration.sql` define `user_identities` with fields like:
    - `username`, `npub`, `nip05`, `lightning_address`, `role`, `spending_limits`, `privacy_settings`.
  - `netlify/functions/db.ts` exposes a **privacy-first** interface:
    - `lightningAddresses.updateHashedAddress({ user_duid, lightning_address_duid?, encrypted_config? })` updates `user_identities.privacy_settings`.

- **Legacy `lightning_addresses` tables**
  - Old schema in:
    - `netlify/functions/migrations/001_identity_forge_schema*.sql`.
    - `src/lib/supabase.ts`, `services/lightning.ts`, `services/identity.ts`.
  - Privacy-first migrations (`database/privacy-first-identity-system-migration.sql`, `database/privacy-first-migration-complete.sql`) aim to **eliminate** these and consolidate into `user_identities` + privacy tables.

### 2.4 Authentication & Session Layer

- **NIP-07 extension auth**

  - `api/auth/nip07-challenge.js` → secure challenge generation.
  - `api/auth/nip07-signin.js` → verifies signed events, derives DUID via `nip05_records` HMACs, and issues JWT via `SecureSessionManager` / `jose`.
  - Exposed via Netlify function wrapper `netlify/functions/auth-nip07-signin.js` and unified router `api/auth/signin.js`.

- **NIP-05 + password auth**

  - `api/auth/signin.js` routes NIP-05/password flows to dedicated handlers.
  - `database/nip05-password-schema.sql` stores hashed / encrypted NIP-05 credentials keyed by `privacy_users.hashed_uuid`.

- **Unified session JWTs**

  - `netlify/functions_active/auth-unified.js` and `netlify/functions_active/signin-handler.js` issue access tokens with claims:
    - `userId` (DUID), `hashedId`, `nip05`, `role`, `type: "access"`, `sessionId`.
  - Frontend uses `SecureTokenManager` and `fetchWithAuth` to attach `Authorization: Bearer <JWT>` to LNbits proxy and other APIs.

- **OTP / migration flows**
  - `netlify/functions/auth-migration-otp-generate.ts` & `auth-migration-otp-verify.ts` implement RFC 6238 TOTP and replay protection, using Supabase tables like `migration_otp_sessions`.
  - `lib/nostr-otp-service.ts` handles gift-wrapped OTP delivery over Nostr (NIP-59 / NIP-04).

---

## 3. Security & Resilience Benefits of Blinded Authentication

### 3.1 Securing Lightning Address Operations

**Today:**

- Lightning Address creation (`createLightningAddress`) is gated by **authenticated user sessions** (JWT) and database-backed LNbits wallet config (per-user admin keys, invoice keys, rate limits).
- The **LNbits proxy** and underlying DBs still see a relatively direct mapping:
  - `auth.users.id` / `user_identities.id` → `user_lightning_config` → LNbits wallet keys → Lightning Address.

**With blinded authentication tokens:**

1. **Capability-style access control**

   - Introduce a **blinded token** as a one-time capability for sensitive Lightning operations:
     - e.g. “register a platform Lightning Address once”, “rotate LN address with privacy guarantees”, “enable LNbits scrubbing”.
   - Instead of checking only JWT + roles, the LNbits proxy would require a valid **blinded token** for certain actions (especially those that leak metadata or create public identifiers).

2. **Separation of trust domains**

   - **Blind auth issuer** Netlify Function (new) holds the **signing key** and entitlement logic (e.g. paid plan, role-based limits) but:
     - never learns the final LN address or LNbits config.
   - **LN address / LNbits proxy** only sees **unblinded tokens** at registration time and validates them without access to issuance secrets.
   - Compromise of one service (issuer or LNbits proxy) does **not** expose the full mapping between identities, entitlements, and specific Lightning Addresses.

3. **Safer LNbits key usage**
   - Tokens can gate **dangerous** LNbits actions (e.g. enabling Scrub, creating forwarding rules, linking external nodes) by ensuring:
     - Only clients who have been recently authenticated and issued a blind token can call those actions.
   - Reduces blast radius if JWTs are leaked or if LNbits proxy endpoints are abused.

### 3.2 Resilience to Disruptions, Censorship, Attacks

1. **Decoupled issuance vs. consumption**

   - Issuance can happen through any **auth-unified**/`signin-handler` flow (NIP-07, NIP-05-password, OTP) → **blinded token minted once**.
   - Consumption occurs at LNURL / LNbits endpoints; those endpoints only need to check **token validity + spent status**.
   - If one LNURL server or LNbits deployment is censored or attacked, a user’s token can be reused on an **alternative deployment** without re-issuing identity-specific credentials (subject to policy).

2. **Rate-limiting + spent-token replay protection**

   - Combine existing DB-backed rate-limits (`checkRateLimit`, `RATE_LIMITS.WALLET_OPERATIONS`) with:
     - **Spent-token tables** (e.g. `blinded_tokens_spent`) keyed by token digest.
     - This protects against replay attacks and large-scale abuse even if LNURL endpoints are hammered.

3. **Reduced metadata exposure on compromise**
   - Today, compromise of `user_lightning_config` or `user_identities` can reveal Lightning Addresses directly.
   - With a blinded layer, the **entitlement records** (who is allowed Lightning services) and the **address mappings** (Lightning Address → LNbits wallet) can be separated and individually hardened.

### 3.3 Protection Against Correlation & Metadata Leakage

1. **Indistinguishable entitlements**

   - Blind auth issuer only stores **entitlement metadata** per DUID or hashed UUID (e.g. “this user may register 1 Lightning Address”) and a count of issued tokens.
   - Actual LN address registration is performed using **unblinded tokens** that carry no direct user identifier.

2. **Minimal server-side logs**

   - LNURL responses (`lnurlpWellKnown`, `lnurlpPlatform`, `api/lnurl/[username].js`) will only log:
     - Username / domain.
     - Payment amounts / comments.
   - The **link** between these and the real-world identity in `user_identities` is protected by:
     - Hashed identifiers (`user_duid`, `name_duid`, `pubkey_duid`).
     - Blinded tokens that never appear in clear in the auth-issuer DB.

3. **Optional per-payment privacy enhancements**
   - Blinded tokens could gate **enhanced privacy routes**, e.g.:
     - Use `lnurlpPlatform` with Scrub and mix-like routing configured.
     - Require token for `lnurlpDirect` when forwarding to an external address to avoid abuse and correlation.

---

## 4. Privacy & Usefulness Enhancements

### 4.1 Preserving User Privacy for Lightning Addresses

1. **Single-address capability without identity leak**

   - Similar to Mutiny’s “one username per paying user”, Satnam can:
     - Allow **one canonical Lightning Address** per identity (e.g. `username@my.satnam.pub`).
     - Enforce this via blinded tokens issued when a user completes **identity registration** (`register-identity.ts`) or **paid upgrade**.
   - Auth issuer learns only: “DUID X has used its Lightning Address entitlement” — not:
     - The actual `username`.
     - The LNURL metadata.

2. **Decoupling NIP-05 and Lightning Address visibility**

   - NIP-05 records (`nip05_records` + artifacts) and Lightning Addresses can remain **loosely coupled**:
     - NIP-05 domain: `@my.satnam.pub` (per existing standardization plan).
     - Lightning Addresses may be transparent (e.g. `child@my.satnam.pub`) but the entitlement tracker doesn’t know _which_ child, only that some pseudonymous user used a token.

3. **No centralized “who uses Lightning” honeypot**
   - `user_identities` may store only **hashed_lightning_address** (or a DUID) in `privacy_settings.lightning_config` via `db.ts.lightningAddresses.updateHashedAddress`.
   - Blind auth issuer stores only **token digests + service_id**.
   - LNbits proxy and LNURL endpoints store only:
     - LNURLp links / usernames / LNbits wallet IDs, without direct mapping to auth identities.

### 4.2 New Capabilities Enabled by Blinded Tokens

Concrete features that become easier and safer:

1. **Paid / tiered Lightning features without identity leak**

   - E.g. **Satnam+** subscription could unlock:
     - Higher LNURL limits, additional privacy routes (Scrub), or multiple Lightning Addresses.
   - Entitlements expressed as blinded tokens ("1 × premium LN address", "5 × high-privacy withdrawals").

2. **Per-device capabilities**

   - Each device can hold its own blinded token(s), synchronized via existing **E2EE backup infrastructure** (similar to Mutiny’s E2EE key store).
   - If a device is lost, revocation = invalidate **future token issuance** for that DUID; previously spent tokens remain unlinkable.

3. **Extensible to other services**
   - Same pattern can later gate:
     - Privacy-preserving support tickets.
     - High-rate communications (unified messaging, Nostr-based contact services).
     - Vault / key-rotation operations that must not reveal long-lived identity metadata.

### 4.3 Impact on User Experience

1. **Transparent for basic flows**

   - Users still:
     - Register identity (`register-identity.ts` → JWT issued).
     - Provision a Lightning wallet (`LNBitsIntegrationPanel` → `provisionWallet()`).
     - Click “Create Lightning Address” → behind the scenes, client presents a blinded token.
   - No extra inputs for the user; token handling is **automatic**.

2. **Clear recovery semantics**

   - If a user loses their device without backup, they may lose the **original blinded token** (so can’t re-register the same entitlement) unless we design deterministic re-issuance.
   - This is similar to Mutiny’s “if you lose the token, you can’t get a new one” but can be softened using:
     - Deterministic nonces tied to DUID + vault secrets.
     - Guardian / family-federation approval flows to reissue a new token.

3. **Optional advanced controls**
   - Power users could:
     - Explicitly “burn” a Lightning Address token to rotate to a new address (recorded in `lightning_address_history`).
     - View their remaining “capability tokens” in an advanced settings panel.

---

## 5. Integration Architecture for Satnam

### 5.1 Where to Integrate Blinded Tokens

**Auth & issuance side (Netlify Functions + Supabase):**

- New Netlify function (conceptual): `blinded-auth-issue` (ESM-only under `netlify/functions_active/`).

  - Responsibilities:
    - Validate current session via JWT (`auth-unified` / `signin-handler`).
    - Look up **entitlements** from Supabase (e.g. `user_identities`, `privacy_users`, future `subscription_plans`).
    - Perform **blind-signing** of client-provided blinded messages (one per service, per policy).
    - Increment “issued token” counters but **never** store unblinded tokens.

- Database layer:
  - New tables (conceptual examples):
    - `blinded_service_entitlements` (by `user_duid` / hashed_uuid):
      - Columns: `user_duid`, `service_id`, `max_tokens`, `issued_tokens`, `created_at`, `updated_at`.
    - `blinded_tokens_spent` (service-side replay protection):
      - Columns: `service_id`, `token_digest`, `spent_at`, optional `meta`.
  - These integrate with existing privacy-first primitives:
    - Use **hashed DUIDs** and **HMACs** (similar to `nip05_records.name_duid` / `pubkey_duid`).

**Consumption side (LNbits & LNURL services):**

- `netlify/functions/lnbits-proxy.ts` (plus wrapper in `netlify/functions_active/lnbits-proxy.ts`):

  - For actions like `createLightningAddress`, `lnurlpPlatform`, or high-privacy Scrub config:
    - Accept an additional field `payload.blinded_token`.
    - Call a shared validator (e.g. `validateBlindedToken(serviceId, token)`):
      - Unblind & verify signature using **verification key** (no signing key here).
      - Check `blinded_tokens_spent` to prevent reuse.
  - Continue to use Supabase RPC `public.get_ln_proxy_data` for LNbits details; tokens sit orthogonally on top.

- `api/lnurl/[username].js` and `api/lnurl/[username]/callback.js`:
  - For **family banking** addresses, we can optionally require blinded tokens for:
    - High-privacy payment flows.
    - Certain family roles (e.g. offspring addresses with guardian-approved tokens).

### 5.2 Lightning Address Data Flow with Blinded Tokens

1. **Issuance phase (once per user or per plan)**

   - User completes auth (NIP-07, NIP-05/password, or OTP) → `auth-unified` issues JWT.
   - Frontend calls `/.netlify/functions/blinded-auth-issue` with a blinded message for `service_id = "lightning-address"`.
   - Auth issuer:
     - Verifies JWT & entitlements for this `user_duid`.
     - Blind-signs the message; increments `issued_tokens`.
     - Returns the **blind-signed token** to the client.
   - Client unblinds and stores token in E2EE storage (similar to TOTP secrets / NWC credentials).

2. **Registration / creation phase**

   - User requests Lightning Address creation from UI (`LNBitsIntegrationPanel → createLightningAddress`).
   - Client includes `blinded_token` alongside the usual payload:
     - `{ username, description, min, max, comment_chars, blinded_token }`.
   - `lnbits-proxy`:
     - Validates JWT (existing logic).
     - Validates blinded token for `service_id = "lightning-address"`.
     - Marks token as **spent** in `blinded_tokens_spent`.
     - Proceeds to call LNbits `/lnurlp/api/v1/links` and update relevant Supabase records (`user_lightning_config`, `user_identities.privacy_settings`).

3. **Invoice & payment handling**
   - Subsequent LNURL calls (`lnurlpWellKnown`, `lnurlpPlatform`, family `api/lnurl/[username].js`) do **not** require tokens; they serve public metadata and invoices.
   - For advanced “high-privacy” routes (e.g. Scrub forwarding, special limits), a **second token type** could be required when setting up or using those routes.

### 5.3 Schema-Level Changes

New or updated DB structures (illustrative):

- `blinded_service_entitlements` (per-user entitlement tracking).
- `blinded_tokens_spent` (per-service replay blacklist).
- Optional additions to `user_identities.privacy_settings`:
  - `"lightning_config"` object already supported by `db.ts.lightningAddresses.updateHashedAddress`.
  - Could include hashed Lightning Address DUIDs and feature flags (e.g. `{ has_blinded_ln_address: true }`).
- Existing tables reused:
  - `nip05_records` for domain / username reservation and NIP-05 artifact updates.
  - `user_lightning_config` / `lnbits_wallets` / `lightning_address_history` for LNbits integration and address rotation.

---

## 6. Cost–Benefit Analysis

### 6.1 User Benefits

- **Stronger privacy guarantees**

  - Lightning Address registration and premium privacy features become **unlinkable** from long-lived identities.
  - Fewer data points exist that correlate NIP-05 / npub / Lightning Address usage.

- **Safer premium features**

  - Paid or role-gated capabilities (Scrub, higher limits, multiple addresses) can be offered **without** tracking users directly.

- **Consistent UX**
  - For most flows, tokens are invisible; users simply see “Create Lightning Address” or “Enable privacy mode” buttons.

### 6.2 Developer / Platform Benefits

- **Reduced liability and honeypots**

  - Entitlements and Lightning mappings are separated; compromise of one DB does not fully deanonymize the system.

- **Cleaner authorization model**

  - Capability-style blinded tokens allow fine-grained gating of expensive / risky operations **without** complex role checks on every endpoint.

- **Future-proofing**
  - Same blinded infra can be reused for:
    - Privacy-preserving support tickets.
    - Paid communications channels.
    - Guardian / federation workflows.

### 6.3 Trade-offs & Costs

- **Implementation complexity**

  - Requires:
    - Designing and implementing a secure blind-signature scheme (ideally using audited libraries, potentially from the `@scure` ecosystem or equivalent).
    - New Netlify functions for issuance + validation.
    - New Supabase tables and RLS policies.

- **Performance overhead**

  - Blind-signing and verification add crypto operations on top of existing JWT + HMAC checks, though this is likely minor compared to LNbits and network IO.

- **Compatibility & standards**

  - Lightning Network and LNbits infrastructure remain unchanged; blinded tokens operate **above** these layers.
  - Careful design is needed to ensure that blinded flows do not conflict with existing LNURL semantics or NWC integrations.

- **UX and recovery friction**

  - Users must not lose their blinded tokens; robust E2EE backup and recovery (potentially via family federation / guardian approval) is required.

- **Operational complexity**
  - Operating two tightly-coupled services (auth issuer + LN address consumer) increases deployment and monitoring surface area.

---

## 7. Next Steps (Non-Binding)

1. Prototype schema for `blinded_service_entitlements` and `blinded_tokens_spent` aligned with `privacy-first-identity-system-migration.sql` and existing RLS.
2. Design Netlify Functions interfaces for:
   - `blinded-auth-issue` (issuance, per-service policies).
   - Shared `validateBlindedToken()` utility (likely under `netlify/functions_active/utils/`).
3. Threat-model the blind-signature choice (RSA vs. EC-based) and select audited libraries with minimal bundle impact.
4. Integrate with `lnbits-proxy` for Lightning Address creation first, then extend to other privacy-sensitive operations.
