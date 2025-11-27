# Phase 3: Trust, Contacts, and Private Messaging Planning

## 1. Phase Overview

- **Objective:** Bridge public geo-rooms into Satnam's privacy-first contact system, trust scoring, and private messaging (NIP-59/NIP-17-style), while preserving zero-knowledge and RLS constraints.
- **Success Criteria:**
  - From a geo-room message, users can add the sender as a contact via CEPS and contact APIs.
  - Trust metrics update asynchronously based on new interactions.
  - Users can start a private chat from a geo-room, reusing unified messaging and giftwrapped DMs.
- **Estimated Complexity/Time:** Medium (5–7 developer-days including tests and UX refinements).
- **Dependencies:**
  - **Phase 0:** `NoiseSessionManager` for all private DMs (greenfield forward secrecy), `NoisePnsManager` for notes-to-self, verified LNbits primitives for payment context.
  - Phases 1–2 completed (Geo UI and deterministic relay messaging).
  - Trust modules in `src/lib/trust/*` and contact flows in `src/services/contactApiService.ts`, `api/communications/add-contact.js`.
  - Unified messaging in `src/hooks/usePrivacyFirstMessaging.ts` and CEPS contact APIs.

## 2. Technical Specifications

- **Data Models:**
  - `GeoContactContext` with `originGeohash: string`, `lastSeenAt: Date`, `messageId: string`.
  - `GeoRoomContactAction` for logging "contact_added_from_geo_room" events to reputation actions.
  - `PhysicalMFAAttestation` capturing mutual, face-to-face verification between two contacts, with fields like:
    - `attestationId: string` (local UUID and/or Nostr event ID if published).
    - `subjectNpub: string` and `counterpartyNpub: string` (or privacy-preserving hashed identifiers where required).
    - `createdAt: Date` and optional `originGeohash?: string` (truncated or hashed to preserve location privacy).
    - `subjectMfaSignature: string` and `counterpartyMfaSignature: string` (Web Crypto–verifiable signatures from each party's physical MFA device over a shared challenge that binds both npubs and optional geohash).
    - `scope: "local_only" | "shared_dm" | "nostr_attestation"` to describe whether the proof stays in the local encrypted vault, is shared privately via DM, or is published as a privacy-preserving attestation event.
- **API Contracts:**

  - `geo-room-service.ts`:

    - `verifyContactWithPhysicalMFA(params: VerifyContactWithPhysicalMFAParams): Promise<VerifyContactWithPhysicalMFAResult>` — validates cryptographic proofs produced by both parties' physical MFA devices during the Name Tag Reading Ritual, upgrades the contact's trust level to a "Verified" tier when valid, optionally emits a privacy-preserving attestation event (e.g., giftwrapped NIP-59 or local-only log), and triggers `/api/communications/recalculate-trust`. **See section 3.2.1 for the canonical TypeScript interface definitions.**

    - `addContactFromGeoMessage(params: AddContactFromGeoMessageParams): Promise<AddContactFromGeoMessageResult>` — calls `central_event_publishing_service.addContact` and then `/api/communications/recalculate-trust`. The `revealIdentity` flag controls whether the caller intends to share the user's persistent identity with this contact at creation time or keep the relationship pseudonymous. **See section 3.2.1 for the canonical TypeScript interface definitions.**
    - Uses the existing Phase 2 `publishGeoRoomMessage(params: { geohash: string; content: string; authorPubkey: string })` contract; in Phase 3, callers MUST:
      - pass an **ephemeral geo-room key** as `authorPubkey` for anonymous messages; and
      - only pass the user's persistent identity key as `authorPubkey` if the user has explicitly opted in to identity revelation for that contact/DM.

  - `usePrivacyFirstMessaging`:
    - add helper `startPrivateChat(params: StartPrivateChatParams): Promise<StartPrivateChatResult>` that uses unified messaging to create or select a DM session. When `revealIdentity` is `false` or omitted, the DM starts in a pseudonymous state and MAY later include an explicit "Share my identity" action; when `true`, the helper also sends an identity-sharing payload (see `IdentitySharingPayload` interface in section 3.2.1) as part of the initial DM setup. **See section 3.2.1 for the canonical TypeScript interface definitions.**

- **Database Schema Changes:**
  - **Geohash Privacy Strategy (MANDATORY):** Store `origin_geohash_truncated` (nullable text, max 4 characters) using **precision-4 truncation** (~20km resolution). This provides sufficient context for geo-trust weighting while preventing precise location tracking. Raw geohashes (precision 5+) MUST NOT be stored. Algorithm: `geohash.substring(0, 4)`. Any change must ensure RLS continues to scope by `auth.uid()` and hashed UUIDs.
  - All writes must go through existing Supabase client singleton and centralized DB manager.
- **Environment Variables / Flags:**
  - `VITE_GEOCHAT_CONTACTS_ENABLED` (controls whether "Add contact" appears in geo-room).
  - `VITE_GEOCHAT_TRUST_WEIGHT` (scales trust contribution of geo-based interactions).
  - `VITE_GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT` (scales the additional trust contribution granted when a contact has been verified via the physical MFA Name Tag Reading Ritual).
- **Integration Points:**
  - `GiftwrappedMessaging.tsx`: message context menu to surface "Add contact" and "Start private chat" actions.
  - `api/authenticated/group-messaging.js` for later group invitations that originate from geo-rooms.

## 3. Architecture & Design Decisions

- **Component/Service Architecture:**
  - Keep geo logic in `geo-room-service.ts`; delegate contact creation to CEPS and existing HTTP endpoints.
  - Avoid duplicating trust computation; rely on `enhancedTrustScoringService` and `trust-score` logic.
- **Data Flow (Add Contact):**
  - User selects "Add contact" from a geo-room message → `geo-room-service.addContactFromGeoMessage` is called with the remote `npub` (which may itself be an ephemeral geo-room key), `originGeohash`, and an optional `revealIdentity` flag → CEPS `addContact` and Netlify API → DB `encrypted_contacts` insert with `origin_geohash_truncated` (precision-4, ~20km resolution).
  - If `revealIdentity` is `true`, the flow also records that this contact has seen the user's persistent identity (npub/NIP-05/trust summary) and enqueues an **identity-sharing payload** (see `IdentitySharingPayload` interface in section 3.2.1) via unified messaging so the remote contact can verify it. This payload is delivered as a **NIP-59 giftwrapped Nostr event** within the existing DM channel (not as a separate message kind) and includes fields for npub, NIP-05 identifier, optional display name, and selective trust summaries. User consent is recorded in the local vault and the `revealIdentity` flag in the contact record. **Identity revelation is effectively irreversible** for that contact relationship (the counterparty retains any shared data), though users can block or remove contacts at any time.
  - Optionally trigger trust recomputation via `/api/communications/recalculate-trust`, giving slightly higher weight to contacts where identity has been mutually revealed.
- **Privacy & Anonymization in Geo-Room Conversations:**
- **Physical MFA Verification (Name Tag Reading Ritual):**

  - **Preconditions:** Physical MFA verification is an **opt-in, post-identity-revelation** flow. Both parties must already have a contact/DM relationship where persistent identity (npub/NIP-05) has been shared per-contact as described above; the ritual cannot be performed in fully anonymous-only relationships.
  - **Ritual overview:** Two users who originally met via a Bitchat geo-room arrange an in-person meeting. From the DM or contact detail view, each user selects "Verify with Physical MFA". The UI guides them to bring their devices and MFA "Name Keys" (QR/NFC tags) together and perform a mutual scan so that:
    - Each physical MFA device reads the other party's Name Key, which encodes their persistent npub and any required metadata.
    - Each device computes a Web Crypto–based signature over a shared challenge that binds: both npubs, a timestamp, an optional coarse `originGeohash`, and a random nonce.
    - The resulting dual signatures and challenge payload form a `PhysicalMFAAttestation` record.
  - **Proof exchange & verification:** Signatures and the challenge payload are exchanged either via local channels (Bluetooth/NFC) or via existing Nostr DMs. `geo-room-service.verifyContactWithPhysicalMFA` verifies that:
    - both signatures are valid for the claimed npubs and challenge;
    - the challenge is fresh (within an acceptable time window) and not reused;
    - the contact being verified matches the DM/contact context.
      On success, it stores or updates a `PhysicalMFAAttestation` record for that contact and upgrades the trust level to a "Verified" tier.
  - **Storage & scope:** Attestation storage follows a **dual-write strategy** with the `scope` field determining visibility:
    - **`local_only` (default, MANDATORY):** Attestation records are ALWAYS stored in the user's **local encrypted vault** as the primary source of truth. This is required and cannot be disabled.
    - **`shared_dm` (optional):** In addition to local storage, the attestation proof is sent as a NIP-59 giftwrapped event within the DM with the verified contact. This enables the counterparty to store and verify the proof independently.
    - **`nostr_attestation` (future, requires explicit dual consent):** In addition to local and DM storage, a redacted, privacy-preserving attestation event is published to Nostr with explicit consent from both parties.
    - **RLS-scoped Supabase table (optional sync):** For cross-device sync, attestations MAY be synced to a privacy-preserving Supabase table (`physical_mfa_attestations`) where RLS restricts access to `auth.uid()` and stores only hashed npubs and truncated geohash. Local vault is authoritative; server is a backup. Conflict resolution: latest `createdAt` wins, with local vault taking precedence on tie.
  - **Effect on trust:** A successful physical MFA verification raises the contact to a "Verified" tier that is strictly higher than geo-room-only or DM-only trust. The trust engine uses `VITE_GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT` to weight this signal when computing composite scores and may gate higher-risk actions (e.g., family federation invitations, high-value payments) behind the presence of at least one recent `PhysicalMFAAttestation`.

  - **Default anonymous messaging:** Bitchat geo-room conversations MUST be anonymous by default. Public geo-room events published via `publishGeoRoomMessage` MUST NOT include the user's NIP-05 identifier, profile metadata, or trust scores in the event content or tags. Minimal public metadata is limited to: an ephemeral geo-room pubkey (not the user's long-term identity key), timestamp, message content, coarse geohash tags, and relay metadata required for routing.
  - **Ephemeral key strategy:** Ephemeral keypairs for geo-room messaging are generated per geo-room session (per user × geohash prefix × browser session). **Rotation schedule:**
    - Keys are rotated **every 24 hours** OR when the user leaves/rejoins a geo-room, whichever comes first.
    - Keys remain **queryable for 7 days** after rotation to support reply threading and delayed "add contact" / "start private chat" actions.
    - In-flight messages/threads continue to work because ephemeral key → persistent identity mappings are stored in the local vault with a `rotatedAt` timestamp and a `validUntil` expiry (7 days post-rotation).
    - Messages include an ephemeral key version identifier (first 8 hex chars of the pubkey) so the vault can look up the correct decryption key for historical messages.
    - Mapping between ephemeral geo-room keys and the user's persistent identity lives only in the local privacy engine and/or encrypted vault, never in shared public state.
  - **Opt-in identity revelation (per-contact):** Identity revelation is not broadcast to the entire geo-room. When a user chooses "Add contact" or "Start private chat" from a geo-room message, the UI MUST present an explicit "Reveal my identity to this contact" step/toggle. If enabled, the system shares with that specific peer: the user's persistent npub, NIP-05 at `@my.satnam.pub`, selected profile metadata, and any applicable trust score summaries; if disabled, the relationship remains pseudonymous and continues to use the geo-room ephemeral persona until the user later opts in.
  - **Anonymity indicators & warnings:** The Bitchat UI MUST clearly indicate whether the user is currently anonymous in a room vs. has revealed identity to one or more contacts/DMs derived from that room (e.g., an "Anonymous" vs. "Identity shared with N contacts" badge). Whenever a user opts in to identity revelation from a public geo-room, show a high-friction privacy warning explaining that this links their identity to a coarse time/location context and may be correlated in trust graphs, and that the action is effectively irreversible for that contact.

