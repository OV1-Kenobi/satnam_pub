# Stage 5.2 / 5.4 NFC Steward Approvals & Tap-to-Verify Plan

**Document ID:** NFC-AUTH-STAGE-5_4  
**Version:** 0.1 (Draft)  
**Date:** 2025-11-29  
**Status:** PLANNING  
**Related Docs:** `NFC_AUTH_IMPLEMENTATION_PLAN.md`, `NFC_AUTH_TASK_BREAKDOWN.md`

---

## 1. Executive Summary

This document defines the implementation plan for:

1. **Task 5.2 – Steward Policy Helper (Netlify Function)**: a server-side policy engine that derives steward-approval requirements from the privacy-first family schema.
2. **Task 5.4 – NFCAuthService Integration**: enforcing steward approvals in `tapToSpend()` / `tapToSign()` before NTAG424 operations execute.
3. **Task 5.5 (NEW) – Tap-to-Verify Contact Integration**: an NFC-based contact trust-boost flow triggered when a signed-in user taps a card that does _not_ belong to them.

All work must preserve the zero-knowledge, browser-only, serverless architecture and align with Master Context role semantics.

---

## 2. Prerequisites & Dependencies

- **Privacy-first schema** already deployed (see `database/privacy-first-identity-system-migration.sql`):
  - `family_federations` (with `federation_duid`).
  - `family_members` (with `family_role`, `user_duid`, `is_active`, `voting_power`).
  - `ntag424_registrations` linking cards to owners.
- **Auth & sessions**:
  - JWT-based auth via `SecureSessionManager` (`netlify/functions_active/security/session-manager.ts`).
  - Supabase anon-key client for RLS: `netlify/functions_active/supabase.js`.
- **Steward approvals (Task 5.3)**:
  - `src/lib/steward/approval-client.ts` implemented, using CEPS + Nostr DMs.
- **NFC core**:
  - NTAG424 operation producers & hashing: `src/lib/ntag424-production.ts`, `src/lib/nfc-auth.ts`.
  - Unified NFC function for registration/verify: `netlify/functions_active/nfc-unified.ts`.

---

## 3. Task 5.2 – Steward Policy Helper Netlify Function

### 3.1 File & Endpoint

- **File:** `netlify/functions_active/steward-policy.ts`
- **Export:** `export const handler = async (event, context) => { ... }`
- **HTTP Method:** `POST` only (reject others with `405`).
- **Endpoint path (Netlify config):**
  - `export const config = { path: "/steward-policy" };`

### 3.2 Authentication & Session Derivation

- Read `Authorization: Bearer <JWT>` from headers.
- Call `SecureSessionManager.validateSessionFromHeader(authHeader)`.
- On failure: return `401 { success: false, error: "Unauthorized" }`.
- Derive **user context**:
  - `session.userId` (npub-based ID) maps to `user_identities` / `family_members.user_duid` via existing DUID mapping.
  - `session.federationRole` for optional future role gating (e.g. stewards-only operations).

### 3.3 Request Schema

- Content-Type: `application/json`.
- Body (validated server-side):
  - `operation_type: "spend" | "sign"` (required).
  - Optional hints (for future tuning, _not_ required by 5.2 core):
    - `card_uid_hash?: string` (hex, hashed UID using per-user salt).
    - `federation_duid?: string` (hashed federation identifier).

Example:

```json
{
  "operation_type": "spend"
}
```

### 3.4 Response Schema

- On success (`200`):
  - `{
   "success": true,
   "policy": {
     "requiresStewardApproval": boolean,
     "stewardThreshold": number,
     "eligibleApproverPubkeys": string[],
     "eligibleCount": number,
     "federationDuid": string | null
   }
 }`
- On validation/auth errors: `4xx { success: false, error: string }`.
- On internal errors: `500 { success: false, error: "Internal server error" }` with zero-knowledge logs.

### 3.5 Database Lookups (Privacy-First)

Using `getRequestClient(accessToken)` with a JWT derived from session (or the original user JWT if compatible with RLS):

1. **Resolve user federation membership**
   - From `family_members`:
     - Filter: `user_duid = current_user_duid`, `is_active = true`.
     - Join / select `family_federation_id`, `family_role`, `voting_power`.
   - Optionally join `family_federations` to get `federation_duid`.
2. **Determine applicable federation**
   - For initial implementation, assume **single active federation** for the user:
     - Take the most recent active `family_members` row.
   - If none found → treat as **private user** (no steward approvals required).
3. **Enumerate eligible stewards**
   - Query `family_members` for the chosen federation:
     - `family_role IN ('steward','adult')`.
     - `is_active = true`.
   - Join `user_identities` (or equivalent) to get `nostr_pubkey_hex` for each eligible member.
   - Guardian rows (`family_role = 'guardian'`) are _not_ counted toward threshold but may be returned as optional extra approvers in future.

