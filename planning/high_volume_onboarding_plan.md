# High-Volume Physical Peer Onboarding Plan

**Version:** 0.9 (Draft)
**Classification:** Internal Technical Specification

## 1. Purpose and Scope

This document specifies a high-volume "Physical Peer Onboarding" system for Satnam. The goal is to enable coordinators (family federation organizers, community stewards, businesses) to onboard many new users in person through a single, streamlined flow that combines identity creation, NFC card programming, Lightning provisioning, and Nostr/Keet setup.

The design must:

- Reuse and extend existing Satnam infrastructure (SecurePeerInvitationModal, NFCPhysicalMFA, password auth, Identity Forge, referrals, family federations, Keet plans).
- Support bulk onboarding of 1–100+ users in a single session.
- Preserve zero-knowledge handling of secrets and strong privacy guarantees.
- Remain compatible with future PearPass-style password systems.

## 2. High-Level System Overview

At a high level, the system introduces a new top-level onboarding flow ("PhysicalPeerOnboardingModal") that runs on the coordinator's device and guides each participant through:

1. Gathering basic identity inputs (true name, language, optional existing Nostr/Lightning info).
2. Creating or migrating a Nostr identity and assigning a NIP-05 identifier.
3. Establishing a primary password (4–5 word phrase) and 6-digit PIN for NFC use.
4. Programming an NFC card (NTAG424/Boltcard or Tapsigner) as both authentication token and optional Lightning payment card.
5. Creating a Keet/Pear P2P identity with a 24-word seed, displayed once and then persisted only as a zero-knowledge–encrypted secret recoverable via the user's Satnam passphrase and, when enabled, NFC MFA + PIN (mirroring the nsec lifecycle).
6. Generating a paper/metal backup form that the user fills in by hand.
7. Publishing attestations and events (OTS/NIP-03) that tie this identity into the community trust fabric.

The modal adapts its steps depending on whether the participant already has a Nostr account, Lightning wallet, or partial Satnam identity, and integrates with existing Identity Forge UX when appropriate.

## 3. Component Architecture

### 3.1 Top-Level Components

- **PhysicalPeerOnboardingModal.tsx**

  - New orchestrator component, structurally similar to `SecurePeerInvitationModal.tsx` but optimized for high-volume, step-based onboarding.
  - Provides a session-level state machine (e.g., `OnboardingSessionContext`) shared across steps.
  - Supports "single participant" and "batch mode" (queue of participants) with progress indicators.

- **OnboardingWizardSteps** (subcomponents)
  - `ParticipantIntakeStep` – collects true name, preferred display name, language, existing npub/lightning info, and risk/technical comfort.
  - `PasswordAndPINStep` – handles primary password (phrase) selection and PIN setup/change, while remaining compatible with NIP-05/password auth and future PearPass/Keypear-based password storage.
  - `NostrIdentityStep` – creates or migrates Nostr identity and NIP-05.
  - `LightningSetupStep` – LNbits Boltcard provisioning, Lightning Address, and NWC.
  - `NFCProgrammingStep` – card detection, UID read, programming, verification, MFA binding.
  - `KeetIdentityStep` – Keet/Pear P2P identity creation and safe display, generating a 24-word Keet seed and peer ID according to the unified identity architecture in the Keet/Keypear plans and treating the **raw** seed as an ephemeral plaintext secret (displayed once only) that is then persisted **only** as a zero-knowledge–encrypted blob bound to the same credential and recovery stack used for the nsec (primary password, optional NFC MFA + PIN).
  - `OnboardingBackupStep` – shows human-readable backup template and instructs manual transcription.
  - `AttestationAndPublishStep` – OTS, NIP-03 events, and federation/referral wiring.

### 3.2 Integration Points

- **SecurePeerInvitationModal.tsx**

  - Reuse invitation issuance logic: new users onboarded physically should still appear as invited peers, with invitation records linked to the coordinator.
  - Provide a way to launch PhysicalPeerOnboardingModal from the existing invitation UI when "physical/bulk onboarding" is chosen.