- **Data Flow (Start Private Chat):**
  - User chooses "Start private chat" → hook `usePrivacyFirstMessaging.startPrivateChat` is invoked with `options.originGeohash` and `options.revealIdentity` → unified messaging service sets up DM channel (NIP-04 / planned NIP-17/NIP-59 giftwrap).
  - If `revealIdentity` is `false`, the DM begins in a pseudonymous state (remote only sees the geo-room persona / ephemeral key); the DM UI surfaces a separate, explicit "Share my identity" action that, when used, sends the user's identity card and updates trust/contacts metadata.
  - If `revealIdentity` is `true`, the DM is initialized along with an identity-sharing step so the remote party immediately sees NIP-05/profile information, with clear warnings in the UI that this links the user's identity to geo-room presence.
- **Security & Privacy:**
  - Do not store full geohash for contacts if unnecessary; consider truncating or hashing to avoid precise location linkage.
  - Respect Master Context roles when inviting geo contacts into family or guardian groups.
- **Browser/Serverless Constraints:**
  - All contact operations initiated from browser call Netlify Functions that use `process.env` and Supabase.
  - **Cryptographic API usage:** Client-side code MUST use **Web Crypto API** (`crypto.subtle`) or **@noble/curves** for all cryptographic operations (key generation, signing, verification, hashing). Node.js `crypto` module is NOT available in browser context and MUST NOT be used in client code. Netlify Functions may use either Web Crypto or Node.js `crypto` as needed.
