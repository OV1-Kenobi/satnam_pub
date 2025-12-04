# Phase 4: Federation LNURL Implementation Plan

**Date:** 2025-12-03  
**Status:** Planning (Pending User Approval)  
**Dependencies:** Phase 3 (Frontend Integration) - Approved ✓

---

## 1. Summary of Current State

### 1.1 `provisionFederationWallet` in `api/family/foundry.js`

**Current behavior** (lines 415–467):

```javascript
async function provisionFederationWallet(
  authHeader,
  federationDuid,
  federationHandle
) {
  const username = `federation_${federationDuid}`;
  const password = crypto.randomUUID(); // One-time bootstrap secret
  const wallet_name = `Federation Treasury (${federationHandle})`;

  const response = await fetch("/.netlify/functions/lnbits-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      action: "provisionWallet",
      payload: { username, password, wallet_name },
    }),
  });
  // ...
  const walletId = String(result.data.wallet.id);
  return { success: true, walletId };
}
```

**Critical gap:** Only `walletId` is captured. The `admin_key` and `invoice_key` returned by LNbits are **discarded**, making it impossible to:

- Create invoices for incoming LNURL payments
- Make outbound payments from the federation wallet
- Configure NWC or Scrub forwarding

### 1.2 `lnbits-proxy.ts` `provisionWallet` Action

**Current behavior** (lines 863–889):

- Admin-scoped operation using LNbits User Manager API
- Creates user: `POST /usermanager/api/v1/users` with `{ username, password }`
- Creates wallet: `POST /usermanager/api/v1/wallets` with `{ user_id, wallet_name }`
- Returns: `{ success: true, data: { user, wallet } }`

**The `wallet` object includes:**

- `id` (wallet_id)
- `adminkey` / `admin_key`
- `inkey` / `invoice_key`

These keys are returned to the caller but **not stored anywhere** for federation wallets.

### 1.3 `public.get_ln_proxy_data(p_username)` for Individual Users

**Current behavior** (lines 188–216 of `20251011_hybrid_minimal_custody_lightning.sql`):

```sql
SELECT user_id, external_ln_address, lnbits_wallet_id,
       private.dec(lnbits_invoice_key_enc) AS invoice_key,
       platform_ln_address
  FROM public.user_lightning_config
 WHERE nip05_username = lower(p_username);
```

- Looks up by `nip05_username` (without domain)
- Decrypts invoice key via `private.dec()`
- Returns JSON with wallet data for LNURL invoice generation

**Limitation:** Only supports individual users; no federation awareness.

### 1.4 Secure Decrypt Wrappers

**`private.get_invoice_key_for_wallet(p_wallet_id, p_caller, p_request_id)`:**

- Looks up `user_lightning_config` by `lnbits_wallet_id`
- Decrypts via `private.dec()`
- Full audit logging to `private.lnbits_key_access_audit`
- Restricted to `service_role` only

**Same pattern for `private.get_admin_key_for_wallet()`.**

### 1.5 Current Federation Storage

**`family_federations` table has:**

- `federation_npub_encrypted` (Noble v2, PRIVACY_MASTER_KEY)
- `federation_nip05_encrypted` (Noble v2, PRIVACY_MASTER_KEY)
- `federation_lightning_address_encrypted` (Noble v2, PRIVACY_MASTER_KEY)
- `federation_nsec_encrypted` (browser-side encryption)
- `federation_lnbits_wallet_id` (plaintext wallet ID only)

**Missing for full wallet functionality:**

- `lnbits_admin_key_enc` (encrypted admin key)
- `lnbits_invoice_key_enc` (encrypted invoice key)
- `external_ln_address` (optional external custody)

---

## 2. Requirements Analysis

### 2.1 Core Federation Wallet Capabilities

| Requirement                  | Current State     | Gap                          |
| ---------------------------- | ----------------- | ---------------------------- |
| Receive payments (LNURL-pay) | ❌ No invoice key | Store encrypted invoice_key  |
| Direct spending              | ❌ No admin key   | Store encrypted admin_key    |
| Automated push payments      | ❌ No admin key   | Store encrypted admin_key    |
| Split payments               | ❌ No keys        | Store both keys              |
| External LN address import   | ❌ Not supported  | Add column + RPC support     |
| NWC integration              | ❌ No keys        | Store admin_key + NWC config |

