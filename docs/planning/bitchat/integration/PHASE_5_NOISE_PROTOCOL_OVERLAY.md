# Phase 5: Noise Protocol Overlay Planning

## Implementation Status: ✅ COMPLETE

**Completed:** 2025-11-26

### Implementation Summary

| Priority | Description                              | Status      |
| -------- | ---------------------------------------- | ----------- |
| 1        | Phase 5 Types                            | ✅ Complete |
| 2        | Feature Flag                             | ✅ Complete |
| 3        | Advanced Handshake Patterns (XX, IK, NK) | ✅ Complete |
| 4        | Noise-over-Nostr Adapter                 | ✅ Complete |
| 5        | Hardware MFA Implementation              | ✅ Complete |
| 6        | Messaging Integration                    | ✅ Complete |
| 7        | Unit Tests                               | ✅ Complete |

### Files Created/Modified

| File                                                          | Description                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/noise/types.ts`                                      | Extended with Phase 5 types (NoiseTransportMessage, NoiseNostrEvent, etc.)  |
| `src/config/env.client.ts`                                    | Added NOISE_EXPERIMENTAL_ENABLED, NOISE_REKEY_MESSAGES, NOISE_REKEY_SECONDS |
| `src/lib/noise/noise-session-manager.ts`                      | Extended with XX, IK, NK handshake patterns                                 |
| `src/lib/noise/noise-over-nostr.ts`                           | NEW - Transport adapter for Noise-over-Nostr                                |
| `src/lib/noise/hardware-mfa-service.ts`                       | Full Web NFC implementation                                                 |
| `src/hooks/usePrivacyFirstMessaging.ts`                       | Added Noise state and actions                                               |
| `src/components/communications/PrivateCommunicationModal.tsx` | Added Noise toggle UI                                                       |
| `src/lib/noise/__tests__/noise-over-nostr.test.ts`            | NEW - 13 tests for transport adapter                                        |

### Test Results

- **Total Noise Tests:** 73 passing
- **New Tests Added:** 13 (noise-over-nostr.test.ts)

---

## 1. Phase Overview

- **Objective:** Extend Phase 0's Noise Protocol foundation with advanced patterns for high-security private chats, transported over Nostr (NIP-17/NIP-59), usable for relationships that may originate from geo-rooms.
- **Success Criteria:**
  - Phase 0's `NoiseSessionManager` is extended with advanced Noise handshake patterns (e.g., XX, IK, NK).
  - All private chats use Noise-encrypted payloads by default (greenfield FS from Phase 0).
  - Security tier selection (Ephemeral Standard / Everlasting Standard / Hardened FS) is exposed in chat settings.
  - No Node-specific crypto is introduced; all primitives use Web Crypto and audited libraries.
- **Estimated Complexity/Time:** Medium (5–8 developer-days for advanced patterns, reduced from 10–15 since Phase 0 provides foundation).
- **Dependencies:**
  - **Phase 0:** `NoiseSessionManager`, `NoisePnsManager`, Noise primitives (`primitives.ts`), all 3 security tiers implemented.
  - Phases 2–3 to provide stable private messaging over NIP-59.
  - Existing Web Crypto infrastructure and environment variable patterns.

## 2. Technical Specifications

- **Data Models:**
  - `NoiseKeyPair` with `publicKey: Uint8Array`, `privateKey: CryptoKey`.
  - `NoiseSessionState` with `peerNpub: string`, `remoteStaticKey: Uint8Array | null`, `sendCipherState`, `receiveCipherState` (typed objects, no `any`).
- **API Contracts:**
  - `NoiseSessionManager` in `src/lib/noise/noise-session-manager.ts` exposing:
    - `ensureSession(peerNpub: string): Promise<NoiseSessionState>`.
    - `encrypt(peerNpub: string, plaintext: Uint8Array): Promise<Uint8Array>`.
    - `decrypt(peerNpub: string, ciphertext: Uint8Array): Promise<Uint8Array>`.
  - Integration with Nostr transport via a small adapter in `src/lib/noise/noise-over-nostr.ts`.
- **Database Schema Changes:**
  - None; session keys should remain ephemeral in memory or short-lived in client-side vaults, never in Supabase.
- **Environment Variables / Flags:**
  - `VITE_NOISE_EXPERIMENTAL_ENABLED` to gate the entire overlay.
  - Possible parameterization of rekey intervals via `VITE_NOISE_REKEY_MESSAGES` or `VITE_NOISE_REKEY_SECONDS`.
- **Integration Points:**
  - `usePrivacyFirstMessaging` and the underlying unified messaging service to opt certain conversations into Noise.
  - CEPS for sending/receiving Noise payloads wrapped in NIP-17/NIP-59 giftwrap messages.

## 3. Architecture & Design Decisions

- **Module Architecture:**
  - Separate `noise/` directory under `src/lib` for Noise-specific logic, fully browser-compatible.
  - `NoiseSessionManager` maintains in-memory session map keyed by peer npub.
- **Data Flow:**
  - Chat creation with Noise enabled → handshake messages are sent as Nostr events (kind:14 payloads) encrypted at the transport layer.
  - Once session is established, application payloads are encrypted by Noise and then wrapped as usual in NIP-59 giftwraps.
- **Security & Privacy:**
  - Forward secrecy via ephemeral keys and periodic rekey.
  - No long-term Noise secrets persisted to backend.
  - Defensive programming: constant-time comparisons where required and strict error handling.
- **Browser/Serverless Constraints:**
  - All cryptographic operations use `crypto.subtle` and typed arrays; no `node:crypto` imports.
  - Netlify Functions remain unchanged except possibly to label Noise-secured messages in logs.
- **Web Crypto Usage:**
  - Use audited primitives (e.g., `@scure/` libs) for X25519 and ChaCha20-Poly1305 or equivalent, wrapped in a small adapter.

## 4. Implementation Checklist

1. **Noise Primitive Abstractions**
   - Files: `src/lib/noise/primitives.ts`, `src/lib/noise/types.ts`.
   - Implement type-safe wrappers for DH, AEAD, and hashing using Web Crypto / `@scure/*`.
2. **Implement NoiseSessionManager**
   - File: `src/lib/noise/noise-session-manager.ts`.
   - Manage sessions, handshakes, and rekeying.
3. **Transport Adapter**
   - File: `src/lib/noise/noise-over-nostr.ts`.
   - Map Noise messages to Nostr events and back, using CEPS.
4. **Messaging Integration**
   - Files: `src/hooks/usePrivacyFirstMessaging.ts`, potentially `src/components/communications/PrivateCommunicationModal.tsx`.
   - Add option for "Enable Noise encryption" when starting new private chats (behind feature flag).
5. **Tests**
   - Crypto-level tests for encrypt/decrypt round trips and handshake flows.
   - Integration tests for a Noise-enabled chat using mocked CEPS.

## 5. Testing Strategy

- **Unit Tests:**
  - Verify Noise handshake correctness and that derived keys differ between peers and sessions.
  - Confirm encrypt/decrypt symmetry and nonce reuse protection.
- **Integration Tests:**
  - End-to-end simulated chat flow: establish Noise session, send multiple messages, perform rekey, and confirm transcript integrity.
- **Manual Testing:**
  - Use small test harness to simulate two browser clients exchanging Noise-protected messages.
- **Privacy/Security Validation:**
  - Independent security review of hand-rolled primitives and parameter choices.

## 6. User Experience Flow

- When starting a new private chat, advanced users can toggle "Noise-secured session".
- UI indicates Noise status in the conversation header.
- If Noise fails (e.g., handshake error), user sees a clear message and can fall back to standard giftwrapped DMs.

## 7. Migration & Rollout Plan

- Start with `VITE_NOISE_EXPERIMENTAL_ENABLED=false`.
- Enable only for internal testers and security reviewers initially.
- No schema changes; rollback is flag-based.

## 8. Open Questions & Risks

- Library choice and auditability for Noise primitives in a browser context.
- Performance and battery impact of heavier cryptography on low-power devices.
- Complexity of supporting multi-device sessions and key rotation without server-side state.
