# OpenTimestamps-Primary Migration Specification (Identity Forge Attestations)

## 1. Executive Summary

- Identity Forge currently uses the `simpleproof-timestamp` Netlify Function as a **SimpleProof-first, OTS-fallback** timestamp provider.
- Given payment constraints and the desire not to be a billing intermediary, Identity Forge should instead use **OpenTimestamps (OTS) as the primary and canonical attestation provider** for the Identity Forge flow.
- The existing SimpleProof-specific code paths and env vars should be treated as **optional premium / enterprise** features, disabled by default and not required for Identity Forge to function.
- The migration keeps the existing database tables (`simpleproof_timestamps`, `attestations`, `attestation_records`) but **clarifies semantics** and adjusts constraints so that OTS is a first‑class method.
- The goal is to produce a clear, incremental implementation path that:
  - Makes Identity Forge work end‑to‑end using OTS only.
  - Avoids accidental SimpleProof API calls (and billing).
  - Preserves room for a later SimpleProof premium add‑on.

## 2. Scope and Goals

**In scope**
- Identity Forge registration / attestation flow:
  - `/.netlify/functions/simpleproof-timestamp`
  - `src/lib/attestation-manager.ts`
  - `src/components/identity/VerificationOptInStep.tsx`
  - `src/components/identity/ManualAttestationModal.tsx`
- Client configuration & feature flags:
  - `src/config/env.client.ts`
  - `.env.template`
- Database schema & attestation types:
  - `supabase/migrations/20251117_attestation_records.sql`
  - `supabase/migrations/20251117_attestation_provider_health.sql`
  - `database/migrations/034_simpleproof_timestamps.sql`
  - `database/migrations/036_attestations_unified_table.sql`
  - `src/types/attestation.ts`

**Out of scope (for now)**
- Implementing user‑paid SimpleProof premium flows.
- Changing NIP‑03 attestation behavior beyond making OTS semantics explicit.
- Any non‑Identity‑Forge uses of `simpleProofService` beyond confirming they still behave correctly with OTS‑primary.

## 3. High-Level Architecture (Current vs Target)

| Aspect | Current | Target |
| --- | --- | --- |
| Primary provider | SimpleProof API (remote) | OpenTimestamps local stamping |
| Fallback | OpenTimestamps | (Optional) SimpleProof, **disabled by default** |
| Function name | `simpleproof-timestamp` | Same function, semantics = "timestamp service" |
| Env dependency | Requires `VITE_SIMPLEPROOF_API_KEY` for success | Works with **no SimpleProof env**, uses OTS only |
| DB method label | `attestation_records.method` often set to `"opentimestamps"` but CHECK only allows `"simpleproof"` | CHECK updated to allow `"opentimestamps"` explicitly |
| UI copy | Emphasizes "SimpleProof" | Emphasizes "OpenTimestamps / Bitcoin anchored proof" |

## 4. File-by-File Specifications

### 4.1 `netlify/functions_active/simpleproof-timestamp.ts`

**Key functions/types:**
- `type SimpleProofProvider = "simpleproof" | "opentimestamps_fallback"`
- `type ProviderHealthProvider = "simpleproof" | "opentimestamps"`
- `callSimpleProofApi(data, apiKey, apiUrl)`
- `createOpenTimestampsFallbackProof(data)` – already uses `OpenTimestamps` JS lib in the recommended pattern
- `handleCreateTimestamp(body, requestOrigin?)`
- Top‑level `handler`

**Current behavior (simplified):**
```ts
provider = "simpleproof";
apiKey = getEnvVar("VITE_SIMPLEPROOF_API_KEY");
if (!apiKey) return 500 "SimpleProof service not configured";
try {
  apiResult = await callSimpleProofApi(...);
} catch (err) {
  provider = "opentimestamps_fallback";
  apiResult = await createOpenTimestampsFallbackProof(data);
}
// store in simpleproof_timestamps
// insert compressed proof into attestation_records with method
//   provider === "opentimestamps_fallback" ? "opentimestamps" : "simpleproof";
```