### 2.2 Steward Management Capabilities

| Requirement                        | Implementation Approach      |
| ---------------------------------- | ---------------------------- |
| Configure NWC for federation       | New table or extend existing |
| Set/update external LN destination | `external_ln_address` column |
| RBAC-governed changes              | Steward approval workflow    |

### 2.3 Mapping to Individual User Patterns

| User Pattern                    | Federation Equivalent                         |
| ------------------------------- | --------------------------------------------- |
| `user_lightning_config.user_id` | `federation_duid` or synthetic UUID           |
| `nip05_username`                | `federation_handle`                           |
| `lnbits_wallet_id`              | `federation_lnbits_wallet_id` (exists)        |
| `lnbits_admin_key_enc`          | **NEW:** `federation_lnbits_admin_key_enc`    |
| `lnbits_invoice_key_enc`        | **NEW:** `federation_lnbits_invoice_key_enc`  |
| `external_ln_address`           | **NEW:** `federation_external_ln_address`     |
| `platform_ln_address`           | Derive from `federation_handle@my.satnam.pub` |

---

## 3. Proposed Architecture

### 3.1 Database Schema Changes

**Option A: Extend `family_federations` table (Recommended)**

Add columns directly to existing table, maintaining consistency with current federation identity storage pattern:

```sql
ALTER TABLE family_federations ADD COLUMN IF NOT EXISTS
  federation_lnbits_admin_key_enc TEXT;
ALTER TABLE family_federations ADD COLUMN IF NOT EXISTS
  federation_lnbits_invoice_key_enc TEXT;
ALTER TABLE family_federations ADD COLUMN IF NOT EXISTS
  federation_external_ln_address TEXT;
```

**Encryption approach:**

- Use `private.enc()` / `private.dec()` with `LN_BITS_ENC_KEY` (same as user wallets)
- Consistent with existing hybrid minimal-custody pattern
- Enables reuse of secure decrypt wrappers

**Option B: Create `federation_lightning_config` table**

Create parallel table mirroring `user_lightning_config`:

```sql
CREATE TABLE IF NOT EXISTS public.federation_lightning_config (
  federation_duid TEXT PRIMARY KEY REFERENCES family_federations(federation_duid) ON DELETE CASCADE,
  federation_handle TEXT UNIQUE NOT NULL,
  external_ln_address TEXT,
  platform_ln_address TEXT GENERATED ALWAYS AS (federation_handle || '@my.satnam.pub') STORED,
  lnbits_wallet_id TEXT NOT NULL,
  lnbits_admin_key_enc TEXT NOT NULL,
  lnbits_invoice_key_enc TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Trade-offs:**

- Option A: Simpler, fewer tables, but mixes identity and wallet concerns
- Option B: Cleaner separation, mirrors user pattern exactly, but adds a table

### 3.2 RPC Function Design

**New RPC: `public.get_federation_ln_proxy_data(p_federation_handle text)`**

```sql
CREATE OR REPLACE FUNCTION public.get_federation_ln_proxy_data(p_federation_handle text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r RECORD;
BEGIN
  -- Option A: Query family_federations directly
  SELECT federation_duid,
         federation_external_ln_address,
         federation_lnbits_wallet_id,
         private.dec(federation_lnbits_invoice_key_enc) AS invoice_key,
         (lower(p_federation_handle) || '@my.satnam.pub') AS platform_ln_address
    INTO r
    FROM public.family_federations
   WHERE lower(federation_handle) = lower(p_federation_handle)
     AND is_active = true
   LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'federation_duid', r.federation_duid,
    'external_ln_address', r.federation_external_ln_address,
    'lnbits_wallet_id', r.federation_lnbits_wallet_id,
    'lnbits_invoice_key', r.invoice_key,
    'platform_ln_address', r.platform_ln_address
  );