### 3.6 Business Logic

Given `operation_type` and membership data:

1. **Private users** (no federation membership):
   - `requiresStewardApproval = false`, `stewardThreshold = 0`, `eligibleApproverPubkeys = []`.
2. **Federated users**:

   - Compute `eligibleStewards = active members with role in ('steward','adult')`.
   - Let `eligibleCount = eligibleStewards.length`.
   - Derive base policy:
     - For now, **simple rule**:
       - `requiresStewardApproval = eligibleCount >= 1`.
       - `stewardThreshold = min(2, eligibleCount)` for `operation_type = "spend"`.
       - `stewardThreshold = 1` for `operation_type = "sign"` (low friction).
   - Populate `eligibleApproverPubkeys` with each steward’s **hex pubkey**, not npub, to align with `stewardApprovalClient` filters.

3. **Validation & misconfiguration handling** (per Task 5.2 design):
   - If `requiresStewardApproval === true` and either:
     - `stewardThreshold < 1`, or
     - `stewardThreshold > eligibleCount`,
   - → return `409 { success: false, error: "Steward policy misconfigured" }` and log hashed identifiers only.

### 3.7 Error Handling & Logging

- Mirror patterns from `nfc-unified.ts` and `register-identity.ts`:
  - Wrap handler in `try/catch`.
  - Log only: timestamp, operation_type, truncated `federation_duid` / user hash.
  - Never log raw npubs, card UIDs, or Supabase errors in full.

---

## 4. Task 5.4 – NFCAuthService Steward Integration

### 4.1 Target File & Methods

- **File:** `src/lib/nfc-auth.ts`.
- **Methods to update:**
  - `async tapToSpend(request: TapToSpendRequest): Promise<boolean>`.
  - `async tapToSign(request: TapToSignRequest): Promise<string | null>`.
- **Additional helper:**
  - `private async fetchStewardPolicy(operationType: "spend" | "sign"): Promise<StewardPolicy>` calling `/steward-policy`.

### 4.2 Steward Policy Wiring

1. **Before any NFC tap or signing:**

   - Call `fetchStewardPolicy("spend")` / `fetchStewardPolicy("sign")`.
   - If `requiresStewardApproval === false` → proceed with existing NTAG424 flow unchanged.
   - If `true` → gate NFC actions behind steward approvals.

2. \*\*Operation hash computation (for approvals):
   - Reuse NTAG424 operation producers:
     - For spend: pre-construct the logical `NTAG424SpendOperation` _shape_ using request params plus a placeholder UID (or use a client-side hash seed based on future `auth.uid`).
     - Prefer: compute hash **after** NTAG424 auth, once `auth.uid` is known, then request steward approvals referencing that hash.
   - Fields included (confirming `computeOperationHash`):
     - Spend: `type`, `uid`, `amount`, `recipient`, `memo`, `paymentType`, `requiresStewardApproval`, `stewardThreshold`, `privacyLevel`, `timestamp`.
     - Sign: `type`, `uid`, `message`, `purpose`, `requiresStewardApproval`, `stewardThreshold`, `timestamp`.

### 4.3 Flow: tapToSpend()

1. **Steward policy**: call `/steward-policy` (`operation_type = "spend"`).
2. **If approvals not required**: run current NFC tap + `createSignedSpendOperation` + `executeTapToSpend`.
3. **If approvals required**:
   - Perform NTAG424 auth to obtain `auth.uid` (no signing yet).
   - Build unsigned `NTAG424SpendOperation` and compute `operationHash` via `ntag424Manager.getOperationHashForClient`.
   - Call `stewardApprovalClient.publishApprovalRequests` (optional for initial integration) and
     `await stewardApprovalClient.awaitApprovals(operationHash, { required: policy.stewardThreshold, timeoutMs, federationDuid: policy.federationDuid, eligibleApproverPubkeys: policy.eligibleApproverPubkeys })`.
   - If `status !== "approved"` → abort and surface non-sensitive error.
   - If approved → call `createSignedSpendOperation` and `executeTapToSpend`.

### 4.4 Flow: tapToSign()

Same pattern as spend with `operation_type = "sign"`:

1. Fetch policy.
2. If no approvals → proceed directly.
3. If approvals required:
   - Perform NTAG424 auth to get UID.
   - Build an unsigned `NTAG424SignOperation` (with `purpose`, `message`, etc.).
   - Compute `operationHash`.
   - Await approvals as above.
   - For `purpose: "nostr"`, ensure **steward approvals are completed before** using any `signingSessionId` with `secureNsecManager`.

### 4.5 UID Handling (Web NFC vs LNbits Boltcard)

