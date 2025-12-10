/**
 * Noise Protocol Types for Satnam
 *
 * Phase 0 Foundation: TypeScript interfaces for forward-secure messaging
 * using Noise Protocol Framework (X25519, ChaCha20-Poly1305, HKDF).
 *
 * @module src/lib/noise/types
 */

// =============================================================================
// Security Tier & Trust Level Types
// =============================================================================

/**
 * Security tier for Noise protocol sessions.
 * - ephemeral-minimum: Burn after reading - immediate deletion after decryption (2-factor: device, nsec)
 * - ephemeral-standard: Session-based keys, cleared on tab/browser close (3-factor: device, nsec, password)
 * - everlasting-standard: Long-lived FS for archival, persisted to vault (3-factor: device, nsec, password)
 * - everlasting-maximum: Maximum security with hardware MFA (5-factor: device, nsec, password, NFC token, PIN)
 * - hardened: Alias for everlasting-maximum (legacy compatibility)
 */
export type NoiseSecurityTier =
  | "ephemeral-minimum"
  | "ephemeral-standard"
  | "everlasting-standard"
  | "everlasting-maximum"
  | "hardened";

/**
 * Relay trust level for geo-room selection.
 * - public: Community-operated relays (higher availability, lower privacy)
 * - self-hosted: User/family-controlled relays (higher privacy, lower availability)
 */
export type RelayTrustLevel = "public" | "self-hosted";

// =============================================================================
// Cryptographic Key Types
// =============================================================================

/**
 * X25519 key pair for Noise protocol ECDH.
 * Uses @noble/curves x25519 as primary implementation.
 */
export interface NoiseKeyPair {
  /** 32-byte X25519 public key */
  publicKey: Uint8Array;
  /** 32-byte X25519 private key (sensitive - never persist for ephemeral tier) */
  privateKey: Uint8Array;
}

/**
 * Cipher state for symmetric encryption within a Noise session.
 * Uses ChaCha20-Poly1305 AEAD via @noble/ciphers.
 */
export interface NoiseCipherState {
  /** 32-byte ChaCha20-Poly1305 key */
  key: Uint8Array;
  /** 64-bit nonce counter (incremented per encryption) */
  nonce: bigint;
}

// =============================================================================
// Session State Types
// =============================================================================

/**
 * Complete state for an active Noise session with a peer.
 * Manages encryption/decryption for bidirectional messaging.
 */
export interface NoiseSessionState {
  /** Unique session identifier (UUID) */
  sessionId: string;
  /** Peer's Nostr public key (npub or hex) */
  peerNpub: string;
  /** Security tier for this session */
  securityTier: NoiseSecurityTier;
  /** Local ephemeral key pair for this session */
  localEphemeral: NoiseKeyPair;
  /** Peer's static public key (populated after handshake) */
  remoteStaticKey: Uint8Array | null;
  /** Cipher state for outgoing messages */
  sendCipherState: NoiseCipherState;
  /** Cipher state for incoming messages */
  receiveCipherState: NoiseCipherState;
  /** Whether the Noise handshake has completed */
  handshakeComplete: boolean;
  /** Session creation timestamp (ms since epoch) */
  createdAt: number;
  /** Last activity timestamp (ms since epoch) */
  lastActivity: number;
  /** Counter for rekey threshold checking */
  rekeyCounter: number;
  /** Phase 5: Handshake pattern used for this session */
  handshakePattern?: NoiseHandshakePattern;
  /** Phase 5: Current handshake state (null after completion) */
  handshakeState?: NoiseHandshakeState | null;
  /** Phase 5: Session configuration */
  config?: NoiseSessionConfig;
  /** Phase 5: Last rekey timestamp (ms since epoch) */
  lastRekeyAt?: number;
}

/**
 * Serializable session state for vault persistence.
 * Used for everlasting-standard and hardened tiers only.
 */