END$$;
```

**Secure decrypt wrappers for federation wallets:**

```sql
CREATE OR REPLACE FUNCTION private.get_federation_invoice_key_for_wallet(
  p_wallet_id text, p_caller text, p_request_id text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE
  v_key_enc text;
  v_key text;
  v_federation_duid text;
BEGIN
  SELECT f.federation_duid, f.federation_lnbits_invoice_key_enc
    INTO v_federation_duid, v_key_enc
  FROM public.family_federations f
  WHERE f.federation_lnbits_wallet_id = p_wallet_id
  LIMIT 1;

  IF v_key_enc IS NULL THEN
    INSERT INTO private.lnbits_key_access_audit(wallet_id, caller, operation, result, error, request_id)
    VALUES (p_wallet_id, p_caller, 'decrypt_federation_invoice_key', 'failure', 'missing_encrypted_key', p_request_id);
    RAISE EXCEPTION 'Federation invoice key not found for wallet %', p_wallet_id;
  END IF;

  BEGIN
    v_key := private.dec(v_key_enc);
    INSERT INTO private.lnbits_key_access_audit(wallet_id, caller, operation, result, request_id)
    VALUES (p_wallet_id, p_caller, 'decrypt_federation_invoice_key', 'success', p_request_id);
    RETURN v_key;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO private.lnbits_key_access_audit(wallet_id, caller, operation, result, error, request_id)
    VALUES (p_wallet_id, p_caller, 'decrypt_federation_invoice_key', 'failure', SQLERRM, p_request_id);
    RAISE;
  END;
END$$;
```

### 3.3 Netlify Function Changes

**Extend `lnbits-proxy.ts` for federation support:**

1. **Federation handle detection:**

   ```typescript
   // Detect federation handles (e.g., "smith-family" or "federation_xxx")
   const isFederationHandle = (handle: string) =>
     handle.startsWith("federation_") ||
     // Or check DB for federation existence
     federationHandleExists(handle);
   ```

2. **Route to appropriate RPC:**

   ```typescript
   case "lnurlpWellKnown":
   case "lnurlpPlatform": {
     if (await isFederationHandle(username)) {
       const { data, error } = await adminSupabase.rpc(
         "public.get_federation_ln_proxy_data",
         { p_federation_handle: username }
       );
       // ... use federation wallet data
     } else {
       // Existing user wallet path
       const { data, error } = await adminSupabase.rpc(
         "public.get_ln_proxy_data",
         { p_username: username }
       );
     }
   }
   ```

3. **Update `provisionWallet` response handling in `api/family/foundry.js`:**

   ```javascript
   // Capture and store encrypted keys
   const walletId = String(result.data.wallet.id);
   const adminKey = result.data.wallet.adminkey || result.data.wallet.admin_key;
   const invoiceKey =
     result.data.wallet.inkey || result.data.wallet.invoice_key;

   // Encrypt keys via Supabase RPC
   const encAdminKey = await supabase.rpc("private.enc", { p_text: adminKey });
   const encInvoiceKey = await supabase.rpc("private.enc", {
     p_text: invoiceKey,
   });

   return { success: true, walletId, encAdminKey, encInvoiceKey };
   ```

### 3.4 Security and Encryption Approach

| Data                                        | Encryption Method             | Key Source                     |
| ------------------------------------------- | ----------------------------- | ------------------------------ |
| Federation identity (npub, NIP-05, LN addr) | Noble v2 (AES-GCM + PBKDF2)   | `PRIVACY_MASTER_KEY`           |
| Federation nsec                             | Browser-side encryption       | User's Identity Forge password |
| Federation LNbits admin_key                 | `private.enc()` (PGP AES-256) | `LN_BITS_ENC_KEY` in Vault     |
| Federation LNbits invoice_key               | `private.enc()` (PGP AES-256) | `LN_BITS_ENC_KEY` in Vault     |

**RLS Policies for federation wallet columns:**

```sql
-- Stewards and guardians can view/update federation wallet config
CREATE POLICY federation_wallet_steward_access ON public.family_federations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.federation_id = family_federations.id
        AND fm.user_duid = auth.uid()::text
        AND fm.role IN ('steward', 'guardian')
    )
  );
