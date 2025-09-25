## Pre-Integration Audit: Nostr Event Handling and Validation

Date: 2025-09-25
Scope: Repository-wide (read-only audit)

---

## 1) Inventory: Nostr-related files in src/lib and communications components

- src/lib (files/directories containing "nostr" in the name)
  - src/lib/nostr-profile-service.ts
    - Purpose: Fetch/resolve Nostr kind:0 profiles via Central Event Publishing Service (CEPS) list operations; decode npub to hex via CEPS
  - src/lib/auth/nostr-key-recovery.ts
    - Purpose: Account/key recovery flows leveraging Nostr identity (details not opened in this audit)
  - src/lib/fedimint/family-nostr-federation.ts
    - Purpose: Fedimint-family federation integration referencing Nostr federation constructs
  - src/lib/nip42/
    - Files: capability-detection.ts, challenge-binding.ts, relay-auth.ts
    - Purpose: NIP-42 Relay Authentication helpers (challenge/response, capabilities)

- Full directory listing: src/components/communications
  - FamilyFederationInvitationModal.tsx
  - GiftwrappedMessaging.tsx
  - GiftwrappedOTPModal.tsx
  - GroupMessagingInterface.tsx
  - MessagingIntegration.tsx
  - PeerInvitationModal.tsx
  - PrivacyLevelSelector.tsx
  - PrivateCommunicationModal.tsx
  - VideoMeetingLauncher.tsx

Notes:
- Several Nostr-adjacent modules exist outside src/lib (e.g., lib/central_event_publishing_service.ts). Per project architecture, CEPS centralizes nostr-tools usage.

---

## 2) Validation and signature verification patterns (where found)

- Central Event Publishing Service (CEPS)
  - Path: lib/central_event_publishing_service.ts
  - Key methods:
    - verifyEvent(ev: Event): boolean — wraps nostr-tools verifyEvent with try/catch
    - signEvent(unsignedEvent, privateKeyHex): Event — wraps nostr-tools finalizeEvent
    - getPublicKeyHex(privateKeyHex): string — wraps nostr-tools getPublicKey
    - Extensive publishEvent/list/subscribeMany with event/tag sanitization
  - Usage pattern: Other modules are encouraged to call CEPS.verifyEvent rather than importing nostr-tools directly

- Auth: NIP-07 Sign-in Netlify Function
  - Path: api/auth/nip07-signin.js
  - Custom verifyEvent(event): Promise<boolean>
    - Uses @noble/curves/secp256k1.verify for signature verification (manual parse of hex inputs, message hash computation, constant-time logging)
  - validateNostrEvent(event, expectedChallenge)
    - Structural checks: id, pubkey, created_at, sig; kind == 22242; content == expected challenge; basic timing checks
  - Flow: validate structure/kind/challenge -> verify signature (custom) -> proceed

- Invitations: Signed event validation
  - Path: api/authenticated/process-signed-invitation.js
  - validateSignedEvent(signedEvent): Promise<boolean>
    - Dynamically imports { verifyEvent } from nostr-tools
    - Performs basic presence checks (kind, created_at, content, pubkey, sig) then verifyEvent

- Content provenance verification
  - Path: src/lib/content-provenance/verification.ts
  - verifyProvenance(content, ev)
    - Verifies event content hash via tag h match; then CEPS.verifyEvent(ev)

- Input schema validation (Zod)
  - Path: lib/security/input-validation.ts
  - NostrEventSchema: kind (number+positive), content (string), tags (string[][] optional), created_at (optional int)
  - InputValidator.validateNostrEvent(data) returns safeParse result

- Legacy/alternate managers
  - Path: lib/nostr/nostr-manager.ts
    - validateEventSignature(event): boolean — currently TODO (returns !!event.sig only); handleEvent() warns and drops when signature invalid
    - WebSocket-based publish/subscribe flow; older pattern (not via CEPS)
  - Path: lib/enhanced-nostr-manager.ts
    - subscribeToEvents(...) proxies to pool.subscribeMany; CEPS-like semantics; validation specifics not shown in snippet

- Group messaging dynamic loader
  - Path: lib/group-messaging.ts
  - loadNostrTools(): dynamic import('nostr-tools'); helper wrappers like getPool()

- Credential/signature verification (non-Nostr event-specific)
  - Path: src/lib/credentialization.ts
  - Uses @noble/curves/secp256k1.verify for custom signature verification of content credentials

- Citadel relay helper
  - Path: lib/citadel/relay.ts
  - Uses CEPS for signing (signEventWithActiveSession or server keys fallback) and CEPS.verifyEvent to confirm signatures

- Dual-mode events function (stub)
  - Path: api/nostr/dual-mode-events.js — processes event fields without cryptographic verification in shown snippet

---

## 3) Event handling infrastructure (where/how events are published/received)

- Central Event Publishing Service (CEPS)
  - Path: lib/central_event_publishing_service.ts
  - Responsibilities:
    - Relay pool management (SimplePool), publishEvent with sanitization and multi-relay strategy, list() with EOSE handling, subscribeMany()
    - Encode/decode helpers (npub<->hex), timing-safe comparisons, PoW relay handling, error-tolerant publish strategy
    - Signing and verification wrappers to avoid direct nostr-tools imports elsewhere

- Facades/wrappers around CEPS
  - Path: lib/nostr.ts
    - Pool abstraction proxies publish/list/subscribeMany to CEPS
    - verifyAuthEvent(event) uses CEPS.verifyEvent plus auth-specific checks (kind, domain/timestamps/challenge) — per snippet
    - publishEvent(), subscribeToEvents() convenience methods
  - Path: lib/unified-messaging-service.js
    - Re-exports CEPS and DEFAULT_UNIFIED_CONFIG under UnifiedMessagingService facade