- Primary UID source remains **Web NFC** (`auth.uid` from NTAG424 auth).
- LNbits Boltcard integration (via `lnbits-proxy`) is used for:
  - Wallet provisioning & LNURL auth links.
  - Persisting `card_uid_hash` using per-user salt.
- For Task 5.4, steward approvals rely on `auth.uid` (or its hash) and _do not_ require calling LNbits.

### 4.6 Guardian vs Steward Terminology

- In `TapToSpendRequest` / `TapToSignRequest` and NFC logs:
  - Avoid introducing new guardian semantics; keep existing fields but treat them as **UI-facing placeholders**.
  - Steward behavior is driven entirely by the server-side policy helper and `stewardApprovalClient`.
- Longer term, a refactor will rename request flags to `requiresStewardApproval` / `stewardThreshold`, but this document does **not** change public types yet.

---

## 5. Task 5.5 (NEW) – Tap-to-Verify Contact Integration

### 5.1 High-Level Flow

**Goal:** When a signed-in user taps an NFC card **owned by someone else**, offer a "Tap-to-Verify" path that adds that person to Contacts with a higher trust score.

Constraints:

- **Platform:** Android + Web NFC only (Chrome/Chromium). Must be clearly documented in UI copy.
- **Roles:** All Master Context roles (`"private" | "offspring" | "adult" | "steward" | "guardian"`) may use Tap-to-Verify.

### 5.2 Detection Logic

- Location: `src/lib/nfc-auth.ts` (inside or adjacent to existing NFC tap flows) plus higher-level NFC orchestration components.
- After NTAG424 auth (we know `auth.uid`):
  1. Call a server endpoint (could reuse `nfc-unified` or a new route) to:
     - Look up `ntag424_registrations` by UID.
     - Determine `owner_user_duid`.
  2. Compare `owner_user_duid` with current session user’s DUID (from JWT/session manager).
     - If equal → normal tap operation (no contact flow).
     - If different and owner is discoverable → trigger Tap-to-Verify UX.

### 5.3 User Experience

1. User taps an NFC card (Android only).
2. System detects foreign card owner.
3. Show dialog:
   - "Add this identity to your Contacts with NFC-verified trust?".
   - Display only **high-level** identity info (e.g., NIP-05, display name), never raw DUID or UID.
4. On confirmation:
   - Call existing Contacts API to create/update contact with a **trust tier** indicating "NFC-verified".
5. On cancel or errors:
   - Fall back to normal NFC flow or no-op, with privacy-preserving messaging.

### 5.4 Trust Score Model

- Define trust tiers (conceptual, concrete values to be agreed later):
  - `STANDARD_CONTACT` – added via manual search / invite.
  - `NFC_VERIFIED_CONTACT` – added via Tap-to-Verify.
- Implementation note:
  - Contacts table (e.g., `user_contacts` / existing contact management schema) gains a `trust_level` enum or numeric field.
  - Tap-to-Verify sets `trust_level = NFC_VERIFIED_CONTACT`.

### 5.5 Contact Integration Points

- Find existing contact management modules/APIs (e.g., `src/lib/contacts/*`, `netlify/functions_active/contacts-*.ts`).
- Plan to call a single server endpoint like `POST /contacts/verify-nfc` that:
  - Authenticates caller via JWT.
  - Accepts `card_uid_hash` or `owner_npub`.
  - Resolves or creates a contact row with `trust_level` elevated.

### 5.6 Privacy & Error Handling

- Never expose:
  - Raw `uid`.
  - Internal `user_duid`.
  - Exact federation structure.
- For non-discoverable owners (privacy settings), show a generic message:
  - "This card belongs to a private identity that cannot be added as a contact."
- For missing registrations:
  - Treat as anonymous card, no contact flow.

---

## 6. Implementation Order & Testing Strategy

### 6.1 Order

1. Implement and test **Task 5.2** (`steward-policy` function).
2. Integrate steward policy into **tapToSpend/tapToSign** (Task 5.4), behind feature flags if needed.
3. Design and stub server endpoint + client hooks for **Tap-to-Verify Contacts** (Task 5.5), then wire NFC detection.

### 6.2 Testing

- **Task 5.2:**
  - Unit tests for policy computation given synthetic `family_members` data.
  - Integration tests via Netlify function invoking Supabase test project.
- **Task 5.4:**
  - Tests for NFCAuthService that mock `steward-policy` + `stewardApprovalClient` and assert gating behavior.
- **Task 5.5:**
  - Tests for Tap-to-Verify detection (foreign vs own card) and correct contact API calls.

---

## 7. Security, Privacy & Open Questions

- Steward approvals and Tap-to-Verify must never leak raw card IDs or un-hashed federation identifiers in logs or client payloads.
- All new Netlify functions must follow existing CORS, JSON, and error patterns.

**Open Questions (to confirm before implementation):**