```

---

## 4. Implementation Plan

### Task 4.1: Database Schema Extension (Migration 053)

**Files:**

- `database/migrations/053_federation_wallet_columns.sql` (NEW)

**Changes:**

- Add `federation_lnbits_admin_key_enc`, `federation_lnbits_invoice_key_enc`, `federation_external_ln_address` columns to `family_federations`
- Add RLS policies for steward/guardian access

**Dependencies:** None

**Requires approval:** ✅ Yes (schema change)

---

### Task 4.2: Supabase RPC Functions (Migration 054)

**Files:**

- `database/migrations/054_federation_lightning_rpcs.sql` (NEW)

**Changes:**

- Create `public.get_federation_ln_proxy_data(p_federation_handle)`
- Create `private.get_federation_invoice_key_for_wallet(p_wallet_id, p_caller, p_request_id)`
- Create `private.get_federation_admin_key_for_wallet(p_wallet_id, p_caller, p_request_id)`
- Grant appropriate permissions (service_role only for private functions)

**Dependencies:** Task 4.1

**Requires approval:** ✅ Yes (new RPC functions)

---

### Task 4.3: Update `provisionFederationWallet` to Store Encrypted Keys

**Files:**

- `api/family/foundry.js` (MODIFY)

**Changes:**

- Capture `adminkey` and `inkey` from LNbits response
- Call Supabase `private.enc()` to encrypt both keys
- Return encrypted keys alongside `walletId`
- Update `provisionFederationIdentity` to store encrypted keys in DB

**Dependencies:** Tasks 4.1, 4.2

**Requires approval:** ✅ Yes (changes wallet provisioning behavior)

---

### Task 4.4: Extend `lnbits-proxy.ts` for Federation LNURL

**Files:**

- `netlify/functions/lnbits-proxy.ts` (MODIFY)
- `netlify/functions/utils/secure-decrypt-logger.ts` (MODIFY - add federation support)

**Changes:**

- Add federation handle detection logic
- Route `lnurlpWellKnown`, `lnurlpDirect`, `lnurlpPlatform` to federation RPC when applicable
- Add `getInvoiceKeyWithSafetyForFederation()` helper
- Ensure audit logging covers federation operations

**Dependencies:** Tasks 4.1, 4.2, 4.3

**Requires approval:** ✅ Yes (Netlify function changes)

---

### Task 4.5: NIP-05 Resolver Federation Support

**Files:**

- `netlify/functions_active/nip05-resolver.ts` (MODIFY)
- `netlify/functions/nostr-json.js` (VERIFY - already has federation fallback)

**Changes:**

- Verify existing federation fallback in `nostr-json.js` works with new schema
- Update `nip05-resolver.ts` to handle federation handles for DID resolution
- Decrypt `federation_npub_encrypted` using Noble v2 + `PRIVACY_MASTER_KEY`
- Enforce `my.satnam.pub` domain filtering

**Dependencies:** None (can run in parallel with 4.1-4.4)

**Requires approval:** ✅ Yes (Netlify function changes)

---

### Task 4.6: Federation NWC Integration (Future Phase)

**Scope:** Steward-managed NWC configuration for federation wallets

**Files:**

- TBD: May require new table `federation_nwc_config`
- `netlify/functions/lnbits-proxy.ts` (MODIFY - NWC actions)

**Dependencies:** Tasks 4.1-4.4 complete

**Requires approval:** ✅ Yes (deferred to separate phase)

---

### Task 4.7: Testing

**Approach:** Extend existing tests, no new test files

**Files:**

- `tests/nip05-resolver.integration.test.ts` (MODIFY)
- `netlify/functions/__tests__/lightning-address-api.test.ts` (MODIFY)

**Test cases:**

- Federation LNURL metadata (lnurlpWellKnown)
- Federation invoice creation (lnurlpPlatform)
- Federation external LN address proxy (lnurlpDirect)
- Federation NIP-05 resolution
- Audit logging for federation wallet operations

**Dependencies:** All implementation tasks complete

**Requires approval:** No (test updates only)

---

## 5. Open Questions

### Q1: Schema Approach

**Question:** Should we use **Option A** (extend `family_federations` with wallet columns) or **Option B** (create separate `federation_lightning_config` table)?

**Recommendation:** Option A (extend existing table) for consistency with current identity column pattern. Option B is cleaner but adds complexity.

**Decision needed:** ✅ User input required

---

### Q2: Wallet Provisioning Timing

**Question:** Should federation wallet provisioning automatically capture and store encrypted admin/invoice keys at creation time, or require a separate "activate federation wallet" step?

**Recommendation:** Automatic capture at creation time (modify `provisionFederationWallet`). A separate step adds UX friction.

**Decision needed:** ✅ User input required

---

### Q3: Federation Handle Detection

**Question:** How should `lnbits-proxy` distinguish federation handles from user handles?

**Options:**

1. **Prefix convention:** `federation_{duid}` already used
2. **Database lookup:** Check both `user_lightning_config` and `family_federations`
3. **Explicit flag in request:** Caller specifies `isFederation: true`

**Recommendation:** Option 2 (database lookup) - most robust, no caller changes needed.

**Decision needed:** ✅ User input required

---

### Q4: Steward NWC Configuration Storage

**Question:** Where should steward-managed NWC configurations for federation wallets be stored?

**Options:**

1. Extend `family_federations` with NWC columns
2. Create new `federation_nwc_config` table
3. Reuse existing NWC infrastructure from `lnbits-proxy` (currently user-scoped)

**Recommendation:** Defer to Phase 5 (Task 4.6). Focus on core LNURL first.

**Decision needed:** ⏸️ Deferred

---

### Q5: External LN Address Priority

**Question:** When a federation has both a platform wallet AND an external LN address configured, which takes precedence for incoming payments?

**Recommendation:** Follow user wallet pattern: `external_ln_address` takes precedence (Scrub forwarding). Platform wallet is fallback.

**Decision needed:** ✅ User confirmation

---

## 6. Security Considerations

### 6.1 RLS Policies

- Federation wallet columns accessible only to federation stewards/guardians
- All wallet key access goes through `service_role` Supabase client
- No authenticated user can directly query encrypted keys

### 6.2 Audit Logging

- All key decryption operations logged to `private.lnbits_key_access_audit`
- Include `caller = 'lnurlpPlatform_federation'` or similar to distinguish from user operations
- Existing `logDecryptAudit()` helper extended for federation context

### 6.3 RBAC Integration

| Operation                      | Required Role      | Approval Threshold                |
| ------------------------------ | ------------------ | --------------------------------- |
| View federation wallet balance | steward, guardian  | None                              |
| Create LNURL invoice (receive) | Public (LNURL-pay) | None                              |
| Configure external LN address  | steward            | Steward threshold (if configured) |
| Make outbound payment          | steward            | Steward threshold                 |
| Configure NWC                  | steward            | Steward threshold                 |
| Change federation wallet       | guardian           | Guardian threshold                |

### 6.4 Memory Safety

- Use existing `getInvoiceKeyWithSafety()` pattern with release callbacks
- Decrypted keys never logged
- Keys zeroed after use (via release function)

---

## 7. Approved Decisions (from Previous Conversation)

1. ✅ **Decryption key:** Use `PRIVACY_MASTER_KEY` for federation identity fields (npub, NIP-05, Lightning address)
2. ✅ **LNbits integration:** Use `lnbits-proxy` as sole integration point
3. ✅ **Domain filtering:** Only resolve NIP-05/LNURL for `my.satnam.pub` domain

---

## 8. Next Steps

1. **User reviews and approves this plan**
2. **User answers Open Questions (Q1-Q5)**
3. **Implement Task 4.1** (schema migration) with user approval
4. **Implement Tasks 4.2-4.5** sequentially with approval checkpoints
5. **Task 4.6 (NWC)** deferred to separate phase
6. **Task 4.7 (Testing)** after implementation complete

---

**Document prepared by:** Augment Agent
**Awaiting:** User approval before any implementation