- Managers (non-CEPS)
  - Path: lib/enhanced-nostr-manager.ts — higher-level manager around pool subscribe; likely legacy/alternate to CEPS
  - Path: lib/nostr/nostr-manager.ts — WebSocket-based Nostr manager with TODO signature validation

- Application features using CEPS
  - Path: src/lib/nostr-profile-service.ts — fetch kind:0 via CEPS.list and decode
  - Path: src/lib/content-provenance/verification.ts — verify event with CEPS.verifyEvent after content-hash checks
  - Path: lib/citadel/relay.ts — signs/publishes via CEPS and verifies via CEPS

- Netlify/API functions using validation
  - Path: api/auth/nip07-signin.js — complete NIP-07 event validation and signature verification with noble/secp256k1
  - Path: api/authenticated/process-signed-invitation.js — dynamic nostr-tools verifyEvent
  - Path: api/nostr/dual-mode-events.js — stub processing (no signature verification shown)

---

## 4) Dependencies and import patterns for Nostr libraries

- nostr-tools
  - Declared in package.json (dependencies: "nostr-tools": ^2.15.0); lockfile shows 2.16.1 installed
  - netlify.toml external_node_modules includes "nostr-tools" to keep functions bundles slimmer
  - vite.config.js optimizeDeps includes "nostr-tools"
  - Direct imports:
    - CEPS: static imports of finalizeEvent, getPublicKey, nip04, nip19, nip44, nip59, SimplePool, verifyEvent
    - api/authenticated/process-signed-invitation.js: dynamic import('nostr-tools') for verifyEvent
    - lib/group-messaging.ts: dynamic import('nostr-tools') loader (utility wrappers)
  - Project policy (per code and guidelines): CEPS should be the single import point for nostr-tools; some files still import dynamically outside CEPS (notably API function and group-messaging.ts)

- Noble libraries
  - @noble/curves used in api/auth/nip07-signin.js and src/lib/credentialization.ts for manual signature verification

---

## 5) Potential integration points (to unify/extend validation) — observational

- CEPS.verifyEvent should be the canonical signature verification entry point across app and functions. Consider routing API function verifications through CEPS or a shared verification utility that uses the same logic and sanitization.
- Replace TODO validation in lib/nostr/nostr-manager.ts with proper cryptographic verification (prefer CEPS.verifyEvent) to avoid non-verified event handling paths.
- Consolidate dynamic nostr-tools imports (api/authenticated/process-signed-invitation.js, lib/group-messaging.ts) behind CEPS or a thin wrapper that defers to CEPS to comply with the single-import policy.
- Align Zod NostrEventSchema (lib/security/input-validation.ts) with the exact minimal Nostr event shape used in CEPS and API functions (pubkey, id, sig, created_at, tags) and ensure consistent validation usage before signature verification, where applicable.
- Ensure NIP-42 helpers (src/lib/nip42/*) integrate with CEPS session-based auth flows where relay AUTH is needed.

---

## 6) Gaps / risks / areas for enhancement — based on current state

- Multiple verification implementations:
  - CEPS.verifyEvent (nostr-tools)
  - Custom noble-based verifyEvent in api/auth/nip07-signin.js
  - Dynamic nostr-tools verifyEvent in api/authenticated/process-signed-invitation.js
  - Non-functional placeholder in lib/nostr/nostr-manager.ts (returns !!sig)
  - Risk: divergence in accepted event forms, hashing rules, or edge-case handling

- Direct nostr-tools imports outside CEPS remain:
  - api/authenticated/process-signed-invitation.js, lib/group-messaging.ts — diverges from “centralize nostr-tools import in CEPS” guideline

- Incomplete validation coverage in some paths:
  - api/nostr/dual-mode-events.js stub lacks cryptographic verification
  - nostr-manager.ts validates only presence of sig, not signature correctness

- Schema alignment:
  - Zod schema allows optional created_at; several flows expect created_at to be present and time-checked; harmonize expectations

- Consistency of event sanitization:
  - CEPS includes sanitizeFixedTags and npub->hex normalization before publish/verify; external verifiers may miss such preprocessing

---

## 7) Summary table (high-level)

- Canonical verification and event ops: lib/central_event_publishing_service.ts (CEPS)
- Application uses of CEPS: src/lib/nostr-profile-service.ts, src/lib/content-provenance/verification.ts, lib/citadel/relay.ts, lib/nostr.ts (facade)
- Alternative/legacy managers: lib/enhanced-nostr-manager.ts, lib/nostr/nostr-manager.ts (needs real signature verification)
- API function verifiers: api/auth/nip07-signin.js (custom noble), api/authenticated/process-signed-invitation.js (nostr-tools dynamic)
- Schema-level validation: lib/security/input-validation.ts (NostrEventSchema)
- Communications UI (structure only): src/components/communications/*.tsx

---

## 8) Recommendations for next steps (not executed; for planning)

- Unify signature verification through CEPS (or a shared helper that defers to CEPS) across serverless functions and client modules
- Implement proper signature verification in lib/nostr/nostr-manager.ts (replace TODO)
- Remove remaining direct/dynamic nostr-tools imports outside CEPS to respect the single-import policy
- Standardize pre-verification schema checks (Zod) and consistent time/kind/challenge rules per flow (auth, invitations, content provenance)
- Add tests covering: valid/invalid signatures, malformed events, npub-to-hex normalization, tag sanitization, and relay list/subscribe behaviors

End of audit.