1. Exact `stewardThreshold` policy per operation type – should `spend` always require `min(2, N)` or be configurable per federation?
2. Preferred endpoint path naming: `/steward-policy` vs `/nfc/steward-policy` for consistency with `nfc-unified`.
3. Target contacts schema and precise `trust_level` values for Tap-to-Verify.
4. Whether Tap-to-Verify should _only_ run on explicit user action (e.g., dedicated "Verify Contact" flow) or be offered opportunistically after any foreign-card tap.

---

## 8. Implementation Summary – Steward-Gated NFC Flows (Tasks 5.2 & 5.4)

This section documents the **implemented runtime behavior** of steward-gated NFC
flows as of Task 5.4. It summarizes what actually happens in production code
rather than prescribing future implementation details.

**Key implementation files**

- Steward policy Netlify function: `netlify/functions_active/steward-policy.ts`
- NFC client implementation: `src/lib/nfc-auth.ts`
- NFC behavior tests: `src/lib/__tests__/nfc-auth.test.ts`

### 8.1 tapToSpend() Runtime Behavior

- Before any NFC work, `NFCAuthService.tapToSpend()` calls the
  `/steward-policy` Netlify function via `fetchStewardPolicy("spend")`.
- If the policy call **fails** (network, 5xx, or 409 misconfiguration), the
  method logs a high-level error _without_ DUIDs, pubkeys, or federation IDs
  and returns `false` without starting NFC.
- If the policy call succeeds:
  - When `requiresStewardApproval === false` or `stewardThreshold <= 0`, the
    method runs the **original** NTAG424 tap-to-spend flow:
    - Start NFC listening.
    - Wait for NTAG424 auth.
    - Build a signed `NTAG424SpendOperation` via
      `createSignedSpendOperation()` and execute it via
      `ntag424Manager.executeTapToSpend()`.
  - When `requiresStewardApproval === true` and `stewardThreshold > 0`:
    - Start NFC listening and obtain NTAG424 auth (`uid` etc.).
    - Build an **unsigned** `NTAG424SpendOperation` using the auth UID and
      request fields.
    - Compute a deterministic `operationHash` via
      `ntag424Manager.getOperationHashForClient()`.
    - Publish steward approval requests through `stewardApprovalClient` using
      the operation hash, a truncated `uidHint`, and the eligible
      steward/adult pubkeys from policy.
    - Await approvals via `stewardApprovalClient.awaitApprovals()` with
      `required = stewardThreshold`, a bounded timeout, and optional
      `federationDuid` / `eligibleApproverPubkeys` filters.
    - If the approval status is **not** `"approved"` (i.e. `"rejected"` or
      `"expired"`), NFC listening is stopped and the method returns `false`
      without signing or executing the spend.
    - Only when steward approvals are `"approved"` does the method build a
      signed operation and call `ntag424Manager.executeTapToSpend()`.

### 8.2 tapToSign() Runtime Behavior

- `NFCAuthService.tapToSign()` follows the **same sequencing** as
  `tapToSpend()`, but with `operation_type = "sign"` and
  `NTAG424SignOperation`:
  - Fetch steward policy via `fetchStewardPolicy("sign")`.
  - If the fetch fails, log a high-level error and return `null` without
    starting NFC.
  - If policy says no steward approvals are required, run the existing
    tap-to-sign flow.
  - If approvals are required, perform NTAG424 auth, build an unsigned
    `NTAG424SignOperation`, compute `operationHash`, publish approval
    requests, and call `awaitApprovals()` with the sign threshold.
  - If approvals are not `"approved"`, NFC is stopped and the method returns
    `null` without signing.
  - On `"approved"`, the method builds a signed `NTAG424SignOperation`:
    - For `purpose: "nostr"`, it uses secp256k1 via `secureNsecManager`.
    - For all other purposes, it uses card-scoped P‑256 keys.
    - The final signature is produced by `ntag424Manager.executeTapToSign()`.

### 8.3 Error Handling & Zero-Knowledge Logging

- All NFC steward flows avoid logging:
  - Raw card UIDs.
  - Raw Nostr pubkeys.
  - Raw DUIDs or federation IDs.
- Logs are limited to:
  - Truncated identifiers (e.g. `uid.substring(0, 8) + "..."`).
  - Operation hash prefixes.
  - High-level status messages (e.g. "steward approvals not satisfied").
- For policy and approval errors:
  - Policy fetch failures cause early returns (`false`/`null`) with a generic
    error message, preserving zero-knowledge guarantees.
  - Steward approval failures (`"rejected"` / `"expired"`) abort NTAG424
    operations before any signing or spend/sign execution.
- The behavior described above is validated by
  `src/lib/__tests__/nfc-auth.test.ts`, which mocks `steward-policy` and
  `stewardApprovalClient` to cover success, rejection, expiry, and policy
  failure scenarios.
