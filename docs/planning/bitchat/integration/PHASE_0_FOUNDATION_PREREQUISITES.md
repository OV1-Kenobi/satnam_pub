# Phase 0: Foundation & Prerequisites

## 1. Overview

- **Objective:** Establish foundational infrastructure required by all subsequent Bitchat integration phases, including Noise Protocol forward secrecy (all 3 security tiers), Bitcoin/Lightning payment primitives, and relay registry with public/self-hosted classification.
- **Success Criteria:**
  - Noise Protocol primitives (`src/lib/noise/primitives.ts`, `types.ts`) implemented with Web Crypto and @scure libraries.
  - `NoiseSessionManager` supports all 3 security tiers: Ephemeral Standard FS, Everlasting Standard FS, Hardened FS.
  - `NoisePnsManager` integrates with `ClientSessionVault` for `pns_fs_root` storage.
  - LNbits wallet creation during registration verified working in production.
  - Static `georelays.json` registry created with public/self-hosted relay classification.
  - All new messaging/notes use forward secrecy by default (greenfield FS).
- **Estimated Complexity/Time:** High (15–20 developer-days including security review and NFC hardware MFA planning).
- **Dependencies:**
  - `ClientSessionVault` (`src/lib/auth/client-session-vault.ts`) for secure key storage.
  - Web Crypto API for all cryptographic operations.
  - `@scure/base`, `@scure/bip32`, `@noble/curves` for X25519/ChaCha20-Poly1305.
  - LNbits instance and `lnbits-proxy.ts` Netlify function.
  - CEPS (`lib/central_event_publishing_service.ts`) for relay configuration.

---

## 2. Technical Specifications

### 2.1 Noise Protocol Security Tiers

| Tier  | Name                    | Key Rotation               | Factors                                    | Use Cases                               |
| ----- | ----------------------- | -------------------------- | ------------------------------------------ | --------------------------------------- |
| **1** | Ephemeral Standard FS   | Per-session or time-epoch  | 3 (device, nsec, password)                 | Temporary geo-room chats, ephemeral DMs |
| **2** | Everlasting Standard FS | Chain-based with archival  | 3 (device, nsec, password)                 | Long-term notes, archived conversations |
| **3** | Hardened FS             | Per-session + hardware MFA | 5 (device, nsec, password, NFC token, PIN) | High-sensitivity communications         |

### 2.2 Data Models

```typescript
// src/lib/noise/types.ts

export type NoiseSecurityTier =
  | "ephemeral-standard"
  | "everlasting-standard"
  | "hardened";

export interface NoiseKeyPair {
  publicKey: Uint8Array; // X25519 public key (32 bytes)
  privateKey: CryptoKey; // Non-extractable CryptoKey for ECDH
}

export interface NoiseCipherState {
  key: Uint8Array; // ChaCha20-Poly1305 key (32 bytes)
  nonce: bigint; // 64-bit counter for nonce generation
}

export interface NoiseSessionState {
  sessionId: string; // Unique session identifier
  peerNpub: string; // Peer's Nostr npub
  securityTier: NoiseSecurityTier;
  localEphemeral: NoiseKeyPair;
  remoteStaticKey: Uint8Array | null;
  sendCipherState: NoiseCipherState;
  receiveCipherState: NoiseCipherState;
  handshakeComplete: boolean;
  createdAt: number;
  lastActivity: number;
  rekeyCounter: number; // Messages since last rekey
}

export interface NoisePnsChainState {
  rootKey: Uint8Array; // 32-byte root derived from pns_fs_root
  chainKey: Uint8Array; // Current chain key for HKDF
  noteCounter: number; // Monotonic note index
  securityTier: NoiseSecurityTier;
  createdAt: number;
  lastNoteAt: number;
}

export interface NoiseEnvelope {
  version: 1;
  securityTier: NoiseSecurityTier;
  ephemeralPubkey: string; // Hex-encoded ephemeral public key
  ciphertext: string; // Base64-encoded encrypted payload
  nonce: string; // Base64-encoded nonce
  noteEpoch?: number; // For PNS notes: epoch for key derivation
}

// Relay registry types
export type RelayTrustLevel = "public" | "self-hosted";

export interface GeoRelayRecord {
  relayUrl: string;
  trustLevel: RelayTrustLevel;
  regionCode: string; // ISO 3166-1 alpha-2 or geohash prefix
  latitude: number;
  longitude: number;
  healthScore: number; // 0-100, updated periodically
  operator?: string; // Optional: relay operator identifier
  familyFederationId?: string; // For self-hosted: owning family federation
}

export interface GeoRelayRegistry {
  version: string; // Semantic version for deterministic selection
  updatedAt: string; // ISO 8601 timestamp
  relays: GeoRelayRecord[];
}
```