- **Web Crypto Usage:**
  - If hashing `originGeohash` on client, use `crypto.subtle.digest` and convert to hex before sending to server.
- **MFA Device Key Management:**
  - **Storage location:** MFA public keys are stored in the user's **local encrypted vault** (primary, always available offline) and optionally synced to the user's **personal Nostr relays** via NIP-78 application-specific data events (kind 30078) for cross-device recovery. Keys are NOT stored on Satnam servers.
  - **Key binding:** MFA keys can be configured as **per-identity** (one key pair for all devices, stored in vault and synced) or **per-device** (unique key pair per NFC tag/hardware token). This is a user-configurable setting in the MFA management UI, defaulting to per-identity for simplicity.
  - **Key lookup during verification:** When `verifyContactWithPhysicalMFA` is called, MFA public keys are fetched from: (1) local vault first, (2) user's Nostr relays if not found locally, using the npub as the lookup key.
  - **Key rotation and recovery:** If an MFA device is lost or compromised:
    - User initiates "Revoke MFA Device" from Settings → Security → MFA Management.
    - The revoked key is marked as `revokedAt: Date` in the vault and Nostr relay storage.
    - `PhysicalMFAAttestation` records using the revoked key are NOT automatically invalidated but are flagged with a warning in the UI.
    - User can re-provision new NFC tags by generating a new MFA key pair and re-performing the Name Tag Reading Ritual with contacts to re-establish Verified trust.
    - For per-device mode: only the specific device key is revoked; other device keys remain valid.

