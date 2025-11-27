# Satnam – NIP-PNS (Private Note Storage) Integration Planning

## 1. Executive Summary

NIP-PNS (Private Note Storage) is a draft Nostr standard that defines **kind `1080` events** for encrypted, self-addressed private notes. It derives a deterministic **PNS key** from the user/device `nsec` via HKDF, then:
- Derives a **pseudonymous PNS keypair** (secp256k1) from that key to sign PNS events.
- Derives a **symmetric key** from the same PNS key to encrypt the inner note using **NIP-44 v2** AEAD.
- Stores only ciphertext under the PNS pubkey on relays, with no public recipient tags.

Conceptually, PNS is “like NIP-59 giftwrap, but for yourself”:
- Only the holder of the `nsec` can create valid PNS events → resistant to spam/DoS.
- No separate sealed inner event is required; authenticity follows from the deterministic PNS key.
- Strong privacy: relays see only ciphertext under a pseudonymous pubkey and timestamps.

For Satnam, NIP-PNS fits well with the existing **privacy-first, zero-knowledge** architecture:
- `ClientSessionVault` and `secureNsecManager` already manage `nsec` purely client-side, with no plaintext persistence and Web Crypto–based hashing.
- The app already integrates NIP-04 / NIP-07 / NIP-44 / NIP-59 and privacy-first messaging, plus a planned Noise overlay.
- PNS would add a standardized, interoperable, relay-synced private storage layer for diaries, drafts, app settings, and other privacy-critical client data.

**High-level recommendation:** proceed with a **phased, feature-flagged integration** of NIP-PNS, starting with core crypto and event abstractions, then adding UX once the spec stabilizes and there is at least one external implementation to test interoperability.

---

## 2. Value Proposition Analysis

### 2.1 User Benefits for Satnam

**Sovereign private notebook across devices**
- Encrypted, relay-synced notes (diaries, reflections, drafts, checklists) that follow the user across devices.
- No centralized Satnam backend needed for note content; encryption is entirely in the browser.
- Aligns with the principle that data lives under the user’s keys, not Satnam’s database.

**Safer storage for sensitive client-side state**
- Private application settings that should not be visible in cleartext to relays or any backend (e.g., “stealth” preferences, advanced privacy toggles).
- Drafts and in-progress content (e.g., tentative family governance proposals, identity edits) that are not ready for public broadcast.
- Encrypted personal annotations on public or family events (e.g., notes about guardians or peers) that are never visible to others.

**Stronger privacy than NIP-59 for self-storage**
- PNS events do not require a `p` tag or explicit recipient; only the PNS pubkey is visible.
- Deterministic derivation lets the client recompute the PNS pubkey from the same `nsec` and subscribe only to the corresponding kind 1080 events.
- Public metadata is minimized: timestamps, ciphertext size, and a pseudonymous pubkey.

**Portability and interoperability**
- As a Nostr standard, PNS avoids lock-in: any other compliant client can read the same notes given the same `nsec`.
- Fits Satnam’s user-sovereignty requirement: private data is tied to the user’s Nostr identity, not a Satnam-proprietary store.

### 2.2 Alignment with Satnam’s Architecture

- **ClientSessionVault** (`src/lib/auth/client-session-vault.ts`): already wraps `nsec`/`npub` under a device-held key; plaintext nsec exists only transiently.
- **`secureNsecManager` and NIP-05/password adapter**: local signing flows that never persist plaintext secrets and avoid recursion with CEPS.
- **Gift-wrapped messaging & privacy services** (NIP-59 + NIP-44, `SatnamPrivacyFirstCommunications`): established patterns for browser-only E2EE and memory zeroization.
- **Privacy manager** (`lib/privacy/privacy-manager.ts`, `lib/privacy.ts`): global metadata-protection and anonymization patterns using Web Crypto.

PNS reuses these strengths: client-side only, zero-knowledge, no new backend trust assumptions, and compatible with the browser-only, no-Node-crypto constraint.

### 2.3 Competitive Advantages

- **Standard-based “personal cloud”** for Satnam users: private notes and settings stored in relays but readable only under the user’s keys.
- **Family context awareness** without compromising privacy: e.g., private guardian notes on federation events, fully separate from Supabase tables and RLS-protected schemas.
- **Ecosystem leverage:** as tools like GitCitadel, Alexandria, or other Nostr-native knowledge systems adopt PNS, Satnam users benefit seamlessly.

---

## 3. Technical Assessment

### 3.1 NIP-PNS Specification Summary

Key derivation (from `PNS.md`, draft spec):

- Start from `device_key` (32-byte secp256k1 secret decoded from user/device `nsec`).
- Derive PNS-specific key and keys:
  - `pns_key = HKDF-Extract(ikm = device_key, salt = "nip-pns")`
  - `pns_keypair = derive_secp256k1_keypair(pns_key)` – secp256k1 keypair for signing outer events.
  - `pns_nip44_key = HKDF-Extract(ikm = pns_key, salt = "nip44-v2")` – symmetric key for NIP-44 v2 AEAD.