- **NFCPhysicalMFA.tsx / NFCAuthService (Authentication)**

  - Continue to handle **authentication-only** NFC flows (tap-to-sign, tap-to-spend, FROST NFC MFA) using `NFCAuthService` and the NTAG424/Tapsigner adapters, as documented in `src/lib/nfc-auth.ts`, `src/lib/steward/frost-nfc-mfa.ts`, and `docs/NFC_MFA_CODE_EXAMPLES.md`.
  - PhysicalPeerOnboardingModal should reuse these auth flows only for **verification** of already-programmed cards (e.g., quick post-programming check that the card responds correctly), not for low-level programming.

- **NTAG424 provisioning stack (Programming)**

  - For NFC **provisioning/programming**, PhysicalPeerOnboardingModal must build on the existing card provisioning pipeline instead of reusing auth-only flows:
    - Client-side: `useProductionNTAG424` hook (`src/hooks/useProductionNTAG424.ts`) and `NTAG424AuthModal.tsx` provide `programTag`, `registerNewTag`, `initializeTag`, `verifyTag`, and `eraseTag` methods that already talk to the unified NFC API.
    - Server-side: `netlify/functions/utils/nfc-card-programmer.ts` encapsulates the low-level NTAG424/Boltcard write operations (payment/auth/signing files), and `netlify/functions/lnbits-proxy.ts` coordinates Boltcard creation, card metadata, and PIN hashing.
  - `NFCProgrammingStep` should call into this **existing provisioning stack** (via `programTag`, `registerNewTag`, and related helpers) so that new cards are programmed using the same codepaths as the current NTAG424 provisioning tools, while NFCPhysicalMFA continues to focus on runtime authentication.

- **Identity Forge workflow**

  - When a user prefers full manual onboarding, or when the coordinator is only initiating part of the process, the wizard can "handoff" into Identity Forge screens using existing navigation and state interfaces.

- **User referrals and family federations**

  - After successful onboarding, create or update referral entries (e.g., via `api/authenticated/user-referrals.js`) and optionally attach users to the coordinator's family federation.

- **Keet / Pear / Keypear integration**
  - KeetIdentityStep must follow the unified identity and P2P setup architecture defined in the Keet and Keypear plans:
    - For identity bootstrap and P2P setup, align with `bootstrapSovereignIdentity` and the zero-prerequisite identity model described in **KEET_P2P_MESSAGING_INTEGRATION.md, Section 11.2 (Zero-Prerequisite Identity Model & Identity Bootstrap Flow)** and the unified identity management notes in **Section 12**.
    - For dual Nostr+Keet secret handling and storage, follow the dual-identity patterns from **KEYPEAR_P2P_PASSWORD_INTEGRATION.md, Section 9 (Unified Identity Management with Keet)** and the NostrPass/Keypear P2P auth architecture in **NOSTRPASS_KEYPEAR_P2P_AUTHENTICATION_INTEGRATION.md, Sections 3–4**. These documents MUST explicitly specify that both the nsec and the Keet seed are persisted only as zero-knowledge–encrypted blobs (e.g., Supabase `encrypted_nsec` plus a corresponding encrypted Keet seed) recoverable via the user's Satnam passphrase and, when enabled, NFC MFA + PIN. If they do not yet do so, they MUST be updated to match this plan before implementation.
  - KeetIdentityStep should therefore generate the 24-word Keet seed and Keet peer ID according to those specs, treat the **raw** seed exactly like the nsec (displayed once, never stored in plaintext), and persist it only via the same zero-knowledge encryption and recovery path (password → Keypear/NostrPass → ClientSessionVault → Supabase encrypted blobs), optionally gated by NFC MFA + PIN. If Keypear/NostrPass or P2P credential storage is unavailable at deployment time, the existing Satnam zero-knowledge paths (ClientSessionVault → Supabase encrypted blobs) MUST be extended to store the encrypted Keet seed so that recovery remains possible without introducing a separate storage mechanism.

## 4. Password System Specification

### 4.1 Primary Password (Phrase) Rules