### 3.2 Code Reference Examples (Physical MFA Verification)

> The following snippets are **reference-only TypeScript sketches** to clarify types and verification flow for the Name Tag Reading Ritual. They are **not** production-ready implementations. Final code should live in `src/lib/geochat/geo-room-service.ts` and related files, follow Satnam coding standards, and integrate with existing MFA infrastructure and RLS-scoped persistence.

#### 3.2.1 TypeScript Interfaces (geo-room-service.ts)

```ts
// Reference interfaces for Physical MFA verification
// File: src/lib/geochat/geo-room-service.ts

export type PhysicalMFAAttestationScope =
  | "local_only"
  | "shared_dm"
  | "nostr_attestation";

export interface PhysicalMFAAttestation {
  /** Local UUID or Nostr event ID that uniquely identifies this attestation. */
  attestationId: string;
  /** Persistent npub of the user performing verification. */
  subjectNpub: string;
  /** Persistent npub of the contact being verified. */
  counterpartyNpub: string;
  /** When the Name Tag Reading Ritual was completed. */
  createdAt: Date;
  /** Optional, truncated or hashed coarse geohash for context; may be omitted for privacy. */
  originGeohash?: string;
  /** Web Crypto–verifiable signature from subject's physical MFA device. */
  subjectMfaSignature: string;
  /** Web Crypto–verifiable signature from counterparty's physical MFA device. */
  counterpartyMfaSignature: string;
  /** Where this proof is stored or shared (local vault, DM, or Nostr). */
  scope: PhysicalMFAAttestationScope;
}

/**
 * Shared challenge signed by both parties' MFA devices during the ritual.
 * Binds identities, time, optional coarse geohash, and a random nonce
 * to prevent replay and tie the proof to a specific meeting.
 */
export interface MFAChallenge {
  subjectNpub: string;
  counterpartyNpub: string;
  issuedAt: Date;
  originGeohash?: string;
  nonce: string;
}

export interface VerifyContactWithPhysicalMFAParams {
  /** The contact npub to verify (from the DM/contact context). */
  contactNpub: string;
  /** Serialized challenge payload produced during the ritual (e.g., JSON string). */
  challenge: MFAChallenge;
  /** Signature from the local user's physical MFA device over the challenge. */
  subjectMfaSignature: string;
  /** Signature from the contact's physical MFA device over the same challenge. */
  counterpartyMfaSignature: string;
  /** Optional, privacy-scoped storage preference for this attestation. */
  scope?: PhysicalMFAAttestationScope;
}

export interface VerifyContactWithPhysicalMFAResult {
  verified: boolean;
  /** Final trust level label after applying this signal (e.g., "Verified"). */
  trustLevel: string;
}

// ============================================================================
// Add Contact from Geo Message Interfaces
// ============================================================================

export interface AddContactFromGeoMessageParams {
  /** Nostr npub of the contact (may be ephemeral geo-room key or persistent identity). */
  npub: string;
  /** Origin geohash where the contact was encountered (will be truncated to 4 chars for storage). */
  originGeohash: string;
  /** Optional display name for the contact. */
  displayName?: string;
  /** If true, share the user's persistent identity with this contact at creation time. */
  revealIdentity?: boolean;
}

export interface AddContactFromGeoMessageResult {
  /** Unique identifier for the created contact record. */
  contactId: string;
  /** Initial trust level assigned to this contact (e.g., "geo_room_contact"). */
  trustLevel: string;
  /** Whether identity was revealed to the contact. */
  identityRevealed: boolean;
}

// ============================================================================
// Start Private Chat Interfaces
// ============================================================================

export interface StartPrivateChatParams {
  /** Nostr npub of the contact to start a DM with. */
  npub: string;
  /** Optional origin geohash for context (used for trust weighting). */
  originGeohash?: string;
  /** If true, share identity immediately; if false/omitted, start in pseudonymous mode. */
  revealIdentity?: boolean;
}

export interface StartPrivateChatResult {
  /** Whether the DM session was successfully created or selected. */
  success: boolean;
  /** DM session/conversation identifier. */
  sessionId?: string;
  /** Whether identity was revealed in this DM. */
  identityRevealed: boolean;
}

// ============================================================================
// Identity Sharing Payload (NIP-59 giftwrapped in DM)
// ============================================================================

/**
 * Payload sent when a user reveals their identity to a contact.
 * Delivered as a NIP-59 giftwrapped Nostr event within the DM channel.
 * Fields are selectively included based on user preferences.
 */
export interface IdentitySharingPayload {
  /** User's persistent Nostr npub. */
  npub: string;
  /** User's NIP-05 identifier (e.g., "alice@my.satnam.pub"). */
  nip05?: string;
  /** Optional display name. */
  displayName?: string;
  /** Optional profile picture URL. */
  pictureUrl?: string;
  /** Selective trust summary (e.g., "Verified by 3 contacts", "Member since 2024"). */
  trustSummary?: string;
  /** Timestamp when this payload was created. */
  sharedAt: Date;
  /** Version identifier for forward compatibility. */
  version: "1.0";
}
```