### 2.3 API Contracts

```typescript
// src/lib/noise/primitives.ts
export function generateX25519KeyPair(): Promise<NoiseKeyPair>;
export function x25519ECDH(
  privateKey: CryptoKey,
  publicKey: Uint8Array
): Promise<Uint8Array>;
export function hkdfExpand(
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array>;
export function chaCha20Poly1305Encrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array
): Promise<Uint8Array>;
export function chaCha20Poly1305Decrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array
): Promise<Uint8Array>;

// src/lib/noise/noise-session-manager.ts
export class NoiseSessionManager {
  constructor(vault: ClientSessionVault);
  async createSession(
    peerNpub: string,
    securityTier: NoiseSecurityTier
  ): Promise<NoiseSessionState>;
  async ensureSession(peerNpub: string): Promise<NoiseSessionState>;
  async encrypt(
    peerNpub: string,
    plaintext: Uint8Array
  ): Promise<NoiseEnvelope>;
  async decrypt(peerNpub: string, envelope: NoiseEnvelope): Promise<Uint8Array>;
  async rekeySession(peerNpub: string): Promise<void>;
  async closeSession(peerNpub: string): Promise<void>;
  getActiveSessionCount(): number;
}

// src/lib/noise/noise-pns-manager.ts
export class NoisePnsManager {
  constructor(vault: ClientSessionVault);
  async initialize(securityTier: NoiseSecurityTier): Promise<void>;
  async deriveNoteKey(noteEpoch: number): Promise<Uint8Array>;
  async encryptNote(
    plaintext: string,
    securityTier: NoiseSecurityTier
  ): Promise<NoiseEnvelope>;
  async decryptNote(envelope: NoiseEnvelope): Promise<string>;
  async rotateChain(): Promise<void>;
  getChainState(): NoisePnsChainState | null;
}

// src/lib/noise/hardware-mfa-service.ts (Hardened FS)
export interface HardwareMfaService {
  isAvailable(): Promise<boolean>; // Check Web NFC support
  enrollToken(): Promise<HardwareTokenInfo>; // NFC token enrollment flow
  signChallenge(challenge: Uint8Array): Promise<Uint8Array>; // Boltcard/Satscard signature
  verifyPin(pin: string): Promise<boolean>; // PIN verification
}

// src/lib/geochat/geo-relay-selector.ts
export class GeoRelaySelector {
  constructor(registry: GeoRelayRegistry, config?: GeoRelaySelectorConfig);
  selectRelaysForGeoHash(geohash: string, count?: number): Promise<string[]>;
  selectByTrustLevel(
    geohash: string,
    trustLevel: RelayTrustLevel,
    count?: number
  ): Promise<string[]>;
  getRegistryVersion(): string;
}
```

### 2.4 Database Schema Changes

No new Supabase tables required for Phase 0. All Noise keys are stored client-side:

- `pns_fs_root` and chain state in `ClientSessionVault` (IndexedDB, encrypted)
- Session state in memory (cleared on tab close for Ephemeral FS)
- Hardware token metadata in `ClientSessionVault` (for Hardened FS enrollment)

### 2.5 Environment Variables / Flags