**Target behavior:**
- Treat **OpenTimestamps as the default provider** for `action: "create"`.
- Do **not** require `VITE_SIMPLEPROOF_API_KEY` for success.
- Gate any remote SimpleProof API usage behind a **new, explicit server‑side flag** (e.g. `SIMPLEPROOF_REMOTE_ENABLED=false`), defaulting to **false**.
- Preserve `attestation_provider_health` metrics for both `"opentimestamps"` and `"simpleproof"` providers.

**Proposed control flow (pseudocode):**
```ts
// New: explicit provider selection, default OTS
const requestedProvider = body.provider ?? "opentimestamps"; // string union

if (requestedProvider === "opentimestamps") {
  provider = "opentimestamps_fallback"; // keep internal name for now
  apiResult = await createOpenTimestampsFallbackProof(body.data!);
} else if (requestedProvider === "simpleproof") {
  if (!SIMPLEPROOF_REMOTE_ENABLED) {
    return 400 "SimpleProof remote provider disabled";
  }
  apiKey = getEnvVar("VITE_SIMPLEPROOF_API_KEY");
  if (!apiKey) return 500 "SimpleProof API key not configured";
  try {
    provider = "simpleproof";
    apiResult = await callSimpleProofApi(body.data!, apiKey, apiUrl);
  } catch (e) {
    // Either:
    // (A) fail hard for premium flows, or
    // (B) optionally fall back to OTS if spec requires hybrid behavior.
  }
}
// Shared: validate apiResult, write DB, compress proof, return response
```

**New / modified parameters:**
- `SimpleProofRequest` gains optional `provider?: "opentimestamps" | "simpleproof"`.
- For Identity Forge, **no provider is passed**, so it defaults to `"opentimestamps"`.

**Env behavior:**
- Add **server-only** env flag (name to be finalized at implementation time):
  - `SIMPLEPROOF_REMOTE_ENABLED` (boolean, default `false`).
  - When `false`, `handleCreateTimestamp` must **never** call `callSimpleProofApi`.
- Keep `VITE_SIMPLEPROOF_API_KEY` and `VITE_SIMPLEPROOF_API_URL` **optional**: only required if/when `SIMPLEPROOF_REMOTE_ENABLED=true` and `provider: "simpleproof"` is explicitly requested.

**Before / after summary:**
- **Before:** success path requires API key; OTS only used when SimpleProof fails.
- **After:** success path for Identity Forge uses OTS only; SimpleProof is opt‑in and disabled by default.

### 4.2 `src/lib/attestation-manager.ts`

**Key pieces:**
- `AttestationRequest` currently: `{ verificationId, eventType, metadata?, includeSimpleproof?, includeIroh?, nodeId? }`.
- `createAttestation(request)` calls `/.netlify/functions/simpleproof-timestamp` when `includeSimpleproof` is true.

**Current request body:**
```ts
body: JSON.stringify({
  verification_id: request.verificationId,
  event_type: request.eventType,
  metadata: request.metadata,
  data: request.verificationId,
});
```

**Target behavior:**
- Semantically re‑interpret `includeSimpleproof` as **"include timestamp attestation"** where the **default provider is OTS**.
- Optionally support a future `provider`/`premium` flag without breaking existing callers.

**Proposed changes:**
- Leave the function signature unchanged to avoid broad refactors.
- When constructing the request body:
  - Do **not** add a `provider` field (Identity Forge uses the default OTS behavior).
  - Optionally add a TODO/comment that future premium flows may set `provider: "simpleproof"`.

**Before / after contract (for Identity Forge path):**
- **Before:** `includeSimpleproof=true` → server attempts SimpleProof first, then OTS fallback.
- **After:** `includeSimpleproof=true` → server uses OTS only (no SimpleProof calls) unless/until a premium mode is explicitly added.

### 4.3 `src/components/identity/VerificationOptInStep.tsx`

**Current behavior:**
- Reads `clientConfig.flags.simpleproofEnabled` and `irohEnabled`.
- If both are false, component renders `null`.
- When user clicks "Verify My Identity":
  - Calls `createAttestation` with `includeSimpleproof: SIMPLEPROOF_ENABLED` and `includeIroh: false`.
- UI copy references "SimpleProof" and generally describes blockchain anchoring.

**Target behavior:**
- Keep the **flag wiring the same** (to avoid wide changes) but update semantics and copy:
  - Treat `simpleproofEnabled` as **"timestampVerificationEnabled"** in documentation and inline comments.
  - UI text should emphasize **OpenTimestamps (free, Bitcoin‑anchored)** instead of SimpleProof branding.