#### 3.2.2 Canonical MFA Challenge Serialization Format

The MFA challenge MUST be serialized using **JSON Canonicalization Scheme (JCS, RFC 8785)** to ensure deterministic byte representation for signature verification across different platforms. The normative format is:

```json
{
  "counterpartyNpub": "<npub string>",
  "issuedAt": "<ISO 8601 timestamp, e.g., 2025-01-15T14:30:00.000Z>",
  "nonce": "<32 hex characters>",
  "originGeohash": "<4 char truncated geohash or null if omitted>",
  "subjectNpub": "<npub string>"
}
```

**Serialization rules:**

- Keys are sorted lexicographically (per JCS).
- Timestamps are serialized as ISO 8601 strings with milliseconds and UTC timezone (`Z` suffix).
- Optional fields (`originGeohash`) are included with value `null` if absent (not omitted entirely) to ensure consistent byte length.
- The `nonce` is a 32-character lowercase hex string (128 bits of randomness).
- The serialized JSON is UTF-8 encoded before signing.

**Reference implementation:**

```ts
function serializeChallengeForSigning(challenge: MFAChallenge): Uint8Array {
  const canonicalObj = {
    counterpartyNpub: challenge.counterpartyNpub,
    issuedAt: challenge.issuedAt.toISOString(),
    nonce: challenge.nonce,
    originGeohash: challenge.originGeohash ?? null,
    subjectNpub: challenge.subjectNpub,
  };
  const jsonString = JSON.stringify(canonicalObj); // Keys already sorted
  return new TextEncoder().encode(jsonString);
}
```

#### 3.2.3 Verification Function Signature & Pseudocode (geo-room-service.ts)

```ts
// Contract only; implementation uses Web Crypto, local vault, and RLS-scoped APIs.
export async function verifyContactWithPhysicalMFA(
  params: VerifyContactWithPhysicalMFAParams
): Promise<VerifyContactWithPhysicalMFAResult> {
  // 1. Parse and validate the MFA challenge.
  //    - Ensure subjectNpub matches the current user.
  //    - Ensure contactNpub matches the DM/contact being verified.
  //    - Enforce freshness window on issuedAt (within 5 minutes) and unique nonce for anti-replay.

  // 2. Serialize challenge using JCS (see section 3.2.2) and verify both MFA
  //    signatures using Web Crypto's crypto.subtle.verify() with ECDSA P-256.

  // 3. If either signature fails or challenge is stale, return { verified: false }.

  // 4. On success, construct a PhysicalMFAAttestation record and persist it to
  //    a privacy-scoped store (local encrypted vault and/or RLS-protected DB).

  // 5. Upgrade the contact's trust level to "Verified" within the trust engine
  //    and trigger `/api/communications/recalculate-trust`.

  // 6. Optionally emit a privacy-preserving proof (e.g., giftwrapped event in DM)
  //    according to the chosen scope.

  throw new Error("Not implemented - reference only");
}
```

```ts
// Reference-only sketch of the core verification flow.
// Implementation details (key lookup, DB manager, vault access) are omitted.

async function performMfaVerificationFlow(
  params: VerifyContactWithPhysicalMFAParams
): Promise<VerifyContactWithPhysicalMFAResult> {
  const { challenge, subjectMfaSignature, counterpartyMfaSignature } = params;

  // Name Tag Reading Ritual lifecycle:
  // - Both parties scan each other's Name Keys, producing a shared challenge.
  // - Each MFA device signs the challenge; signatures are exchanged via
  //   Bluetooth/NFC or Nostr DM before this function is invoked.

  // 1. Enforce freshness and anti-replay.
  //    (e.g., issuedAt within N minutes and nonce not seen before for this pair.)

  // 2. Verify both signatures using Web Crypto's subtle.verify() with the
  //    stored MFA public keys bound to each npub.

  // 3. If verification fails, short-circuit with { verified: false, trustLevel: "Unchanged" }.

  // 4. Persist a PhysicalMFAAttestation in a privacy-preserving store (local
  //    vault and/or RLS-scoped Supabase table) and update the contact's trust
  //    state to "Verified".

  // 5. Trigger trust recalculation so downstream UIs and policies can react.

  return { verified: true, trustLevel: "Verified" };
}
```