```bash
# Noise Protocol
VITE_NOISE_ENABLED=true                    # Master switch for Noise FS
VITE_NOISE_DEFAULT_TIER=ephemeral-standard # Default security tier
VITE_NOISE_REKEY_MESSAGES=100              # Messages before auto-rekey
VITE_NOISE_REKEY_SECONDS=3600              # Seconds before auto-rekey (1 hour)
VITE_NOISE_HARDENED_ENABLED=false          # Enable Hardened FS (requires NFC)

# Relay Registry
VITE_GEORELAYS_REGISTRY_VERSION=1.0.0      # Expected registry version
VITE_GEORELAYS_PREFER_SELF_HOSTED=false    # Prefer self-hosted relays when available
VITE_GEORELAYS_SELF_HOSTED_URL=            # Optional: URL to family-federation relay list

# Lightning (existing, verify working)
VITE_LNBITS_INTEGRATION_ENABLED=true       # Already exists
VITE_LNBITS_URL=                           # LNbits instance URL
```

### 2.6 Integration Points

- **ClientSessionVault**: Store `pns_fs_root`, chain state, hardware token metadata
- **CEPS**: Use Noise-encrypted payloads for NIP-17/NIP-59 transport
- **GiftwrappedMessaging.tsx**: All new DM/group messaging uses Noise FS
- **PNS Service**: All notes-to-self use `NoisePnsManager`
- **IdentityForge.tsx**: Verify LNbits wallet provisioning on registration

---

## 3. Architecture & Design Decisions

### 3.1 Greenfield Forward Secrecy

**Critical Design Principle:** All new communications use Noise Protocol forward secrecy from their first commit. There is NO "legacy non-FS mode" or "FS as optional upgrade" pattern.

- **DMs**: `NoiseSessionManager.encrypt()` → NIP-59 giftwrap → relay publish
- **Group Chats**: Per-group Noise session with shared ephemeral keys
- **Notes-to-Self**: `NoisePnsManager.encryptNote()` → NIP-PNS kind 1080

### 3.2 Security Tier Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Noise Security Tier Selection                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User Choice ──► ┌──────────────────┐                               │
│                  │ Ephemeral Std FS │ ◄── Temporary chats           │
│                  │ (Tier 1)         │     Keys cleared on close     │
│                  └────────┬─────────┘                               │
│                           │                                          │
│  User Choice ──► ┌────────▼─────────┐                               │
│                  │ Everlasting Std  │ ◄── Archived conversations    │
│                  │ FS (Tier 2)      │     Chain-based key derivation│
│                  └────────┬─────────┘                               │
│                           │                                          │
│  User Choice ──► ┌────────▼─────────┐                               │
│  + NFC Token     │ Hardened FS      │ ◄── High-sensitivity comms    │
│  + PIN           │ (Tier 3)         │     5-factor authentication   │
│                  └──────────────────┘                               │
│                                                                      │
│  All tiers use same Noise primitives; differ in:                    │
│  - Key storage location (memory vs vault)                           │
│  - Retention policy (ephemeral vs archival)                         │
│  - Authentication factors (3 vs 5)                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Relay Trust Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Relay Trust Level Selection                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  GeoRelaySelector.selectRelaysForGeoHash(geohash, count)            │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 1. Load registry (bundled georelays.json or remote fetch)  │    │
│  │ 2. Filter by geohash proximity                               │    │
│  │ 3. Apply trust level preference (VITE_GEORELAYS_PREFER...)  │    │
│  │ 4. SHA-256 deterministic scoring: hash(geohash + relayUrl)  │    │
│  │ 5. Return top N relays                                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Trust Levels:                                                       │
│  ┌────────────────────────┐  ┌────────────────────────┐             │
│  │ PUBLIC (Level 1)       │  │ SELF-HOSTED (Level 2)  │             │
│  │ - Community relays     │  │ - Family-federation    │             │
│  │ - Higher availability  │  │   operated relays      │             │
│  │ - Lower privacy        │  │ - Higher privacy       │             │
│  │ - Default for geo-room │  │ - Requires setup       │             │
│  └────────────────────────┘  └────────────────────────┘             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.4 Bitcoin/Lightning Verification

Phase 0 verifies existing LNbits integration:

1. **Registration Flow**: `IdentityForge.tsx` → `provisionWallet()` → `lnbits-proxy.ts`
2. **Lightning Address**: `createLightningAddress()` creates LNURL-pay link
3. **Payment Primitives**: `payInvoice()`, `getPaymentHistory()` for Phase 4 geo-room payments

Document which additional primitives Phase 4 will need (e.g., streaming sats, micro-payments).

---

## 4. Implementation Checklist

### 4.1 Noise Protocol Primitives (Priority 1)

1. **Create Noise Type Definitions**

   - File: `src/lib/noise/types.ts`
   - Define all interfaces from Section 2.2
   - Strict TypeScript, no `any`

2. **Implement Noise Primitives**

   - File: `src/lib/noise/primitives.ts`
   - X25519 key generation using Web Crypto `generateKey('X25519')`
   - ECDH using `deriveBits` with X25519
   - HKDF using `deriveBits` with HKDF algorithm
   - ChaCha20-Poly1305 using `@noble/ciphers` or `@scure` equivalent

3. **Implement NoiseSessionManager**

   - File: `src/lib/noise/noise-session-manager.ts`
   - Session lifecycle: create, encrypt, decrypt, rekey, close
   - Support all 3 security tiers
   - In-memory session map keyed by peer npub
   - Auto-rekey based on message count or time

4. **Implement NoisePnsManager**

   - File: `src/lib/noise/noise-pns-manager.ts`
   - `pns_fs_root` generation and storage in ClientSessionVault
   - Chain state management (rootKey, chainKey, noteCounter)
   - Per-note key derivation via HKDF

5. **Hardware MFA Service Skeleton**
   - File: `src/lib/noise/hardware-mfa-service.ts`
   - Web NFC availability detection
   - Enrollment flow placeholder (Boltcard/Satscard)
   - Challenge-response interface definition

### 4.2 Relay Registry & Selection (Priority 2)

6. **Create Static Relay Registry**

   - File: `src/config/georelays.json`
   - Include version field, public/self-hosted classification
   - Initial set of community Nostr relays with approximate geo-coordinates

7. **Implement GeoRelaySelector**
   - File: `src/lib/geochat/geo-relay-selector.ts`
   - SHA-256 deterministic scoring algorithm
   - Trust level filtering (public vs self-hosted)
   - Never return empty array; throw `GeoRelaySelectionError` on failure

### 4.3 Bitcoin/Lightning Verification (Priority 3)

8. **Verify LNbits Integration**

   - Test `provisionWallet()` flow in staging/production
   - Verify `createLightningAddress()` creates working LNURL-pay links
   - Document any issues or required fixes

9. **Document Phase 4 Payment Primitives**
   - Identify APIs needed for geo-room payments (tips, streaming sats)
   - Evaluate NWC vs direct LNbits for micro-payments
   - Document integration points with `payment-automation.ts`

### 4.4 Tests (Priority 4)

10. **Noise Primitives Unit Tests**

    - File: `src/lib/noise/__tests__/primitives.test.ts`
    - Key generation, ECDH, HKDF, encryption/decryption round-trips

11. **NoiseSessionManager Tests**

    - File: `src/lib/noise/__tests__/noise-session-manager.test.ts`
    - Session lifecycle, multi-tier support, rekey behavior

12. **NoisePnsManager Tests**

    - File: `src/lib/noise/__tests__/noise-pns-manager.test.ts`
    - Chain state management, note key derivation, vault integration

13. **GeoRelaySelector Tests**
    - File: `src/lib/geochat/__tests__/geo-relay-selector.test.ts`
    - Deterministic selection, trust level filtering, error cases

---

## 5. Testing Strategy

### 5.1 Unit Tests

- **Noise Primitives**: Verify cryptographic correctness with known test vectors (RFC 7748 for X25519, RFC 8439 for ChaCha20-Poly1305)
- **Key Derivation**: Verify HKDF outputs match expected values for given inputs
- **Session Manager**: Test session creation, encryption/decryption round-trips, rekey triggers
- **PNS Manager**: Test chain state progression, note key uniqueness, vault persistence
- **Relay Selector**: Test deterministic ordering, trust level filtering, error handling