export interface SerializedNoiseSession {
  sessionId: string;
  peerNpub: string;
  securityTier: NoiseSecurityTier;
  /** Base64-encoded local ephemeral public key */
  localEphemeralPubkey: string;
  /** Base64-encoded local ephemeral private key (encrypted before storage) */
  localEphemeralPrivkey: string;
  /** Base64-encoded remote static key */
  remoteStaticKey: string | null;
  /** Base64-encoded send cipher key */
  sendCipherKey: string;
  sendCipherNonce: string;
  /** Base64-encoded receive cipher key */
  receiveCipherKey: string;
  receiveCipherNonce: string;
  handshakeComplete: boolean;
  createdAt: number;
  lastActivity: number;
  rekeyCounter: number;
  /** Phase 5: Handshake pattern used */
  handshakePattern?: NoiseHandshakePattern;
  /** Phase 5: Session configuration (serialized) */
  config?: {
    handshakePattern: NoiseHandshakePattern;
    securityTier: NoiseSecurityTier;
    rekeyAfterMessages: number;
    rekeyAfterSeconds: number;
    allowFallback: boolean;
  };
  /** Phase 5: Last rekey timestamp */
  lastRekeyAt?: number;
}

// =============================================================================
// PNS (Private Notes to Self) Chain State
// =============================================================================

/**
 * Chain state for forward-secure private notes.
 * Implements ratcheting key derivation for notes-to-self.
 */
export interface NoisePnsChainState {
  /** 32-byte root key derived from pns_fs_root */
  rootKey: Uint8Array;
  /** 32-byte chain key (ratcheted after each note) */
  chainKey: Uint8Array;
  /** Counter for deriving unique note keys */
  noteCounter: number;
}

/**
 * Serializable PNS chain state for vault persistence.
 */
export interface SerializedNoisePnsChainState {
  /** Base64-encoded root key */
  rootKey: string;
  /** Base64-encoded chain key */
  chainKey: string;
  noteCounter: number;
}

// =============================================================================
// Relay Registry Types
// =============================================================================

/**
 * Individual relay record with geolocation and trust classification.
 * Based on Bitchat's relay registry format for interoperability.
 */
export interface GeoRelayRecord {
  /** WebSocket URL of the relay (e.g., "wss://relay.example.com") */
  relayUrl: string;
  /** Approximate latitude of the relay's location */
  latitude: number;
  /** Approximate longitude of the relay's location */
  longitude: number;
  /** Trust level classification */
  trustLevel: RelayTrustLevel;
  /** Optional human-readable name */
  name?: string;
  /** Optional operator contact/info */
  operator?: string;
}

/**
 * Complete relay registry with version tracking.
 */
export interface GeoRelayRegistry {
  /** Semantic version of the registry (e.g., "1.0.0") */
  version: string;
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
  /** Array of relay records */
  relays: GeoRelayRecord[];
}

// =============================================================================
// Hardware MFA Types (Hardened FS)
// =============================================================================

/**
 * Hardware token metadata stored in vault.
 * Does NOT contain PIN or sensitive authentication data.
 */
export interface HardwareTokenMetadata {
  /** Token type (Boltcard, Satscard, etc.) */
  tokenType: "boltcard" | "satscard" | "generic-nfc";
  /** Unique identifier for this token (derived from card UID, not raw UID) */
  tokenId: string;
  /** Public key from the token (for signature verification) - hex-encoded */
  publicKey: string;
  /** Enrollment timestamp */
  enrolledAt: number;
  /** Human-readable label set by user */
  label?: string;
  /**
   * Whether this token supports cryptographic signature verification.
   * - true: Boltcard/Satscard with ECDSA capability - requires signature verification
   * - false: Generic NFC token - presence-only verification (security limitation)
   * @default Inferred from tokenType: boltcard/satscard=true, generic-nfc=false
   */
  cryptoCapable: boolean;
}

/**
 * NFC availability detection result.
 */