## 4. Implementation Checklist

1. **Extend Geo Room Service**
   - File: `src/lib/geochat/geo-room-service.ts`.
   - Implement `addContactFromGeoMessage` calling CEPS and contact API.
   - Implement `verifyContactWithPhysicalMFA`, including Web Crypto signature verification for the Name Tag Reading Ritual, attestation record creation/upsert, and trust recalculation triggers.
2. **Augment `usePrivacyFirstMessaging`**
   - File: `src/hooks/usePrivacyFirstMessaging.ts`.
   - Add `startPrivateChat` helper that uses existing `UnifiedMessagingService` to initialize a DM and optionally kick off identity-sharing or physical MFA verification flows from the DM context.
3. **Integrate with GiftwrappedMessaging UI**
   - File: `src/components/communications/GiftwrappedMessaging.tsx`.
   - Add context-menu actions on geo-room messages for "Add contact" and "Start private chat".
   - Add "Verify with Physical MFA" action in the DM header or contact detail pane, wired to the Name Tag Reading Ritual flow.
4. **Physical MFA Attestation Storage**
   - Files: local encrypted vault logic, and (optional) Supabase table + Netlify function for `PhysicalMFAAttestation` records.
   - Ensure RLS restricts any server-side storage to `auth.uid()`; use hashed npubs and truncated/hashed geohash where stored.
5. **Trust and Reputation Logging**
   - Files: `src/lib/trust/action-reputation.ts`, `api/communications/recalculate-trust.js`.
   - Introduce action types like `geo_contact_added` and `contact_verified_via_physical_mfa` with appropriate weights, using `VITE_GEOCHAT_TRUST_WEIGHT` and `VITE_GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT`.
6. **Tests**
   - Unit tests for `addContactFromGeoMessage`, `startPrivateChat`, and `verifyContactWithPhysicalMFA` wiring.
   - Integration tests for contact addition, physical MFA verification, and trust recalculation pipeline.

## 5. Testing Strategy

- **Unit Tests:**
  - Verify `addContactFromGeoMessage` passes expected parameters to CEPS and handles errors.
  - Verify `startPrivateChat` refuses to run if unified messaging session is not initialized.
  - Verify `verifyContactWithPhysicalMFA` correctly validates Web Crypto signatures, rejects malformed or replayed challenges, and returns `{ verified: true, trustLevel: "Verified" }` only on success.
- **Integration Tests:**
  - Simulate a geo-room message and assert that clicking "Add contact" results in `encrypted_contacts` insert (using mocks) and trust score recomputation.
  - Simulate the Name Tag Reading Ritual between two test users, including:
    - generation of MFA signatures on both sides;
    - exchange of proofs via a mocked local channel or Nostr DM; and
    - upgrade of both contacts to "Verified" trust level with appropriate trust score changes using `VITE_GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT`.
  - Exercise failure paths (invalid signature, mismatched npubs, stale challenge) and confirm that verification fails without leaking sensitive attestation material to third parties.
- **Manual Testing:**
  - In dev, add a contact from a geo-room and confirm they appear in contacts UI with correct trust indicators.
  - Walk through the Name Tag Reading Ritual with two test accounts/devices using QR or NFC mocks and confirm that both contact records show a "Verified via Physical MFA" badge.
- **Privacy/Security Validation:**
  - Confirm that `origin_geohash_truncated` is stored at precision-4 (max 4 characters, ~20km resolution) and that raw geohashes are never persisted.
  - Confirm that `PhysicalMFAAttestation` storage (local vault and/or Supabase) does not expose raw npubs/geohash beyond what RLS allows, and that any optional Nostr attestation events are only published when both parties have explicitly consented.

## 6. User Experience Flow

- From a geo-room message, the user opens a context menu and selects "Add contact".
- A confirmation modal explains that this moves the relationship into Satnam's private contact system and may update trust metrics.
- For "Start private chat", a similar modal clarifies that conversation will move into giftwrapped DMs.
- Errors (e.g., failed contact addition, disabled feature flag) are surfaced with clear guidance.

## 7. Migration & Rollout Plan

- Introduce `VITE_GEOCHAT_CONTACTS_ENABLED` gated flows; default off.
- Deploy `origin_geohash_truncated` column migration in a single idempotent SQL file with RLS enforcing `auth.uid()`. Column constraint: `CHECK (length(origin_geohash_truncated) <= 4)`.
- Rollback: disable the flag and stop surfacing geo-based contact and DM actions; existing contacts remain valid.