### 5.2 Integration Tests

- **Vault Integration**: Verify `pns_fs_root` persists across page reloads
- **CEPS Transport**: Verify Noise-encrypted payloads can be wrapped in NIP-59 and published
- **LNbits Flow**: End-to-end test of wallet provisioning during registration
- **Cross-Tab**: Verify Ephemeral FS sessions are properly isolated per tab

### 5.3 Security Validation

- **Key Isolation**: Verify Tier 1 keys are never persisted to disk
- **Forward Secrecy**: Verify past messages cannot be decrypted after rekey
- **Constant-Time**: Verify comparison operations use constant-time implementations
- **Memory Cleanup**: Verify sensitive key material is zeroed after use

### 5.4 Manual Testing

- **Registration Flow**: Complete registration and verify LNbits wallet is created
- **Security Tier Selection**: UI allows choosing between the 3 tiers
- **Hardware MFA**: If NFC available, test Boltcard/Satscard detection

---

## 6. User Experience Flow

### 6.1 First-Time Setup (During Registration)

1. User completes Identity Forge registration
2. System automatically:
   - Provisions LNbits wallet (existing flow)
   - Generates `pns_fs_root` and stores in ClientSessionVault
   - Sets default security tier to `ephemeral-standard`
3. User can later upgrade to Everlasting or Hardened FS in Settings

### 6.2 Security Tier Selection (Settings)

1. User navigates to Settings → Security → Forward Secrecy
2. UI displays three options:
   - **Ephemeral Standard** (default): "Temporary chats, keys cleared on close"
   - **Everlasting Standard**: "Long-term storage with forward secrecy"
   - **Hardened**: "Maximum security with NFC hardware token" (requires enrollment)
3. Changing tier affects new messages only; existing messages retain their original tier

### 6.3 Hardened FS Enrollment

1. User selects "Hardened FS" tier
2. System checks Web NFC availability
3. If available: Prompt user to tap Boltcard/Satscard
4. Read card public key, prompt for PIN setup
5. Store token metadata (not PIN) in ClientSessionVault
6. Hardened FS enabled for subsequent messages

---

## 7. Migration & Rollout Plan

### 7.1 Feature Flag Rollout

1. **Development**: `VITE_NOISE_ENABLED=true`, all tiers available
2. **Staging**: Same as development, with full integration testing
3. **Production**: Initially `VITE_NOISE_ENABLED=true` for new accounts only
4. **Hardened FS**: `VITE_NOISE_HARDENED_ENABLED=false` until NFC testing complete

### 7.2 No Legacy Mode

- All new accounts start with Noise FS from day 1
- No migration needed since this is greenfield
- Existing non-FS code paths (if any) should be removed, not maintained

### 7.3 Relay Registry Updates

- Initial `georelays.json` ships with v1.0.0
- Registry updates require app rebuild (static bundling)
- Future: Optional dynamic registry fetch via `VITE_GEORELAYS_SELF_HOSTED_URL`

---

## 8. Open Questions & Risks

### 8.1 Resolved Design Decisions

> _These questions were resolved before implementation began._

1. **X25519 Implementation**: Use `@noble/curves` x25519 as the **primary/default implementation**. Only fall back to Web Crypto API's X25519 if `@noble/curves` is unavailable or fails. This ensures consistent behavior across all browsers, as Web Crypto X25519 support is still not universal.

2. **ChaCha20-Poly1305 Implementation**: Use `@noble/ciphers` for ChaCha20-Poly1305 AEAD encryption. Web Crypto API does not support this cipher suite natively, so `@noble/ciphers` is the required dependency. This aligns with our preference for the audited `@noble/*` / `@scure/*` ecosystem.

3. **Web NFC / Hardened FS Availability**: Hardened FS tier is acceptable as **Android-only** (Chrome Android) for the initial implementation. The UI must clearly communicate this platform limitation to users when they attempt to select Hardened FS on unsupported platforms (e.g., "Hardened FS requires Chrome on Android with NFC support").

