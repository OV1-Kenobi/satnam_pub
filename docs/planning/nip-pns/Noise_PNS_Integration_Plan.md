# Noise Protocol Overlay + NIP-PNS Integration Plan

## 1. Executive Summary

This plan extends Satnam’s NIP-PNS (kind 1080 private notes) with a **Noise-based forward secrecy (FS) overlay**. Standard NIP-PNS encrypts notes using a single deterministic key derived from the user’s `nsec`, so anyone who later steals the `nsec` can retroactively decrypt the entire note history. We address this by introducing a **second, Noise-style key layer** that is **not derivable from `nsec`**.

In the proposed design:

- NIP-PNS remains the **outer, standards-compliant envelope** (kind 1080, NIP-44 v2, deterministic PNS keypair from `nsec`).
- A **Noise-inspired symmetric key schedule** provides **per-note ephemeral keys** for an **inner ciphertext**, so that `nsec + relay logs ≠ cleartext notes`.
- The additional forward-secure state is kept **only in the browser**, encrypted in `ClientSessionVault`; it is never derivable from `nsec` alone.

This yields **forward secrecy with respect to `nsec` compromise**, preserves NIP-PNS compatibility at the event level, and reuses the planned Noise overlay primitives and patterns from `PHASE_5_NOISE_PROTOCOL_OVERLAY.md`.

Practically, this creates two user-visible security tiers for Noise-FS notes. The **“Standard FS”** tier uses only `pns_fs_root` in ClientSessionVault to give strong protection against `nsec` compromise but can still be broken by a full device + vault + password compromise. The optional **“Hardened FS”** tier adds NFC hardware token MFA (Boltcard/Satscard) so that decrypting notes requires all five factors (device, `nsec`, password, physical token, and PIN), raising the bar even against combined digital credential theft and device loss. Users can start on Standard FS and later opt into Hardened FS as a deliberate, user-controlled security upgrade.

---

## 2. Security Architecture

### 2.1 Threat Model and Goal

- Attacker obtains the user’s **primary Nostr `nsec`** and a complete relay history of kind 1080 events.
- Attacker **does not** have the user’s local Satnam vault or device state (no access to Noise/PNS secrets stored in `ClientSessionVault`).
- Goal: under this threat, attacker **cannot decrypt historic private notes**, even though NIP-PNS outer encryption keys are reconstructible from `nsec`.

### 2.2 Layered Encryption Model

1. **Outer Layer – NIP-PNS (unchanged):**
   - `nsec → device_key → pns_key → pns_keypair` and `pns_nip44_key` as in current PNS plan.
   - Outer kind 1080 event `content` is NIP-44 v2 ciphertext of an inner Nostr event.
2. **Inner Layer – Noise-style FS:**
   - Inner event’s `content` is **not raw note plaintext**, but a `NoisePnsEnvelope` containing:
     - Small header (`version`, `fs_mode`, `note_epoch`, `ttl`, etc.).
     - **Noise-encrypted note ciphertext**, produced with a per-note symmetric key.
   - Per-note keys come from a **Noise-inspired symmetric state** seeded from a random root key _not derivable from `nsec`_.

Result: Decrypting outer NIP-44 with `pns_nip44_key` yields only the Noise envelope. Without the additional Noise/PNS secret state, an attacker cannot recover note plaintext.

---

## 3. Key Management Strategy

### 3.1 Key Roles

- **Primary identity keys** (existing):
  - `nsec`, `npub`: root of identity, authentication, and PNS deterministic keys.
- **Deterministic PNS keys** (existing PNS spec):
  - `pns_key`, `pns_keypair`, `pns_nip44_key`: derived from `nsec`, used only for outer NIP-44 envelope.
- **PNS Noise FS root (new):**
  - `pns_fs_root`: 32-byte random secret generated client-side on first FS-enabled PNS use.
  - Stored **only** inside `ClientSessionVault`, encrypted under existing device-level keys.
  - Never derivable from `nsec`; never sent to relays or Netlify functions.
- **PNS Noise chain state (new):**
  - `NoisePnsChainState` with fields like `rootKey`, `chainKey`, `noteCounter`.
  - Derived and updated using the same HKDF primitives as the general Noise overlay (from `src/lib/noise/primitives.ts`).