### 7.1 RLS Policy Requirements

**Table: `encrypted_contacts`** (existing table, adding column)

```sql
-- Add column with privacy constraint
ALTER TABLE encrypted_contacts
ADD COLUMN IF NOT EXISTS origin_geohash_truncated TEXT
  CHECK (origin_geohash_truncated IS NULL OR length(origin_geohash_truncated) <= 4);

-- RLS: Users can only read/write their own contacts
-- (Assumes existing RLS is already scoped by auth.uid() via user_id column)
-- No additional policy needed if user_id already enforces ownership.
```

**Table: `physical_mfa_attestations`** (new table for optional server sync)

```sql
CREATE TABLE IF NOT EXISTS physical_mfa_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attestation_id TEXT NOT NULL,
  -- Store hashed npubs, not raw values
  subject_npub_hash TEXT NOT NULL,
  counterparty_npub_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  origin_geohash_truncated TEXT CHECK (origin_geohash_truncated IS NULL OR length(origin_geohash_truncated) <= 4),
  scope TEXT NOT NULL CHECK (scope IN ('local_only', 'shared_dm', 'nostr_attestation')),
  -- Signatures stored encrypted, not raw
  encrypted_signatures BYTEA,
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, attestation_id)
);

-- Enable RLS
ALTER TABLE physical_mfa_attestations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own attestations
CREATE POLICY "Users can view own attestations"
  ON physical_mfa_attestations FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only INSERT their own attestations
CREATE POLICY "Users can insert own attestations"
  ON physical_mfa_attestations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only UPDATE their own attestations (e.g., to revoke)
CREATE POLICY "Users can update own attestations"
  ON physical_mfa_attestations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can DELETE their own attestations
CREATE POLICY "Users can delete own attestations"
  ON physical_mfa_attestations FOR DELETE
  USING (auth.uid() = user_id);

-- No cross-tenant visibility: contacts cannot see each other's attestation records.
-- Mutual verification is confirmed via DM exchange, not database queries.
```

**Column-level protection:**

- `origin_geohash_truncated`: Read-restricted to owning user via table-level RLS. No additional column-level policy needed.
- `subject_npub_hash` and `counterparty_npub_hash`: Stored as SHA-256 hashes (hex) to prevent reverse lookup from database dumps. Hashing uses a per-user salt stored in the vault.

## 8. Open Questions & Risks

### Resolved in This Document

- ~~Which cryptographic scheme and challenge format to standardize for mutual attestation~~ → **Resolved:** ECDSA P-256 with JCS-serialized challenge (see section 3.2.2).
- ~~How to handle device loss or compromise~~ → **Resolved:** Revocation via Settings, re-attestation with new keys (see section 3.1 MFA Device Key Management).
- ~~Where attestations are stored~~ → **Resolved:** Dual-write strategy with local vault (mandatory) + optional Supabase sync (see section 3.1 Storage & scope).
- ~~Ephemeral key lifecycle~~ → **Resolved:** 24-hour rotation, 7-day queryability window (see section 3.1 Ephemeral key strategy).

### Remaining Open Questions

- How much weight to give geo-originated interactions in composite trust scores and how aggressively to weight physical MFA "Verified" trust relative to other signals. _(Recommend: start with 1.5x weight for geo contacts, 3x weight for physical MFA verified, tune based on user feedback.)_
- Whether storing any geohash-derived metadata in DB could be abused for movement profiling. _(Mitigated by precision-4 truncation, but long-term patterns may still be correlatable. Consider time-based expiry of `origin_geohash_truncated` after 90 days.)_
- UX risk of overwhelming users with contact and DM options from noisy public rooms. _(Recommend: rate-limit "Add contact" suggestions, require minimum message count before showing action.)_
- How MFA Name Keys are generated, distributed, and rotated in practice (e.g., on-device QR, NFC tags, printed cards), and how to ensure they remain usable without introducing new tracking vectors. _(Partially addressed in section 3.1; full UX flow TBD.)_
- Whether certain high-trust actions (family federation invitations, high-value payments, recovery approvals) should be optionally gated behind recent physical MFA verification, with user-configurable policies. _(Recommend: yes, with "Verified within last 30 days" as default threshold, user-adjustable.)_

---

## 9. Implementation Notes (Completed: 2025-11-26)

### 9.1 Implementation Status