Event structure:
- **Outer event:**
  - `kind: 1080`
  - `pubkey: pns_keypair.pubkey` (pseudonymous)
  - `tags: []` (no `p` tag required)
  - `content: <base64-encoded NIP-44 v2 ciphertext>`
- **Inner plaintext:** JSON-encoded Nostr event (any `kind`), either an **unsigned “rumor”** with `pubkey` matching the original `nsec`’s pubkey or a fully signed event. Rumors are recommended to reduce the risk of accidental broadcast.

Publishing:
1. Build inner event (kind flexible, rumor or signed).
2. JSON-encode, optionally drop `sig` if rumor & matching pubkey.
3. Derive `pns_key`, `pns_keypair`, `pns_nip44_key`.
4. Generate random 32-byte nonce.
5. Encrypt with NIP-44 v2 using `pns_nip44_key` and nonce.
6. Base64-encode ciphertext into `content` and sign the outer kind-1080 event with `pns_key`.

Reading:
1. From the same `device_key`, recompute `pns_key` and `pns_keypair`.
2. Subscribe to kind 1080 with `pubkey == pns_keypair.pubkey`.
3. For each event, derive `pns_nip44_key`, decrypt via NIP-44 v2, parse JSON into the inner event, and optionally verify `sig`.

Security notes:
- Compromise of the `nsec` compromises PNS data; PNS does not mitigate key compromise but avoids new attack surfaces.
- Spec recommends per-device keys and device key lists (still to be fully specified).

### 3.2 Signals from Related Projects

**GitCitadel & Alexandria (high-level)**
- Use Nostr for resilient content metadata and indexing (NIP-23, NIP-78, NIP-34/NIP-C0 patterns).
- Emphasize separation of public metadata from actual content storage (file servers, HTTP storage, etc.).
- Lesson for PNS: keep PNS focused purely on encrypted private data; let public indexing remain with existing NIPs.

**MedSchlr (Geyser project framing)**
- Likely involves zaps/Lightning + potentially sensitive academic/medical data.
- Lesson: scenarios with funding + private documents are natural fits for PNS: attach private notes locally using opaque references to public zap or project events, without exposing document content or linkage in relay metadata.

**Safebox (Nostr SafeBox)**
- Implements a Nostr-based “vault” for private data (e.g., Cashu tokens) using NIP-44-encrypted replaceable and parameterized events.
- Uses a separate safebox `nsec` (vault identity) and exposes that `nsec` to clients.
- Lessons for Satnam:
  - Consider similar **index vs item separation** if PNS is used heavily (lightweight indexing of inner note kinds/types).
  - Avoid the Safebox pattern of giving `nsec` to external services; keep all PNS key use inside Satnam’s trusted client code.
  - Recognize that Safebox shows the viability of a private-storage layer on Nostr using NIP-44; PNS standardizes this concept with better metadata hygiene.

### 3.3 Mapping PNS onto Satnam Components

**Key and secret management**
- For vault-backed users (NIP-05/password, etc.), `ClientSessionVault` + `secureNsecManager` are the natural source of a one-shot `device_key`.
- Use the existing pattern from privacy-first messaging: accept `ArrayBuffer` nsec or derived key, immediately derive needed keys, then zero the raw buffer.
- For NIP-07 users, pure PNS support may need to wait until extensions expose a PNS-capable API, since Satnam cannot read the `nsec` directly.

**Event flow and transport**
- Do not mix PNS with DM-specific abstractions (CEPS giftwrap). Instead, create a dedicated **PnsService** module that:
  - Derives `pns_key`, `pns_keypair`, and `pns_nip44_key` using internal crypto primitives.
  - Publishes kind-1080 events via existing Nostr transport.
  - Subscribes to kind-1080 events for the derived PNS pubkey and decrypts them.

**Privacy and metadata**
- Relay-visible data: kind 1080, PNS pubkey, timestamps, ciphertext size.
- Satnam should never persist a server-side mapping from PNS pubkey → DUID; the mapping stays on the client.
- PNS is complementary to the privacy-first Supabase schema (user_identities, family_federations, etc.), not a replacement.

### 3.4 Dependencies & Security Posture

- Use audited, browser-safe libraries in the **@noble/@scure ecosystem** for:
  - secp256k1 key operations (already implicitly used by nostr-tools).
  - HKDF (via Web Crypto or @scure HKDF).
  - NIP-44 v2 AEAD (either from nostr-tools or a @scure-based implementation), ensuring full browser compatibility.
- Keep PNS crypto in small, testable modules with no Node.js-specific imports; respect all existing constraints on env access and bundling.

---

## 4. Implementation Roadmap

### Phase 0 – Spec Tracking & Threat Modeling

Goals:
- Monitor NIP-PNS draft for changes in HKDF usage, salts, and per-device guidance.
- Produce a concise internal design note on:
  - Exact derivation functions (possibly shifting to Extract+Expand if the spec changes).
  - How PNS interacts with `ClientSessionVault`, `secureNsecManager`, and recovery flows.
  - Non-goals (e.g., not a seed-backup mechanism).