- The 4–5 word phrase is the **primary password**, not a recovery phrase.
- Minimum length: **26 characters** total. There is no maximum; longer phrases are encouraged.
- Users must write their password by hand onto the backup form; the app must **never print** the password, even as part of a backup template.
- The password validator must integrate with existing Satnam NIP-05/password auth flows such that:
  - A password is accepted if it either:
    1. Meets the phrase rule (≥26 characters, human-readable phrase), or
    2. Meets the existing complexity rules already defined for shorter passwords (e.g., minimum length plus at least one uppercase, one number, and one special character).
- The phrase-based flow must not break or constrain the existing manual Identity Forge workflow; both use the same underlying password APIs and reuse the same credential resolver described in the NostrPass/Keypear plans.
- When PearPass / Keypear-based password managers are enabled (per **KEYPEAR_P2P_PASSWORD_INTEGRATION.md** and **NOSTRPASS_KEYPEAR_P2P_AUTHENTICATION_INTEGRATION.md**):
  - The chosen primary password (phrase or complex) must be compatible with being used as the Satnam-side credential for NIP-05/password login while optionally serving as, or coexisting alongside, a distinct Keypear master password.
  - The onboarding flow may offer the user the option to reuse their Satnam primary password as the Keypear master password, but must not require it; the two can be independent credentials.
  - Any integration with PearPass/Keypear must respect the existing fallback chain (Keypear → ClientSessionVault → Supabase encrypted_nsec) and must not bypass or weaken the zero-knowledge guarantees described in those documents.
- The password subsystem must therefore treat the phrase-based password as one **input** into this broader authentication ecosystem, not a special case: it plugs into the same SignerAdapter and credential resolution architecture that NostrPass/Keypear will use, so future PearPass-style systems can be added without changing onboarding semantics.

### 4.2 PIN Management

- 6-digit PINs are **user-configurable by default for Boltcard/NTAG424-based flows**.
- The PIN step must offer both (where the card and protocol support user PINs):
  - Manual entry (with confirmation), and
  - "Generate random PIN" option (cryptographically secure RNG) when the user prefers.
- Users must be able to **change their PIN after onboarding** via existing or new account settings flows **for Boltcard-style PINs**.
- PINs must **never** be stored in plaintext; only salted, hashed representations and/or encrypted blobs are permitted.
- For **Tapsigner** cards:
  - The card uses a **factory-hardcoded, manufacturer-burned 6-digit PIN** that is **not user-configurable**.
  - During enrollment, the onboarding flow reads this PIN exactly once from the card (permitted by protocol) and immediately derives and stores only a salted, hashed (or equivalently encrypted) representation bound to the user identity.
  - The **user can read the PIN from the physical card or its packaging**; Satnam never re-displays the plaintext PIN after enrollment.
  - Later, when a user taps their Tapsigner and enters a PIN, Satnam verifies it by comparing the user-supplied PIN (after hashing) to the stored salted hash; if it matches, Satnam proceeds with the Tapsigner protocol using the card's own PIN checks and rate limits.
  - This design protects against offline brute-force as far as the card and protocol allow, while respecting the immutable nature of the Tapsigner PIN.

## 5. Lightning Integration

- During NFCProgrammingStep, the system must:
  - Extract card UID and call the **LNbits Boltcard extension API** to create a Boltcard entry for this card.
  - Automatically provision basic payment features (wallet association, spend limits, etc.) per deployment policy.
- Ask users whether they already have a **Lightning Address** and how they want it used:
  - Link existing Lightning Address to this identity (forwarding payments to their existing wallet through the Scrub service at whatever percentage they choose, 100% by default).
- Offer **Nostr Wallet Connect (NWC)** integration:
  - If the user has an external Lightning wallet that supports NWC, allow them (or the coordinator, with consent) to scan/provide an NWC URI.
  - Store any persistent NWC credentials in encrypted form, associated with the new identity.
- The coordinator's app must receive the connection keys/tokens needed from the LNbits Boltcard extension to complete card programming and attach the LNbits profile to the card's UID.

## 6. Nostr Account Migration Flow