- **Per-note keys (new):**
  - `note_key_i = HKDF(chainKey_{i-1}, "pns-fs-note" || i)`
  - Used as AEAD key (ChaCha20-Poly1305 or AES-GCM) for the inner Noise ciphertext.

### 3.2 Rotation and Persistence

- Rotation:
  - Each new note increments `noteCounter` and advances `chainKey`.
  - Different notes use different `note_key_i` values; keys are not reused across notes.
- Persistence:
  - `pns_fs_root` and the **current** `NoisePnsChainState` are stored encrypted in `ClientSessionVault`.
  - `note_key_i` is derived on demand from `NoisePnsChainState` and not stored separately (can be recomputed on the same device).
- Forward secrecy property:
  - An attacker with only `nsec` cannot derive `pns_fs_root` or any `note_key_i`, so cannot open notes.
  - A full device compromise (vault exfiltration) remains out of scope for this FS guarantee and must be managed by broader device security practices.

### 3.3 Hardware MFA Tier (NFC Tokens)

For users who opt in, Satnam can add a **hardware-backed MFA tier** for Noise-FS notes. In this tier, decrypting or writing FS-protected notes requires _all_ of the following factors at access time:

- Physical possession of the user’s device (running the Satnam client).
- Knowledge of the user’s primary Nostr `nsec` (to derive the PNS stream and outer keys).
- Knowledge of the user’s Satnam password (to unlock `ClientSessionVault`).
- Physical possession of an enrolled NFC hardware token (Boltcard or Satscard).
- Knowledge of the hardware token’s PIN (to authorize signing on the token).

An attacker with **any 4 of these 5 factors** (e.g., device + `nsec` + password + card but no PIN, or device + `nsec` + password + PIN but no card) still cannot cause the client to unlock `pns_fs_root` or derive per-note keys.

High-level key hierarchy impact:

- `pns_fs_root` remains a random secret stored only inside `ClientSessionVault`, encrypted under the device/password-derived vault keys.
- A new `HardwareMfaGuard` component wraps all operations that need `pns_fs_root` for FS-protected notes:
  - Prompts the user to enter the token PIN and tap the NFC card.
  - Uses Web NFC to send a challenge to the card and verifies the returned secp256k1 signature using the stored card public key.
  - Only on successful verification does the vault layer release `pns_fs_root` into memory for the duration of the operation.

This means that even if an attacker has the full vault contents, `nsec`, and the physical device, they cannot derive FS note keys **without live, PIN-gated cooperation from the NFC token**. The hardware token never leaves the user’s possession, and its PIN and signatures never leave the browser; Netlify Functions and Supabase remain unaware of these details in keeping with Satnam’s zero-knowledge architecture.

---

## 4. Encryption Layer Design

### 4.1 High-Level Flow (Write)

1. User composes a note and chooses **Ephemeral** or **Everlasting** (see section 5).
2. `PnsService` obtains a one-shot `device_key` from `secureNsecManager` as today.
3. Derive `pns_keypair` and `pns_nip44_key` (standard NIP-PNS).
4. From `NoisePnsManager`, obtain `note_key_i` and metadata (`note_epoch`, `fs_mode`).
5. Encrypt note plaintext with `note_key_i` using AEAD → `noise_ciphertext` + `noise_nonce`.
6. Build inner event with `content = NoisePnsEnvelope` (JSON with header + `noise_ciphertext`).
7. Encrypt inner event JSON with NIP-44 v2 using `pns_nip44_key` → outer PNS `content`.
8. Sign and publish kind 1080 PNS event using `pns_keypair`.

### 4.2 High-Level Flow (Read)

1. `PnsService` subscribes to kind 1080 events for the user’s PNS pubkey.
2. For each event:
   - Re-derive `pns_nip44_key` from `nsec` and decrypt outer NIP-44.
   - Parse `NoisePnsEnvelope` from inner event.
   - If `fs_mode === "noise-fs"`, pass `note_epoch` etc. to `NoisePnsManager` to derive `note_key_i`.
   - Decrypt `noise_ciphertext` with `note_key_i` to recover note plaintext.
3. If Noise state is missing or corrupted, notes are preserved but unreadable until the user restores appropriate FS secrets.

### 4.3 Relationship to Existing Noise Overlay