**Planned UI adjustments (high-level):**
- Update headings/descriptions to something like:
  - "Create an OpenTimestamps proof of your account creation (Bitcoin‑anchored, free)."
- Where the method list currently shows "SimpleProof", adjust label to e.g.:
  - "OpenTimestamps (timestamp proof, Bitcoin‑anchored)".
- Ensure existing "Free: No fees or costs" copy still holds and explicitly ties to OTS.

### 4.4 `src/components/identity/ManualAttestationModal.tsx`

**Current behavior:**
- Lets users manually create attestations with `includeSimpleproof` and `includeIroh` toggles.
- Copy describes "SimpleProof" as the blockchain‑anchored method and marks all attestations as free.

**Target behavior:**
- Same as `VerificationOptInStep`, reframe the primary method as **OTS‑based timestamping**.
- Keep boolean toggle semantics but rename labels/descriptions in UI only (implementation continues to send `includeSimpleproof` → OTS by default).

### 4.5 `src/config/env.client.ts`

**Current flags of interest:**
- `const SIMPLEPROOF_ENABLED = (getEnvVar("VITE_SIMPLEPROOF_ENABLED") || "false") === "true";`
- Exposed through `clientConfig.flags.simpleproofEnabled`.

**Target semantics:**
- Without changing the variable names (to avoid regressions), clarify via comments and docs that:
  - `VITE_SIMPLEPROOF_ENABLED` / `simpleproofEnabled` now mean:
    - **"Enable timestamp verification UI (OpenTimestamps‑based)"**.
  - SimpleProof remote API usage is **not** implied by this flag.

**Optional future enhancement (for premium path):**
- Introduce a new flag pair:
  - `VITE_SIMPLEPROOF_PREMIUM_ENABLED` → `clientConfig.flags.simpleproofPremiumEnabled`.
- Only when this is true should the client ever request `provider: "simpleproof"` from the Netlify function.

### 4.6 `.env.template`

**Current SimpleProof section:**
- `VITE_SIMPLEPROOF_ENABLED=false`
- `VITE_SIMPLEPROOF_API_KEY=...`
- `VITE_SIMPLEPROOF_API_URL=https://api.simpleproof.com`
- `VITE_SIMPLEPROOF_FEE_WARNINGS_ENABLED=true`

**Target updates:**
- Clarify comments so that:
  - `VITE_SIMPLEPROOF_ENABLED` = "Enable Identity Forge timestamp verification UI (OpenTimestamps primary)."
  - `VITE_SIMPLEPROOF_API_KEY` and `VITE_SIMPLEPROOF_API_URL` are **optional** and only needed when a future premium SimpleProof flow is enabled.
- Add a **server‑only** variable placeholder for `SIMPLEPROOF_REMOTE_ENABLED` with default `false` and clear warning that enabling it will cause the server to call the SimpleProof API and incur costs.

### 4.7 Database schema files

#### 4.7.1 `supabase/migrations/20251117_attestation_records.sql`

**Current:**
```sql
method TEXT NOT NULL CHECK (method IN ('simpleproof', 'pkarr', 'iroh', 'nip03'));
```
But the function already writes `method = 'opentimestamps'` when `provider === 'opentimestamps_fallback'`.

**Required change:**
- Update CHECK to include OTS explicitly:
```sql
CHECK (method IN ('simpleproof', 'opentimestamps', 'pkarr', 'iroh', 'nip03'))
```
- This is a **backwards‑compatible fix** that makes existing/will‑be‑created OTS records valid.

#### 4.7.2 `supabase/migrations/20251117_attestation_provider_health.sql`

- Already defines `provider TEXT PRIMARY KEY CHECK (provider IN ('simpleproof', 'opentimestamps'))`.
- No schema change needed; ensure we continue calling `updateProviderHealth` with `"opentimestamps"` when OTS is used.

#### 4.7.3 `database/migrations/034_simpleproof_timestamps.sql`

- No schema change strictly required for OTS‑primary; semantics become:
  - `simpleproof_timestamps.ots_proof` may originate from either SimpleProof or OTS.
- **Optional future enhancement:** add a `provider TEXT CHECK (provider IN ('simpleproof','opentimestamps'))` column for analytics and debugging.