- Early in ParticipantIntakeStep, ask if the user already has a Nostr account they want to migrate.
- If yes:
  - Collect the existing npub (or NIP-05 name that resolves to it).
  - Generate a one-time passcode (OTP) and deliver it via a **signed Nostr DM** from an **ephemeral, single-use Satnam service key** to that npub.
    - The ephemeral service keypair is generated by Satnam solely for this OTP transaction and discarded after use.
    - The DM is encrypted to the participant's existing npub using **NIP-59 Gift Wrap** with a **NIP-44–encrypted payload**; the coordinator device never sees or uses the participant's nsec.
  - Guide the user to open their existing preferred Nostr client, locate the DM from the Satnam OTP sender, and read the OTP value.
  - The user inputs the OTP into the Satnam onboarding flow; Satnam verifies it against the pending migration request.
  - On successful OTP verification, mark this new identity as a **migrated account** and import selected profile fields (name, picture, about, etc.) while preserving zero-knowledge handling of secrets.
- Migration flows must coexist cleanly with new-identity creation and not block users who cannot access their old account at the kiosk, not duplicating existing migration flows, merely integrating with them.

### 6.1 Implementation Notes: Nostr OTP Delivery

**DM Message Format**

- Satnam MUST send OTPs using a **NIP-59 Gift Wrap** event as the DM container, with the following structure:
  - `kind: 1059` (Gift Wrap).
  - `pubkey`: ephemeral Satnam OTP service pubkey (hex).
  - `tags` MUST include at minimum:
    - `["p", "<recipient_pubkey_hex>"]` – the participant's npub in hex.
    - `["t", "satnam-otp"]` – identifies the event as an OTP for Satnam onboarding.
    - `["expiration", "<otp_expiration_unix>"]` – OTP expiry timestamp as a string.
    - `["client", "satnam-onboarding"]` – client identifier for debugging/routing.
  - `content`: a NIP-44–encrypted JSON payload containing at least:
    - `code`: the 6–8 digit OTP code.
    - `expires_at`: UNIX timestamp when the OTP becomes invalid.
    - `context`: e.g. `"nostr-migration"` to distinguish OTP purposes.
    - `nonce`: a random value to prevent replay and duplicate processing.

**Relay Strategy**

- Default relay set for publishing OTP DMs:
  - Use Satnam's default DM relay list (for example, `wss://relay.satnam.app` and other configured private/partner relays).
  - When available, also include relays discovered from the recipient's metadata:
    - NIP-05 `relays` map for that pubkey.
    - Any relay-list metadata used for DM delivery in the deployment.
- Publishing rules:
  - Publish each OTP gift-wrap to at least a small set of relays (for example, 3) to maximize delivery.
  - Treat delivery as successful when at least one relay returns an `OK` for the event.
- Fallback behavior:
  - If all primary relays fail to accept the gift-wrapped OTP, attempt a second, small backup list of well-known DM-friendly relays (deployment-configurable).
  - If no relay accepts the event, abort the OTP flow with a clear error and prompt the coordinator to retry or choose a non-OTP migration path.

**Encryption Method**

- Satnam MUST **not** use **NIP-04 Encrypted Direct Messages** for OTP delivery.
- Primary mechanism:
  - Use **NIP-59 Gift Wrap (kind 1059)** as the outer DM container.
  - Encrypt the OTP payload inside the gift wrap using **NIP-44 Encrypted Payloads (versioned)**.
- Fallback:
  - If a recipient client or its relays cannot handle NIP-59 gift wraps, Satnam MAY fall back to sending an equivalent event whose `content` is encrypted with NIP-44, but MUST still avoid NIP-04 for OTPs.
- Rationale:
  - NIP-59 gift wrap plus NIP-44 payloads provide a modern, versioned encryption scheme and better alignment with Satnam's privacy-first messaging model.
  - For Satnam's threat model, NIP-04 is treated as a legacy pattern: notes may be stored or indexed in ways that leak metadata and do not provide the assurance Satnam requires that we are securely communicating with the actual owner of the target Nostr account.

**Error Handling**