4. **Group Chat Forward Secrecy**: Use **pairwise Noise sessions** for group chats. Each participant maintains separate Noise sessions with every other participant, rather than a single shared group key. This provides stronger forward secrecy and compartmentalization (compromise of one session doesn't affect others).

5. **Multi-Device Sync for Everlasting FS**: Share the `pns_fs_root` across devices via an **encrypted sync mechanism**. Integrate with existing ClientSessionVault sync if available, or implement an encrypted backup/restore flow. The `pns_fs_root` is exported/imported as an encrypted blob protected by the user's password.

### 8.2 Risks

| Risk                                               | Likelihood | Impact | Mitigation                                             |
| -------------------------------------------------- | ---------- | ------ | ------------------------------------------------------ |
| Web Crypto X25519 not available in target browsers | Medium     | High   | Use `@noble/curves` as fallback with feature detection |
| Performance impact of per-message encryption       | Low        | Medium | Profile and optimize; ChaCha20 is fast                 |
| NFC token enrollment UX is confusing               | Medium     | Medium | Clear step-by-step UI with visual feedback             |
| Chain state corruption loses access to notes       | Low        | High   | Implement chain state backup/recovery mechanism        |
| LNbits wallet provisioning fails silently          | Medium     | Medium | Add explicit error surfacing and retry UI              |

### 8.3 Security Considerations

- **No Custom Crypto**: Use only audited libraries (`@noble/*`, `@scure/*`)
- **Key Extraction Prevention**: Use non-extractable CryptoKey where possible
- **Side-Channel Resistance**: Constant-time operations for comparisons
- **Memory Safety**: Zero sensitive buffers after use (limited in JS, use `crypto.getRandomValues` to overwrite)

---

## 9. Dependencies on Subsequent Phases

| Phase       | Dependency from Phase 0                                        |
| ----------- | -------------------------------------------------------------- |
| **Phase 1** | Uses `georelays.json` registry for relay preview (read-only)   |
| **Phase 2** | Uses `GeoRelaySelector` for deterministic relay selection      |
| **Phase 3** | Uses `NoiseSessionManager` for all private DMs and group chats |
| **Phase 4** | Uses verified LNbits primitives for geo-room payments          |
| **Phase 5** | Extends `NoiseSessionManager` with advanced Noise patterns     |

---

## 10. Code Reference Examples (Non-Production Sketches)

> The following snippets are **reference-only TypeScript sketches** to clarify interfaces and usage patterns. Final implementations should follow Satnam coding standards.

### 10.1 Noise Primitives Usage

```typescript
// Reference: Using Noise primitives for session encryption
// File: src/lib/noise/noise-session-manager.ts (sketch)

import {
  generateX25519KeyPair,
  x25519ECDH,
  hkdfExpand,
  chaCha20Poly1305Encrypt,
} from "./primitives";
import type {
  NoiseSessionState,
  NoiseSecurityTier,
  NoiseEnvelope,
} from "./types";

export class NoiseSessionManager {
  private sessions: Map<string, NoiseSessionState> = new Map();
  private vault: ClientSessionVault;

  constructor(vault: ClientSessionVault) {
    this.vault = vault;
  }

  async createSession(
    peerNpub: string,
    securityTier: NoiseSecurityTier
  ): Promise<NoiseSessionState> {
    // Generate ephemeral keypair for this session
    const localEphemeral = await generateX25519KeyPair();

    // Initialize cipher states (will be populated after handshake)
    const session: NoiseSessionState = {
      sessionId: crypto.randomUUID(),
      peerNpub,
      securityTier,
      localEphemeral,
      remoteStaticKey: null,
      sendCipherState: { key: new Uint8Array(32), nonce: 0n },
      receiveCipherState: { key: new Uint8Array(32), nonce: 0n },
      handshakeComplete: false,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      rekeyCounter: 0,
    };

    // For Everlasting/Hardened FS, persist session to vault
    if (securityTier !== "ephemeral-standard") {
      await this.persistSessionToVault(session);
    }

    this.sessions.set(peerNpub, session);
    return session;
  }

  async encrypt(
    peerNpub: string,
    plaintext: Uint8Array
  ): Promise<NoiseEnvelope> {
    const session = await this.ensureSession(peerNpub);
    if (!session.handshakeComplete) {
      throw new Error("Session handshake not complete");
    }

    // Generate nonce from counter
    const nonceBytes = new Uint8Array(12);
    new DataView(nonceBytes.buffer).setBigUint64(
      4,
      session.sendCipherState.nonce,
      false
    );

    // Encrypt with ChaCha20-Poly1305
    const ciphertext = await chaCha20Poly1305Encrypt(
      session.sendCipherState.key,
      nonceBytes,
      plaintext
    );

    // Increment nonce and check for rekey
    session.sendCipherState.nonce++;
    session.rekeyCounter++;
    session.lastActivity = Date.now();

    if (this.shouldRekey(session)) {
      await this.rekeySession(peerNpub);
    }

    return {
      version: 1,
      securityTier: session.securityTier,
      ephemeralPubkey: bytesToHex(session.localEphemeral.publicKey),
      ciphertext: base64Encode(ciphertext),
      nonce: base64Encode(nonceBytes),
    };
  }

  private shouldRekey(session: NoiseSessionState): boolean {
    const maxMessages = Number(getEnvVar("VITE_NOISE_REKEY_MESSAGES") ?? "100");
    const maxSeconds = Number(getEnvVar("VITE_NOISE_REKEY_SECONDS") ?? "3600");
    const elapsed = (Date.now() - session.createdAt) / 1000;

    return session.rekeyCounter >= maxMessages || elapsed >= maxSeconds;
  }

  // ... additional methods omitted for brevity
}
```

### 10.2 GeoRelaySelector with Trust Levels

```typescript
// Reference: Deterministic relay selection with trust levels
// File: src/lib/geochat/geo-relay-selector.ts (sketch)

import type {
  GeoRelayRegistry,
  GeoRelayRecord,
  RelayTrustLevel,
} from "../noise/types";
import { getEnvVar } from "../../config/env.client";

export class GeoRelaySelectionError extends Error {
  constructor(message: string, public readonly geohash: string) {
    super(message);
    this.name = "GeoRelaySelectionError";
  }
}

export class GeoRelaySelector {
  private registry: GeoRelayRegistry;
  private preferSelfHosted: boolean;

  constructor(registry: GeoRelayRegistry) {
    this.registry = registry;
    this.preferSelfHosted =
      getEnvVar("VITE_GEORELAYS_PREFER_SELF_HOSTED") === "true";
  }

  async selectRelaysForGeoHash(
    geohash: string,
    count: number = 3
  ): Promise<string[]> {
    // Validate geohash
    if (!geohash || geohash.length < 1) {
      throw new GeoRelaySelectionError("Invalid geohash", geohash);
    }

    // Filter relays by trust level preference
    let candidates = this.registry.relays;
    if (this.preferSelfHosted) {
      const selfHosted = candidates.filter(
        (r) => r.trustLevel === "self-hosted"
      );
      if (selfHosted.length >= count) {
        candidates = selfHosted;
      }
      // Otherwise fall back to all relays
    }

    // Score each relay deterministically
    const scored = await Promise.all(
      candidates.map(async (relay) => ({
        relay,
        score: await this.computeScore(geohash, relay.relayUrl),
      }))
    );

    // Sort by score (ascending) and take top N
    scored.sort((a, b) => a.score.localeCompare(b.score));
    const selected = scored.slice(0, count).map((s) => s.relay.relayUrl);

    if (selected.length === 0) {
      throw new GeoRelaySelectionError(
        "No relays available for geohash",
        geohash
      );
    }

    return selected;
  }

  private async computeScore(
    geohash: string,
    relayUrl: string
  ): Promise<string> {
    // Deterministic scoring: SHA-256(version + geohash + relayUrl)
    const input = `v1|${geohash}|${relayUrl}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(input)
    );
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  getRegistryVersion(): string {
    return this.registry.version;
  }
}
```