#### 4.7.4 `database/migrations/036_attestations_unified_table.sql`

- No change required; the table tracks **which methods were used** via `simpleproof_timestamp_id` and `iroh_discovery_id`.
- Semantics: `simpleproof_timestamp_id` now essentially means "Bitcoin‑anchored timestamp provided by OTS or SimpleProof".

### 4.8 `src/types/attestation.ts`

**Current:**
- `export type AttestationMethod = "kind0" | "simpleproof" | "nip03" | "pkarr";`

**Target options:**
1. **Minimal change (recommended initially):**
   - Leave union as‑is, interpret `"simpleproof"` as "Bitcoin‑anchored timestamp provider (OTS‑backed by default)".
2. **Future explicitness:**
   - Extend union to `"simpleproof" | "opentimestamps"` and adjust all usages to handle the new value.


## 5. Breaking Changes & Migration Requirements

- Updating the `attestation_records.method` CHECK constraint is the **only required DB migration**; it is backwards compatible and necessary for correctness.
- Changing server behavior from SimpleProof‑first to OTS‑only may change **latency** and **failure modes** (now entirely dependent on OTS calendars and local library).
- Any code or dashboards that assumed `method='simpleproof'` for all Bitcoin‑anchored proofs should be reviewed to ensure they also understand `method='opentimestamps'`.

## 6. Backward Compatibility

- Environment: existing deployments with `VITE_SIMPLEPROOF_API_KEY` set will no longer rely on it for Identity Forge once OTS becomes primary; this is **intentional**.
- Data: existing test records with `method='opentimestamps'` become valid once the CHECK constraint is updated; no data migration is needed.
- Because current usage is limited to test accounts, the behavior flip is effectively greenfield.

## 7. Testing Implications

Recommended test scenarios after implementation:
- Identity Forge registration:
  - With `VITE_SIMPLEPROOF_ENABLED=true`, `SIMPLEPROOF_REMOTE_ENABLED=false`.
  - Create account → attestation created → `simpleproof_timestamps` row exists → corresponding `attestation_records` row with `method='opentimestamps'`.
- Error handling:
  - Corrupt `data` input, invalid `verification_id`, and rate‑limit violations still return appropriate 4xx/429.
- Flags:
  - With `VITE_SIMPLEPROOF_ENABLED=false`, Identity Forge verification step is hidden.
- Optional future premium path:
  - When `SIMPLEPROOF_REMOTE_ENABLED=true` and a client explicitly requests `provider:"simpleproof"`, verify that the function calls SimpleProof, records provider health as `"simpleproof"`, and handles errors without charging you silently when disabled.

## 8. Documentation Updates

- Update any user‑facing or internal docs that currently describe "SimpleProof" as the primary provider for Identity Forge to explain:
  - Identity Forge uses **OpenTimestamps** as the canonical attestation provider.
  - SimpleProof integration is optional and disabled by default.
- Document the meaning of new/repurposed env vars (`VITE_SIMPLEPROOF_ENABLED`, `SIMPLEPROOF_REMOTE_ENABLED`).

## 9. Implementation Checklist

1. **Netlify Function:** Refactor `handleCreateTimestamp` to default to OTS; add optional `provider` parameter and `SIMPLEPROOF_REMOTE_ENABLED` gate.
2. **Client Orchestrator:** Confirm `createAttestation` continues to call the function without a `provider` field and relies on new OTS‑primary behavior.
3. **UI Components:** Refresh copy in `VerificationOptInStep` and `ManualAttestationModal` to reference OTS and free Bitcoin‑anchored proofs.
4. **Env & Config:** Adjust comments in `.env.template` and `env.client.ts` to reflect new semantics; add `SIMPLEPROOF_REMOTE_ENABLED` placeholder.
5. **Database:** Apply `attestation_records.method` CHECK constraint update to include `"opentimestamps"`.
6. **Types:** Optionally clarify or extend `AttestationMethod` once OTS usage is stable.
7. **Testing:** Run the outlined test scenarios in staging with both flags enabled/disabled.
8. **Rollout:** Enable OTS‑based verification in production by setting `VITE_SIMPLEPROOF_ENABLED=true` while keeping `SIMPLEPROOF_REMOTE_ENABLED=false`.