export interface NfcAvailability {
  /** Whether Web NFC API is available in this browser */
  apiAvailable: boolean;
  /** Whether the device has NFC hardware */
  hardwareAvailable: boolean;
  /** Human-readable reason if unavailable */
  unavailableReason?: string;
  /** Platform detection (android, ios, desktop, unknown) */
  platform: "android" | "ios" | "desktop" | "unknown";
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Custom error for Noise protocol operations.
 */
export class NoiseProtocolError extends Error {
  constructor(
    message: string,
    public readonly code: NoiseErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "NoiseProtocolError";
  }
}

/**
 * Error codes for Noise protocol operations.
 */
export type NoiseErrorCode =
  | "KEY_GENERATION_FAILED"
  | "ECDH_FAILED"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "HKDF_FAILED"
  | "SESSION_NOT_FOUND"
  | "HANDSHAKE_INCOMPLETE"
  | "REKEY_REQUIRED"
  | "INVALID_NONCE"
  | "INVALID_CIPHERTEXT"
  | "VAULT_ACCESS_FAILED"
  | "NFC_UNAVAILABLE"
  | "NFC_AUTH_FAILED"
  | "CHAIN_STATE_CORRUPTED"
  | "INVALID_KEY"
  | "KEY_DERIVATION_FAILED";

/**
 * Custom error for geo relay selection.
 */
export class GeoRelaySelectionError extends Error {
  constructor(
    message: string,
    public readonly geohash: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "GeoRelaySelectionError";
  }
}

// Message Envelope Types
// =============================================================================

/**
 * Encrypted message envelope for Noise-protected payloads.
 * Transported via NIP-59 gift-wrap or NIP-17 DM.
 */
export interface NoiseEnvelope {
  /** Envelope format version */
  version: number;
  /** Security tier used for encryption */
  securityTier: NoiseSecurityTier;
  /** Hex-encoded sender's ephemeral public key for this message */
  ephemeralPubkey: string;
  /** Base64-encoded ChaCha20-Poly1305 ciphertext + auth tag */
  ciphertext: string;
  /** Base64-encoded 12-byte nonce */
  nonce: string;
}

// =============================================================================
// Phase 5: Advanced Handshake Pattern Types
// =============================================================================

/**
 * Noise handshake patterns supported by Satnam.
 * - XX: Full mutual authentication (3-message), both parties initially unknown
 * - IK: Initiator knows responder's static key (2-message), faster when key is pre-shared
 * - NK: No authentication of initiator (2-message), responder's key is known
 *
 * XX is the default for geo-discovered contacts (maximum security).
 */
export type NoiseHandshakePattern = "XX" | "IK" | "NK";

/**
 * Handshake message direction indicator.
 */
export type HandshakeDirection = "initiator" | "responder";

/**
 * State machine for tracking handshake progress.
 * - XX: 3 messages (→e, ←e·ee·s·es, →s·se)
 * - IK: 2 messages (→e·es·s·ss, ←e·ee·se)
 * - NK: 2 messages (→e·es, ←e·ee)
 */
export interface NoiseHandshakeState {
  /** Handshake pattern in use */
  pattern: NoiseHandshakePattern;
  /** Our role in the handshake */
  role: HandshakeDirection;
  /** Current message index (0-based, -1 if not started) */
  messageIndex: number;
  /** Total messages required for this pattern */
  totalMessages: number;
  /** Whether handshake has successfully completed */
  complete: boolean;
  /** Error message if handshake failed */
  error?: string;
  /** Local ephemeral key pair (generated at handshake start) */
  localEphemeral?: NoiseKeyPair;
  /** Remote ephemeral public key (received during handshake) */
  remoteEphemeral?: Uint8Array;
  /** Local static key pair (for patterns requiring static key auth) */
  localStatic?: NoiseKeyPair;
  /** Remote static public key (received or pre-shared) */
  remoteStatic?: Uint8Array;
  /** Chaining key for key derivation */
  chainingKey?: Uint8Array;
  /** Handshake hash for transcript binding */
  handshakeHash?: Uint8Array;
}

/**
 * Configuration for a Noise session.
 */
export interface NoiseSessionConfig {
  /** Handshake pattern to use (default: XX) */
  handshakePattern: NoiseHandshakePattern;
  /** Security tier for the session */
  securityTier: NoiseSecurityTier;
  /** Number of messages before automatic rekey (default: 100) */
  rekeyAfterMessages?: number;
  /** Seconds before automatic rekey (default: 3600) */
  rekeyAfterSeconds?: number;
  /** Optional pre-shared remote static key (required for IK, NK patterns) */
  remoteStaticKey?: Uint8Array;
  /** Optional fallback to standard NIP-59 on handshake failure */
  allowFallback?: boolean;
}

/**
 * Default session configuration values.
 */
export const DEFAULT_NOISE_SESSION_CONFIG: Required<
  Omit<NoiseSessionConfig, "remoteStaticKey">
> = {
  handshakePattern: "XX",
  securityTier: "ephemeral-standard",
  rekeyAfterMessages: 100,
  rekeyAfterSeconds: 3600,
  allowFallback: true,
};

// =============================================================================
// Phase 5: Noise-over-Nostr Transport Types
// =============================================================================

/**
 * Transport message type for Noise payloads over Nostr.
 */
export type NoiseTransportMessageType = "handshake" | "transport" | "rekey";

/**
 * Noise transport message wrapped for Nostr delivery.
 * Sent as NIP-17 kind:14 with ["noise", "v1", pattern] tag.
 */
export interface NoiseTransportMessage {
  /** Message type */
  type: NoiseTransportMessageType;
  /** Session identifier (UUID) */
  sessionId: string;
  /** Handshake pattern (included in handshake messages) */
  pattern?: NoiseHandshakePattern;
  /** Message index within handshake (for handshake messages) */
  handshakeIndex?: number;
  /** Base64-encoded Noise payload (handshake or encrypted data) */
  payload: string;
  /** Timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * Parsed Nostr event containing a Noise message.
 */
export interface NoiseNostrEvent {
  /** Nostr event ID */
  eventId: string;
  /** Sender's Nostr pubkey (hex) */
  senderPubkey: string;
  /** Recipient's Nostr pubkey (hex) */
  recipientPubkey: string;
  /** Unwrapped Noise transport message */
  noiseMessage: NoiseTransportMessage;
  /** Original event creation timestamp */
  createdAt: number;
}

/**
 * Result of processing a Noise message.
 */
export interface NoiseMessageResult {
  /** Whether processing succeeded */
  success: boolean;
  /** Session ID (existing or newly created) */
  sessionId?: string;
  /** Event ID of the sent Nostr event (for send operations) */
  eventId?: string;
  /** Timestamp of the operation (ms since epoch) */
  timestamp?: number;
  /** Decrypted plaintext (for transport messages) */
  plaintext?: Uint8Array;
  /** Outgoing response message (for handshake messages) */
  response?: NoiseTransportMessage;
  /** Error message if processing failed */
  error?: string;
  /** Whether handshake completed with this message */
  handshakeComplete?: boolean;
}

/**
 * Subscription handle for incoming Noise messages.
 */
export interface NoiseSubscription {
  /** Unique subscription ID */
  subscriptionId: string;
  /** Peer npub being listened to */
  peerNpub: string;
  /** Unsubscribe function */
  unsubscribe: () => void;
}

/**
 * Callback for incoming Noise messages.
 */
export type NoiseMessageCallback = (
  event: NoiseNostrEvent,
  result: NoiseMessageResult
) => void;

// =============================================================================
// Phase 5: Hardware MFA Extended Types
// =============================================================================

/**
 * NFC challenge for token authentication.
 */
export interface NfcChallenge {
  /** Random 32-byte challenge (hex-encoded) */
  challenge: string;
  /** Challenge creation timestamp */
  createdAt: number;
  /** Challenge expiry (typically 60 seconds) */
  expiresAt: number;
}

/**
 * NFC token response to challenge.
 */
export interface NfcChallengeResponse {
  /** Token ID that signed the challenge */
  tokenId: string;
  /** Signature over the challenge (hex-encoded) */
  signature: string;
  /** Optional additional data from token */
  tokenData?: string;
}

/**
 * Result of NFC token enrollment.
 */
export interface NfcEnrollmentResult {
  /** Whether enrollment succeeded */
  success: boolean;
  /** Enrolled token metadata */
  token?: HardwareTokenMetadata;
  /** Error message if enrollment failed */
  error?: string;
}

/**
 * Result of NFC token verification.
 */
export interface NfcVerificationResult {
  /** Whether verification succeeded */
  success: boolean;
  /** Verified token ID */
  tokenId?: string;
  /** Error message if verification failed */
  error?: string;
  /** Whether user cancelled the NFC scan */
  cancelled?: boolean;
}

/**
 * Extended error codes for Phase 5 operations.
 */
export type NoiseErrorCodePhase5 =
  | NoiseErrorCode
  | "HANDSHAKE_TIMEOUT"
  | "HANDSHAKE_REJECTED"
  | "PATTERN_MISMATCH"
  | "MISSING_STATIC_KEY"
  | "TRANSPORT_FAILED"
  | "MESSAGE_REPLAY"
  | "NFC_TIMEOUT"
  | "NFC_CANCELLED"
  | "NFC_TOKEN_UNKNOWN"
  | "NFC_CHALLENGE_EXPIRED";

// =============================================================================
// NIP-PNS + Noise-FS Integration Types
// =============================================================================

/**
 * Security mode for PNS (Private Notes to Self) notes.
 * - "none": Standard NIP-PNS encryption (nsec-derived keys only)
 * - "noise-fs": Noise Protocol forward secrecy layer (inner encryption with ratcheting keys)
 *
 * When "noise-fs" is enabled, notes are protected against nsec compromise -
 * even if the user's nsec is stolen, previously encrypted notes remain secure.
 */
export type PnsSecurityMode = "none" | "noise-fs";

/**
 * Storage mode for the pns_fs_root secret.
 * - "local-only": Secret stored only in ClientSessionVault (maximum privacy)
 * - "relay-sync": Secret encrypted and stored on relays for cross-device sync
 */
export type PnsFsSecretStorageMode = "local-only" | "relay-sync";

/**
 * Ephemeral policy configuration for auto-expiring notes.
 * Notes with ephemeral policies are automatically deleted after TTL expires.
 */
export interface EphemeralPolicy {
  /** Whether this note is ephemeral (auto-expires) */
  isEphemeral: boolean;
  /** Time-to-live in seconds (e.g., 86400 for 24 hours, 604800 for 7 days) */
  ttlSeconds?: number;
  /** Absolute expiration timestamp (ms since epoch) - calculated from createdAt + ttl */
  expiresAt?: number;
  /** Whether to attempt relay deletion via kind 5 event on expiry */
  deleteFromRelays?: boolean;
}

/**
 * Predefined ephemeral TTL presets for user convenience.
 */
export const EPHEMERAL_TTL_PRESETS = {
  /** 24 hours */
  ONE_DAY: 86400,
  /** 7 days */
  ONE_WEEK: 604800,
  /** 30 days */
  ONE_MONTH: 2592000,
  /** 90 days */
  THREE_MONTHS: 7776000,
} as const;

/**
 * Predefined tag categories for PNS Note2Self organization.
 * Users can use these or any custom string tags.
 *
 * Categories:
 * - "important": High-priority notes requiring attention
 * - "personal": Private personal notes
 * - "software": Code, scripts, technical notes
 * - "hardware": Device specs, manuals, setup notes
 * - "graphics": Design assets, visual references
 * - "links": URL collections, bookmarks
 * - "quotations": Quotes, excerpts, citations
 */
export const PNS_PREDEFINED_TAGS = [
  "important",
  "personal",
  "software",
  "hardware",
  "graphics",
  "links",
  "quotations",
] as const;

/**
 * Type for predefined PNS tags.
 */
export type PnsPredefinedTag = (typeof PNS_PREDEFINED_TAGS)[number];

/**
 * Metadata associated with a PNS note.
 * Stored inside the encrypted envelope for privacy.
 *
 * NOTE: All timestamps are in milliseconds since epoch (Date.now() format).
 * This differs from Nostr event timestamps which use Unix seconds.
 */
/**
 * Encryption parameters for a PNS attachment.
 * Matches the DM attachment encryption format for consistency.
 */
export interface PnsAttachmentEncryption {
  /** Encryption algorithm (always AES-GCM) */
  algo: "AES-GCM";
  /** Base64-encoded 256-bit AES key */
  key: string;
  /** Base64-encoded 96-bit IV */
  iv: string;
}

/**
 * Blossom-encrypted attachment for PNS notes.
 *
 * Attachments are encrypted client-side with AES-256-GCM before upload.
 * The encryption keys are stored inside the PNS envelope (encrypted),
 * never exposed in relay logs or event tags.
 */
export interface PnsAttachment {
  /** Blossom URL to the encrypted blob */
  url: string;
  /** Original filename */
  fileName: string;
  /** MIME type of the original file */
  mimeType: string;
  /** Media type category for UI rendering */
  mediaType: "file" | "image" | "audio" | "video";
  /** File size in bytes (ciphertext size) */
  size: number;
  /** SHA-256 hash of the ciphertext (hex) for integrity verification */
  sha256: string;
  /** Encryption parameters for decryption */
  enc: PnsAttachmentEncryption;
  /** Optional alt text for accessibility */
  alt?: string;
}

export interface PnsNoteMetadata {
  /** Unique identifier for this note (used in 'd' tag for replaceable events) */
  noteId?: string;
  /**
   * User-defined tags for organization.
   * Can include predefined tags from PNS_PREDEFINED_TAGS or any custom strings.
   * @example ["important", "personal"] // predefined tags
   * @example ["finance", "2024"] // custom tags
   * @example ["software", "project-alpha"] // mixed
   */
  tags?: string[];
  /** Note title or summary (optional) */
  title?: string;
  /** Creation timestamp (ms since epoch) */
  createdAt: number;
  /** Last modification timestamp (ms since epoch) */
  updatedAt?: number;
  /** Whether note is marked as deleted locally */
  isDeleted?: boolean;
  /** Deletion timestamp if deleted (ms since epoch) */
  deletedAt?: number;
  /** Ephemeral policy if note has expiration */
  ephemeralPolicy?: EphemeralPolicy;
  /** Content type hint (e.g., "text/plain", "text/markdown", "application/json") */
  contentType?: string;
  /**
   * Optional Blossom-encrypted attachments.
   * Attachment metadata (including encryption keys) is stored inside the
   * encrypted PNS envelope, ensuring zero-knowledge privacy.
   */
  attachments?: PnsAttachment[];
}

/**
 * Noise-PNS envelope format for forward-secure private notes.
 *
 * This envelope is the `content` of the inner Nostr event (before NIP-44 v2 outer encryption).
 * It contains the Noise-encrypted note plaintext with forward secrecy guarantees.
 *
 * Encryption flow:
 * 1. User writes note plaintext
 * 2. NoisePnsManager derives note_key from ratcheting chain
 * 3. Plaintext + metadata encrypted with note_key → noise_ciphertext
 * 4. NoisePnsEnvelope built with fs_mode, note_epoch, ciphertext
 * 5. Envelope JSON becomes inner event content
 * 6. Inner event encrypted with NIP-44 v2 (pns_nip44_key) → outer kind 1080 event
 *
 * Decryption requires both:
 * - nsec (for outer NIP-44 layer)
 * - pns_fs_root (for inner Noise layer, stored in ClientSessionVault)
 */
export interface NoisePnsEnvelope {
  /** Envelope format version (currently 1) */
  version: 1;
  /** Security mode - always "noise-fs" for Noise-protected notes */
  fs_mode: "noise-fs";
  /** Note epoch/index in the ratcheting chain (used to derive note_key) */
  note_epoch: number;
  /** Base64-encoded ChaCha20-Poly1305 ciphertext (encrypted plaintext + metadata) */
  noise_ciphertext: string;
  /** Base64-encoded 12-byte nonce for ChaCha20-Poly1305 */
  noise_nonce: string;
  /** Security tier used for this note */
  security_tier: NoiseSecurityTier;
  /** Creation timestamp (ms since epoch) - also in metadata but exposed for filtering */
  created_at: number;
  /** Optional: Encrypted access control metadata (for future controlled sharing) */
  access_control?: NoisePnsAccessControl;
}

/**
 * Access control metadata for controlled sharing (Phase 2+).
 * Stored encrypted inside the envelope to prevent relay metadata leakage.
 */
export interface NoisePnsAccessControl {
  /** List of npubs that can access this note (hex-encoded) */
  sharedWith?: string[];
  /** Expiration timestamp for sharing (ms since epoch) */
  sharingExpiresAt?: number;
  /** Tag-based filter for what shared users can see */
  sharedTags?: string[];
}

/**
 * Deletion log entry for tracking ephemeral note cleanup.
 * Maintained locally to ensure notes are not re-displayed even if relay deletion fails.
 */
export interface PnsDeletionLogEntry {
  /** Nostr event ID of the deleted note */
  eventId: string;
  /** Note epoch at time of deletion (for chain state reference) */
  noteEpoch: number;
  /** Deletion timestamp (ms since epoch) */
  deletedAt: number;
  /** Whether kind 5 deletion was sent to relays */
  relayDeletionSent: boolean;
  /** Whether relay deletion was confirmed (if applicable) */
  relayDeletionConfirmed?: boolean;
  /** Reason for deletion */
  reason: "ephemeral_expired" | "user_deleted" | "migration";
}

/**
 * Configuration for PNS Noise-FS feature.
 */
export interface PnsNoiseConfig {
  /** Whether Noise-FS is enabled for new notes */
  enabled: boolean;
  /** Default security mode for new notes */
  defaultSecurityMode: PnsSecurityMode;
  /** Default security tier for Noise-FS notes */
  defaultSecurityTier: NoiseSecurityTier;
  /** Storage mode for pns_fs_root secret */
  secretStorageMode: PnsFsSecretStorageMode;
  /** Default TTL for ephemeral notes (seconds) */
  defaultEphemeralTtl: number;
  /** Whether hardware MFA is required for hardened tier */
  requireHardwareMfa: boolean;
  /** Whether to auto-migrate existing notes when enabling Noise-FS */
  autoMigrateExistingNotes: boolean;
}

/**
 * Default PNS Noise configuration.
 */
export const DEFAULT_PNS_NOISE_CONFIG: PnsNoiseConfig = {
  enabled: false,
  defaultSecurityMode: "none",
  defaultSecurityTier: "everlasting-standard",
  secretStorageMode: "local-only",
  defaultEphemeralTtl: EPHEMERAL_TTL_PRESETS.ONE_WEEK,
  requireHardwareMfa: false,
  autoMigrateExistingNotes: false,
};

/**
 * Result of a PNS note migration operation.
 */
export interface PnsMigrationResult {
  /** Total notes found for migration */
  totalNotes: number;
  /** Notes successfully migrated */
  migratedCount: number;
  /** Notes that failed migration */
  failedCount: number;
  /** Notes skipped (already Noise-FS protected) */
  skippedCount: number;
  /** Error details for failed notes */
  errors?: Array<{
    eventId: string;
    error: string;
  }>;
}

/**
 * Extended error codes for PNS Noise-FS operations.
 */
export type PnsNoiseErrorCode =
  | NoiseErrorCode
  | "PNS_NOT_INITIALIZED"
  | "PNS_ENVELOPE_PARSE_FAILED"
  | "PNS_ENVELOPE_VERSION_UNSUPPORTED"
  | "PNS_FS_SECRET_MISSING"
  | "PNS_FS_SECRET_CORRUPTED"
  | "PNS_MIGRATION_FAILED"
  | "PNS_DELETION_FAILED"
  | "PNS_RELAY_PUBLISH_FAILED"
  | "PNS_EPHEMERAL_EXPIRED"
  | "PNS_HARDWARE_MFA_REQUIRED";