- Reuse **Noise primitives** (`DH`, `HKDF`, AEAD) from `src/lib/noise/primitives.ts`.
- The chat-focused `NoiseSessionManager` continues to manage peer sessions.
- A new `NoisePnsManager` reuses the same primitives but runs a **self-contained symmetric state** instead of a peer handshake.

---

## 5. Ephemeral vs. Everlasting Notes

### 5.1 User-Facing Semantics

- **Ephemeral notes:**
  - User selects a retention policy (e.g., 24h, 7d, 30d).
  - After expiry, Satnam **no longer displays or decrypts** the note and attempts relay deletion.
- **Everlasting notes:**
  - Notes are intended to be kept indefinitely, as long as the user retains their FS state.

### 5.2 Technical Behavior

- Ephemeral notes:
  - Inner header includes `ttl` and `expires_at` fields.
  - Local scheduler deletes decrypted cache after expiry and can drop any local per-note metadata.
  - Best-effort relay deletion via standard delete events (kind 5) referencing the PNS event id.
  - Optionally, `NoisePnsManager` can mark epochs as **expired**, disallowing re-derivation of `note_key_i` once the user confirms deletion.
- Everlasting notes:
  - No automatic deletion; `NoisePnsManager` retains ability to re-derive `note_key_i` as long as `pns_fs_root` and chain state are available.

---

## 6. Interoperability Considerations

- **Event-level compatibility:**
  - All notes remain valid NIP-PNS events: kind 1080, signed by deterministic PNS keypair, NIP-44 v2 outer encryption.
- **Client behavior:**
  - Basic NIP-PNS clients will successfully decrypt the outer NIP-44 layer but see an inner event whose `content` is an opaque Noise envelope.
  - Advanced clients that implement this **Noise-PNS extension** and hold `pns_fs_root` (or equivalent) can fully decrypt note plaintext.
- **Root of trust:**
  - The primary `nsec` remains the root for identity and PNS stream discovery; Noise adds an **additional layer of secrecy**, not a new identity.
- **Trade-off:**
  - Full portability across clients requires exporting/importing the PNS FS secret, not just `nsec`. This is the necessary trade-off to gain FS against `nsec` compromise.

---

## 7. Step-by-Step Implementation Plan

1. **Design & Spec Alignment**

   - Finalize the `NoisePnsEnvelope` format (fields, versioning, fs_mode, ttl).
   - Document this as an internal extension spec, referencing NIP-PNS and PHASE_5 Noise plan.

2. **Noise Primitives & Types (reuse from Phase 5)**

   - Ensure `src/lib/noise/primitives.ts` and `types.ts` expose HKDF and AEAD helpers usable by PNS.
   - Confirm all primitives use Web Crypto / @scure/@noble and are browser-only.

3. **NoisePnsManager Implementation (behind feature flag)**

   - File: `src/lib/noise/noise-pns-manager.ts`.
   - Responsibilities:
     - Generate and store `pns_fs_root` in `ClientSessionVault`.
     - Maintain `NoisePnsChainState` (rootKey, chainKey, noteCounter).
     - Provide `deriveNoteKey(noteEpoch): Promise<Uint8Array>`.
     - Handle rotation and optional epoch expiration for ephemeral notes.

4. **PnsService Extension**

   - Integrate `NoisePnsManager` into the existing PNS write/read flows.
   - Add support for building/parsing `NoisePnsEnvelope` while keeping legacy PNS paths available.
   - Introduce a new `fs_mode` option (`"none" | "noise-fs"`) for notes.

5. **Ephemeral Policy Layer**

   - Implement ephemeral policy evaluation and timers within PNS UI/service.
   - Hook into relay deletion (kind 5) and local cache/key cleanup.

6. **Configuration & Flags**

   - Add `VITE_PNS_NOISE_FS_ENABLED` (dependent on `VITE_NOISE_EXPERIMENTAL_ENABLED`).
   - Keep all new behavior gated and easily rollbackable.

7. **Documentation & UX Copy**

   - Explain to users that **Noise-FS notes require more than just `nsec`** for recovery.
   - Clarify semantics of Ephemeral vs. Everlasting.