- Delivery errors:
  - If no relay accepts the OTP gift-wrap, mark the pending migration request as "OTP delivery failed" and surface a clear error in the coordinator UI (for example, "Could not deliver OTP via Nostr; please try again or choose a different migration method.").
- User-side issues:
  - Provide inline instructions telling the participant:
    - Which sender identity / pubkey to look for in their Nostr client.
    - That the message may appear only on certain relays and may take a moment to sync.
  - Allow the coordinator to:
    - Resend a fresh OTP (new `code` and `nonce`) after a short cooldown.
    - Cancel the migration attempt and fall back to non-OTP onboarding paths when appropriate.
- Verification failures:
  - OTPs MUST be single-use and time-limited (for example, 5–10 minutes from issuance).
  - On expiry or too many failed attempts, invalidate the OTP and require a new OTP to be issued before accepting further codes.

**Security Considerations**

- Ephemeral key lifecycle:
  - Generate the ephemeral Satnam OTP service keypair in a secure server context.
  - Use it only to sign gift-wrapped OTP events (and, optionally, tightly-coupled resend events for the same pending migration).
  - Do not persist the private key beyond the OTP validity window; destroy it after successful verification, expiry, or explicit cancellation.
- OTP properties:
  - Generate OTP codes using a cryptographically secure RNG.
  - Use constant-time comparison when checking user-submitted OTPs against stored values.
  - Never log raw OTP codes or decrypted OTP payloads; logs may only contain high-level status (requested, delivered, verified, expired, failed).

## 7. Adaptive User Experience

- PhysicalPeerOnboardingModal must dynamically adapt its step sequence based on inputs:
  - Existing Nostr account vs new.
  - Existing Lightning wallet vs none.
  - Card type detected (NTAG424/Boltcard vs Tapsigner).
  - User technical comfort level.
- The wizard may:
  - Skip or collapse steps that are not relevant.
  - Offer simplified views for non-technical users (e.g., fewer cryptographic terms).
  - Hand off to full Identity Forge when a user wants more advanced control (e.g., custom key derivation).

## 8. Security and Data Handling

- Treat all critical user data (nsec, Keet seed, passwords, PINs, NWC URIs, LNbits keys) as **ephemeral security assets** at the plaintext level.
  - For the **nsec and Keet seed specifically**, enforce an identical lifecycle:
    - The raw secrets are only ever shown during the backup step (OnboardingBackupStep) and are never written to disk, logs, or long-lived browser storage in plaintext.
    - Long-term recoverability is provided exclusively via zero-knowledge–encrypted blobs whose decryption keys are derived from the user's Satnam passphrase and, when enabled, NFC MFA + PIN, using the same credential resolution and fallback chain already defined for the nsec.
    - There is **no** separate "Keet-only" storage path; Keet seed persistence must always ride on the same Keypear/NostrPass + ClientSessionVault + Supabase encrypted blob stack used for the nsec, so documentation and implementations stay aligned.
- OnboardingBackupStep:
  - Displays secrets only once, with clear instructions to **write by hand**.
  - Does not allow printing passwords; any printed backup form is a blank template.
  - After completion (user confirms they have copied data), the component must:
    - Clear secrets from React state and any in-memory caches.
    - Trigger best-effort memory wiping in helpers (e.g., overwrite arrays before GC).
- No sensitive onboarding data may be written to localStorage, IndexedDB, or persistent disk in plaintext.
- Any persistent storage must use hashing (for verification data like PINs/passwords) or strong encryption (for items that must be recoverable, following existing Satnam patterns).

## 9. NFC Card Programming Workflow

- Card detection and type identification (NTAG424/Boltcard vs Tapsigner) is handled via existing NFC adapters and hooks:
  - Authentication and runtime use are handled via `NFCAuthService` (tap-to-sign, tap-to-spend, FROST NFC MFA).
  - Provisioning and low-level writes are handled via the NTAG424 production stack (`useProductionNTAG424` on the client and `nfc-card-programmer.ts` / `/nfc-unified` functions on the server).
