/**
 * Noise Protocol Module
 *
 * Phase 0 Foundation: Forward-secure messaging primitives for Satnam.
 *
 * This module provides:
 * - X25519 key exchange
 * - ChaCha20-Poly1305 AEAD encryption
 * - HKDF key derivation
 * - Session management for 3 security tiers
 * - PNS (Private Notes to Self) with forward secrecy
 * - Hardware MFA service for Hardened FS tier
 *
 * @module src/lib/noise
 */

// Types - Phase 0 Foundation
export type {
  NoiseSecurityTier,
  RelayTrustLevel,
  NoiseKeyPair,
  NoiseCipherState,
  NoiseSessionState,
  SerializedNoiseSession,
  NoisePnsChainState,
  SerializedNoisePnsChainState,
  NoiseEnvelope,
  GeoRelayRecord,
  GeoRelayRegistry,
  HardwareTokenMetadata,
  NfcAvailability,
  NoiseErrorCode,
} from "./types";

// Types - Phase 5 Advanced Handshakes & Transport
export type {
  NoiseHandshakePattern,
  HandshakeDirection,
  NoiseHandshakeState,
  NoiseSessionConfig,
  NoiseTransportMessageType,
  NoiseTransportMessage,
  NoiseNostrEvent,
  NoiseMessageResult,
  NoiseSubscription,
  NoiseMessageCallback,
  NfcChallenge,
  NfcChallengeResponse,
  NfcEnrollmentResult,
  NfcVerificationResult,
  NoiseErrorCodePhase5,
} from "./types";

export {
  NoiseProtocolError,
  GeoRelaySelectionError,
  DEFAULT_NOISE_SESSION_CONFIG,
} from "./types";

// Primitives
export {
  generateX25519KeyPair,
  generateSymmetricKey,
  x25519ECDH,
  hkdfExpand,
  deriveCipherState,
  chaCha20Poly1305Encrypt,
  chaCha20Poly1305Decrypt,
  encryptWithCipherState,
  decryptWithCipherState,
  secureZero,
  constantTimeEqual,
  bytesToHex,
  hexToBytes,
  bytesToBase64,
  base64ToBytes,
} from "./primitives";

// Session Manager
export {
  NoiseSessionManager,
  type VaultAccessor,
} from "./noise-session-manager";

// PNS Manager
export { NoisePnsManager, type EncryptedNote } from "./noise-pns-manager";

// Hardware MFA Service
export {
  HardwareMfaService,
  getNfcAvailabilityMessage,
} from "./hardware-mfa-service";

// Geo Relay Selector
export { GeoRelaySelector } from "./geo-relay-selector";

// Noise-over-Nostr Transport Adapter (Phase 5)
export { NoiseOverNostrAdapter } from "./noise-over-nostr";