8. **Hardware MFA (NFC) Integration**

   - Implement a `HardwareMfaService` or `PnsHardwareMfaService` that wraps the Web NFC API in the browser (where available) and exposes a simple `signChallengeWithToken()` flow for Boltcard/Satscard.
   - Build an **enrollment flow**: detect a compatible NFC token, read or derive a stable public identifier (card pubkey / card ID), prompt the user to set/confirm a PIN on the token, and store the token metadata (but not the PIN) in `ClientSessionVault` alongside PNS Noise-FS configuration.
   - Build a **usage flow**: before unlocking `pns_fs_root` for FS-protected notes, call the hardware MFA service to (a) prompt for PIN, (b) ask the user to tap the token, (c) send a challenge via Web NFC, and (d) verify the returned signature against the stored card public key.
   - Design **offline behavior and recovery**: define how reads/writes behave when Web NFC is unavailable, how users can fall back to a lower security tier if they intentionally remove hardware MFA, and how token replacement/rotation is handled without weakening FS guarantees.

---

## 8. Risk Analysis

- **Complexity & Footguns:**
  - Risk of users misunderstanding that FS-protected notes require extra secrets beyond `nsec`.
  - Mitigation: explicit warnings, clear toggles, and separate export/import flows for PNS FS secrets.
- **Data Loss:**
  - If users lose both `nsec` and the PNS FS secret, notes become unrecoverable.
  - Mitigation: emphasize backup flows; allow users to opt out of FS and use standard PNS only.
- **Interoperability Fragmentation:**
  - Some clients may not implement the Noise-PNS extension.
  - Mitigation: keep event structure NIP-compliant; publish a minimal public spec of the envelope format.
- **Crypto Implementation Bugs:**
  - New key schedule and AEAD usage introduce attack surface.
  - Mitigation: reuse audited primitives, keep code small, require independent review.
- **Hardware token loss or destruction:**
  - If a user loses or destroys their NFC token while hardware MFA is enabled, they may permanently lose access to FS-protected notes unless they have pre-enrolled a backup token or intentionally disabled the hardware tier.
  - Mitigation: clearly flag this during enrollment, encourage backup tokens, and provide a deliberate downgrade flow that requires full session, password, and card possession while the card is still available.
- **PIN brute-force and lockout:**
  - Aggressive PIN guessing could lock the token or leak side-channel information.
  - Mitigation: rely on the token's built-in retry limits, add local rate-limiting in the client, and never store or transmit PINs outside the browser.
- **Hardware / supply-chain compromise:**
  - Malicious or backdoored cards could exfiltrate secrets or mis-sign challenges.
  - Mitigation: document recommended vendors, keep the hardware tier strictly optional, and design the protocol so that even a compromised card cannot weaken non-hardware PNS/Noise security properties.

---

## 9. Testing Strategy

- **Unit Tests:**
  - Verify that `note_key_i` differs across notes and cannot be derived from `nsec` alone.
  - Validate encrypt/decrypt round-trips for Noise envelopes and outer NIP-44 layers.
- **Property/Scenario Tests:**
  - Simulate a `nsec` compromise with no access to PNS FS secrets and confirm decryption fails.
  - Simulate vault restore on a new device with both `nsec` and FS secret and confirm all notes decrypt.
- **Integration Tests:**
  - End-to-end flows using real relays (or mocks): create notes, rotate, mark ephemeral, delete, and verify behavior.
- **Manual & Security Review:**
  - Have a security reviewer assess the key schedule and interaction with existing Noise overlay.

---

## 10. Open Questions

- Should the PNS FS secret be **exportable and shareable** across devices by default, or opt-in only for advanced users?
- Do we want a **dual-mode** PNS where some notes use standard PNS-only encryption (no FS), and others use Noise-FS, or should FS be global per user/device?
- What is the exact user-facing language to describe the trade-off between **forward secrecy** and **recoverability**?
- Is there value in defining this Noise-PNS envelope as a **public mini-spec** for the broader Nostr ecosystem, or should it remain a Satnam-only extension initially?
- What set of NFC operations (APDUs, secp256k1 signing, possible ECDH) are reliably available on Boltcard/Satscard via Web NFC, and do we need card-specific protocols or can we treat them as generic signing tokens?
- Should the same hardware MFA pattern be generalized to other devices (e.g., YubiKey, FIDO2/WebAuthn authenticators) behind a common `HardwareMfaService` abstraction, or remain NFC-card-specific initially?
- How much cross-platform Web NFC support (mobile vs. desktop, specific browsers) is required before we advertise this as a first-class feature rather than an advanced, experimental tier?