- Programming sequence:
  1. Read card UID and type using the provisioning stack.
  2. For NTAG424/Boltcard:
     - Use the existing LNbits proxy and card programmer (`lnbits-proxy.ts` + `nfc-card-programmer.ts`) to create or look up a Boltcard entry, derive per-card keys, and compute payment/auth/signing payloads.
     - Invoke `programTag` / `registerNewTag` / `initializeTag` via `useProductionNTAG424` to write the required Boltcard/NFC data (AIDs, payment/auth/signing files, URLs) to the card, letting the server-side programmer handle SDM keys and file layout.
  3. For Tapsigner:
     - Use the existing Tapsigner unified function (`netlify/functions_active/tapsigner-unified.ts`) to read the factory PIN and public key/metadata as allowed by protocol and to register the card in `tapsigner_registrations`.
     - Store only hashed/encrypted PIN representation, never plaintext, and bind the card to the user identity for MFA and signing use.
  4. Trigger MFA provisioning: register the card as a Physical MFA factor for the new identity using the same factor-registration APIs that NFCPhysicalMFA relies on.
  5. Immediately verify programming by performing a test tap via `NFCAuthService` (auth-only flow) to confirm that the card responds correctly without reprogramming it.
- In batch mode, the wizard loops through card programming for each participant, delegating all low-level writes to the existing provisioning stack, showing success/failure and allowing retry or skip.

## 10. Database and API Requirements

### 10.1 Schema Changes (Conceptual)

- New/extended tables (names illustrative):
  - `onboarding_sessions` – tracks coordinator, mode (single/batch), timestamps, and aggregate status.
  - `onboarded_identities` – per-participant records (npub, NIP-05, migration flag, federation linkage, referral id).
  - `nfc_cards` – card UID, type, owner identity, LNbits/Boltcard references, MFA status.
  - `lightning_links` – Lightning Address, NWC config, LNbits wallet/card IDs.
  - `nostr_migrations` – old npub, migration method (OTP), status, timestamps.
- Integrate with existing tables for:
  - Password hashes, PIN hashes, MFA factors.
  - Family federation membership and user referrals.

### 10.2 API Endpoints (Sketch)

- `POST /api/onboarding/sessions` – create/start a new physical onboarding session.
- `POST /api/onboarding/participants` – register or update a participant within a session.
- `POST /api/onboarding/nostr-migration/request-otp` / `verify-otp` – Nostr OTP migration.
- `POST /api/onboarding/cards/boltcard` – create LNbits Boltcard entry for a UID.
- `POST /api/onboarding/cards/register-mfa` – bind programmed card as MFA factor.
- `POST /api/onboarding/attestations` – create OTS/NIP-03 events and link them.

## 11. Attestation and Event Publication

- Integrate **OpenTimestamps (OTS)**:
  - Batch or per-user commitments for onboarding events, anchored in Bitcoin via OTS.
- Use **NIP-03** to publish timestamped Nostr events that:
  - Record that the coordinator facilitated onboarding for a given npub.
  - Optionally include tags for federation, kiosk, or campaign identifiers.
- These events help reconstruct the social fabric and give verifiable history without leaking unnecessary personal data.

## 12. Error Handling, Rollback, and Testing

- Error handling:
  - Each step must surface clear, human-readable errors with retry options.
  - In case of partial failure (e.g., Lightning provisioning failure after identity creation), mark participant as "incomplete" and allow resumption.
- Rollback:
  - Best-effort cleanup for external systems (revoke LNbits card, void incomplete attestation) when an onboarding is abandoned.
- Hardware testing:
  - Use test harnesses that simulate NFC readers and cards where possible.
  - Maintain a small hardware lab (NTAG424/Boltcards, Tapsigners) for regression testing key flows.

## 13. Implementation Phases (High-Level)

1. Core architecture and basic single-user wizard (no NFC/Lightning yet).
2. Password/PIN integration and Identity Forge compatibility.
3. NFC programming support and MFA binding for NTAG424/Boltcard and Tapsigner.
4. LNbits Boltcard + Lightning Address + NWC integration.
5. Nostr migration (OTP), OTS/NIP-03 publishing, and federation/referral wiring.
6. Batch mode optimization, UX polish, and hardware regression testing.