| Priority | Description                                            | Status      | Completion Date |
| -------- | ------------------------------------------------------ | ----------- | --------------- |
| 1        | Phase 3 Types in `types.ts`                            | ✅ Complete | 2025-11-26      |
| 2        | Feature Flags in `env.client.ts`                       | ✅ Complete | 2025-11-26      |
| 3        | Service Layer Functions in `geo-room-service.ts`       | ✅ Complete | 2025-11-26      |
| 4        | React Hook Extensions in `usePrivacyFirstMessaging.ts` | ✅ Complete | 2025-11-26      |
| 5        | UI Integration in `GeoRoomTab.tsx`                     | ✅ Complete | 2025-11-26      |
| 6        | Database Migration                                     | ✅ Complete | 2025-11-26      |
| 7        | Trust Integration in `recalculate-trust.js`            | ✅ Complete | 2025-11-26      |
| 8        | Unit Tests & Documentation                             | ✅ Complete | 2025-11-26      |

### 9.2 Code Artifacts

| File                                                        | Description                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/geochat/types.ts`                                  | Added Phase 3 type definitions: `AddContactFromGeoMessageParams`, `AddContactFromGeoMessageResult`, `VerifyContactWithPhysicalMFAParams`, `VerifyContactWithPhysicalMFAResult`, `MFAChallenge`, `PhysicalMFAAttestation`, `Phase3Error` class |
| `src/config/env.client.ts`                                  | Added feature flags: `GEOCHAT_CONTACTS_ENABLED`, `GEOCHAT_TRUST_WEIGHT` (default 1.5), `GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT` (default 3.0)                                                                                                      |
| `src/lib/geochat/geo-room-service.ts`                       | Implemented `addContactFromGeoMessage()`, `verifyContactWithPhysicalMFA()`, `truncateGeohashForPrivacy()`, `serializeMFAChallengeJCS()`, `verifyMFASignature()`, `storeAttestationInVault()`, `shareAttestationViaDM()`                       |
| `src/hooks/usePrivacyFirstMessaging.ts`                     | Extended hook with Phase 3 contact and private chat capabilities, added `addContactFromGeoMessage` and `startPrivateChatFromGeoRoom` handlers                                                                                                 |
| `src/components/communications/GeoRoomTab.tsx`              | Added "Add Contact" and "Start Private Chat" action buttons to geo-room message items, with hover-based UI and action feedback states                                                                                                         |
| `database/migrations/048_geochat_phase3_contacts_mfa.sql`   | Created migration adding `origin_geohash_truncated` column to `encrypted_contacts` and `physical_mfa_attestations` table with RLS policies                                                                                                    |
| `api/communications/recalculate-trust.js`                   | Updated to handle `geo_contact_added` and `contact_verified_via_physical_mfa` action types with trust weight multipliers                                                                                                                      |
| `src/lib/geochat/__tests__/geo-room-service-phase3.test.ts` | 14 new unit tests covering Phase 3 functionality                                                                                                                                                                                              |

### 9.3 Test Coverage

- **14 new Phase 3 tests** added in `geo-room-service-phase3.test.ts`
- **Total geochat/noise tests:** 124 (all passing)

**Phase 3 Test Breakdown:**

- `truncateGeohashForPrivacy()`: 4 tests
- `addContactFromGeoMessage()`: 7 tests
- `verifyContactWithPhysicalMFA()`: 2 tests
- Trust Weight Integration: 1 test

### 9.4 Key Implementation Decisions

1. **Trust Weight Defaults:** Implemented `GEOCHAT_TRUST_WEIGHT=1.5` and `GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT=3.0` as recommended defaults, configurable via environment variables.

2. **Geohash Truncation:** `truncateGeohashForPrivacy()` always truncates to 4 characters (precision-4, ~20km resolution) as specified. Returns empty string for falsy input.

3. **MFA Challenge Freshness:** 120-second (2-minute) window for challenge validity, with nonce-based replay protection via in-memory `Set`.

4. **Feature Flag Gating:** All Phase 3 UI actions gated by `GEOCHAT_CONTACTS_ENABLED` flag to allow phased rollout.

5. **Non-blocking Trust Recalculation:** Trust API calls are async and non-blocking - contact creation succeeds even if trust recalculation fails.

6. **Identity Revelation Default:** `revealIdentity` defaults to `false` (pseudonymous mode) - explicit opt-in required.

### 9.5 Database Schema Confirmation

Migration `048_geochat_phase3_contacts_mfa.sql` was successfully executed in Supabase SQL Editor without errors:

- ✅ `origin_geohash_truncated` column added to `encrypted_contacts` with CHECK constraint
- ✅ `physical_mfa_attestations` table created with RLS enabled
- ✅ Four RLS policies (SELECT, INSERT, UPDATE, DELETE) applied for user-owned attestations
- ✅ Unique constraint on `(user_id, attestation_id)`

### 9.6 Dependencies Used

Phase 3 builds on:

- **Phase 0:** Noise primitives, hardware MFA service skeleton
- **Phase 1:** Geo-utils, relay discovery
- **Phase 2:** CEPS integration, geo-room publishing/subscribing, `GeoRelaySelector`
- **Existing:** Trust modules (`action-reputation.ts`), CEPS contact APIs, unified messaging hooks