### Phase 1 – Core Crypto & Types (No UI)

Goals:
- Build minimal, isolated PNS crypto primitives and types under `src/lib/nostr/pns/`, behind a feature flag.

Example modules (names indicative):
- `pns-keys.ts` – derive `pns_key`, `pns_keypair`, `pns_nip44_key` from a one-shot `device_key`/`nsec`.
- `pns-events.ts` – define inner and outer event types and helpers to wrap/unwrap kind-1080 PNS events.

Integration:
- Wire these modules to `ClientSessionVault`/`secureNsecManager` via a single, well-reviewed interface that accepts a transient key buffer and guarantees zeroization.

### Phase 2 – PnsService & Relay Integration

Goals:
- Implement a **PnsService** responsible for publish/subscribe and decrypt operations, using existing Nostr connection infrastructure.

Responsibilities:
- Lazily derive and cache the PNS pubkey per authenticated session.
- Provide methods like:
  - `saveNote(payload: PnsInnerEventPayload): Promise<void>`
  - `listNotes(): Promise<PnsInnerEvent[]>`
- Handle session lifecycle (clear keys and caches on logout or vault reset).

### Phase 3 – User-Facing UX (Experimental)

Goals:
- Add an **experimental “Private Notes” UI** that leverages PnsService, without making PNS mandatory for any core flow.

Candidate UI elements:
- Simple notes list and composer for diaries/drafts/settings.
- Optional “Add private note” affordances attached to relevant flows (e.g., governance proposals) using opaque references.

Constraints:
- PNS remains optional and does not gate identity, messaging, or attestation workflows.

### Phase 4 – Federation & Identity Integration

Goals:
- Carefully integrate PNS into family federation and identity management in ways that honor privacy-first constraints.

Possible uses:
- Private guardian notes keyed to hashes of governance events or decisions.
- Non-secret but sensitive checklists or commentary that should not live in Supabase.

Non-goals:
- Storing actual nsec, master seeds, or primary recovery secrets in PNS.

### Phase 5 – Testing, Interop & Hardening

Goals:
- Thoroughly test PNS modules and flows, then validate interoperability once other clients support NIP-PNS.

Testing:
- Unit tests for key derivation and encryption/decryption.
- Integration tests for full flows (save → publish → reload → fetch → decrypt).
- Cross-client tests once another PNS implementation exists (shared test vectors and real relays).

---

## 5. Risks and Mitigation

### 5.1 Spec Volatility
- **Risk:** NIP-PNS is a draft; derivation details or semantics might change.
- **Mitigation:** gate PNS behind a feature flag; add a simple versioning convention for inner notes; avoid hard dependencies in critical flows until the spec stabilizes.

### 5.2 Cryptographic Implementation Bugs
- **Risk:** Incorrect HKDF usage, key reuse, or NIP-44 misuse could break confidentiality.
- **Mitigation:** use well-audited @noble/@scure primitives; keep crypto modules minimal; write extensive unit tests and property tests for derivation and encrypt/decrypt.

### 5.3 Key Compromise & Recovery Semantics
- **Risk:** If `nsec` is compromised, both identity and PNS data are lost; PNS does not change that.
- **Mitigation:** clearly communicate this in UX; encourage per-device patterns and key rotation; keep PNS out of the strongest-secret category (no seeds or irreversible recovery secrets).

### 5.4 Backwards Compatibility & Lock-in
- **Risk:** Users may accumulate PNS data under a draft that later evolves, risking stranded data.
- **Mitigation:** design from day one for export/migration; keep PNS optional; once stable, provide a migration tool from any pre-stable format to the final spec.

### 5.5 Performance and Resource Use
- **Risk:** Extra crypto and subscriptions may impact low-powered devices.
- **Mitigation:** lazy-load PNS UI and subscriptions; cache PNS keys per session; keep payloads small and structured; offload large blobs to existing file/storage mechanisms.

---

## 6. Recommendation

**Overall:** proceed with NIP-PNS integration as an optional, feature-flagged capability.

Justification:
- Strong alignment with Satnam’s privacy-first and zero-knowledge design; no new backend trust.
- Clear user value for diaries, drafts, private settings, and annotations.
- Reasonable incremental complexity given existing NIP-44/NIP-59 and vault infrastructure.

Priority:
- Short term: prioritize attestation, Noise overlay, OTP/TOTP, and core recovery work; start PNS at **Phase 0 + early Phase 1** in parallel.
- Medium term: once core security work stabilizes, complete PNS Phases 1–3 and release an experimental Private Notes feature.
- Long term: integrate PNS thoughtfully into family federation and identity UX where it adds clear value without creating new privacy footguns.

Next concrete steps:
- Finalize derivation and threat model for PNS (Phase 0).
- Define the TypeScript API for `PnsService` and key derivation helpers (Phase 1 design).
- Select and audit the exact @scure/@noble primitives to use for HKDF and NIP-44 v2, confirming browser-only compatibility.

