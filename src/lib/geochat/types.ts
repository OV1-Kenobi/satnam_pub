/**
 * Geochat Types - Geo Discovery, Live Messaging, Trust & Contacts
 *
 * TypeScript type definitions for:
 * - Phase 1: Read-only geo discovery
 * - Phase 2: Deterministic relay messaging
 * - Phase 3: Trust, contacts, private messaging, and Physical MFA verification
 *
 * Supports geohash-based room selection with privacy-first design.
 *
 * @module src/lib/geochat/types
 */

import type { Event as NostrEvent } from "nostr-tools";

/**
 * Geohash precision levels for human-readable display.
 * Maps geohash length to approximate geographic scope.
 */
export type GeoPrecision = "region" | "city" | "neighborhood" | "block";

/**
 * Source of geohash selection.
 */
export type GeohashSource = "manual" | "browser_geolocation" | "search";

/**
 * Represents a user's geo-room selection.
 */
export interface GeoRoomSelection {
  /** The geohash string (1-12 characters) */
  geohash: string;
  /** Human-readable precision level */
  precision: GeoPrecision;
  /** How the geohash was obtained */
  source: GeohashSource;
  /** Timestamp when selection was made */
  selectedAt: number;
}

/**
 * State for geo-room discovery UI.
 */
export interface GeoDiscoveryState {
  /** Current geo-room selection (undefined if none) */
  currentSelection?: GeoRoomSelection;
  /** Whether user has consented to geo-room discovery */
  hasConsented: boolean;
  /** Whether geolocation is in progress */
  isLocating: boolean;
  /** Error message if any */
  error?: string;
}

/**
 * Preview information for a geo-room.
 * Used in Phase 1 for display-only; no live subscriptions.
 */
export interface GeoRoomPreview {
  /** The geohash for this room */
  geohash: string;
  /** Human-readable precision level */
  precision: GeoPrecision;
  /** Approximate radius in kilometers */
  radiusKm: number;
  /** Human-readable radius description */
  radiusDescription: string;
  /** Relays that would be used for this geo-room */
  relays: GeoRoomRelayPreview[];
}

/**
 * Relay preview information (read-only, no connection).
 */
export interface GeoRoomRelayPreview {
  /** Relay URL (wss://) */
  url: string;
  /** Trust level from Phase 0 registry */
  trustLevel: "public" | "self-hosted";
  /** Distance from geohash center in km (if available) */
  distanceKm?: number;
  /** ISO country code (if available) */
  countryCode?: string;
}

/**
 * Consent status for geo-room discovery.
 */
export interface GeoConsentStatus {
  /** Whether user has given consent */
  consented: boolean;
  /** Timestamp when consent was given (ms since epoch) */
  consentedAt?: number;
  /** Version of consent terms accepted */
  consentVersion?: string;
}

/**
 * Error codes for geo-room operations.
 */
export type GeoErrorCode =
  | "INVALID_GEOHASH"
  | "GEOLOCATION_DENIED"
  | "GEOLOCATION_UNAVAILABLE"
  | "GEOLOCATION_TIMEOUT"
  | "NO_CONSENT"
  | "FEATURE_DISABLED";

/**
 * Structured error for geo-room operations.
 */
export class GeoDiscoveryError extends Error {
  constructor(public readonly code: GeoErrorCode, message: string) {
    super(message);
    this.name = "GeoDiscoveryError";
  }
}

/**
 * Constants for geohash precision mapping.
 */
export const GEOHASH_PRECISION_MAP: Record<
  number,
  { precision: GeoPrecision; radiusKm: number; description: string }
> = {
  1: {
    precision: "region",
    radiusKm: 2500,
    description: "~2500km (continent)",
  },
  2: {
    precision: "region",
    radiusKm: 630,
    description: "~630km (large region)",
  },
  3: { precision: "city", radiusKm: 78, description: "~78km (metro area)" },
  4: { precision: "city", radiusKm: 20, description: "~20km (city)" },
  5: {
    precision: "neighborhood",
    radiusKm: 2.4,
    description: "~2.4km (district)",
  },
  6: {
    precision: "neighborhood",
    radiusKm: 0.61,
    description: "~610m (neighborhood)",
  },
  7: { precision: "block", radiusKm: 0.076, description: "~76m (block)" },
  8: { precision: "block", radiusKm: 0.019, description: "~19m (building)" },
};

/**
 * Consent storage key for localStorage.
 */
export const GEO_CONSENT_STORAGE_KEY = "SATNAM_GEO_CONSENT";

/**
 * Current version of consent terms.
 */
export const GEO_CONSENT_VERSION = "1.0.0";

// =============================================================================
// Phase 2: Deterministic Relay Messaging Types
// =============================================================================

/**
 * Error kinds for geo-room operations (Phase 2).
 * Used for typed error handling and user-friendly message mapping.
 */
export type GeoRoomErrorKind =
  | "no_relays_available"
  | "invalid_geohash"
  | "registry_unavailable"
  | "publish_failed"
  | "subscription_failed";

/**
 * Structured error for geo-room service operations (Phase 2).
 * Extends Error with typed kind for UI error mapping.
 */
export class GeoRoomError extends Error {
  public readonly kind: GeoRoomErrorKind;
  public readonly geohash?: string;
  public readonly cause?: unknown;

  constructor(
    kind: GeoRoomErrorKind,
    message: string,
    options?: { geohash?: string; cause?: unknown }
  ) {
    super(message);
    this.name = "GeoRoomError";
    this.kind = kind;
    this.geohash = options?.geohash;
    this.cause = options?.cause;
  }
}

/**
 * Subscription handle for geo-room connections (Phase 2).
 * Returned by subscribeToGeoRoom() for lifecycle management.
 */
export interface GeoRoomSubscription {
  /** Clean up underlying CEPS subscriptions; MUST be called on unmount. */
  unsubscribe(): void;
  /** Migrate this subscription to a new geohash by reselection + resubscribe. */
  updateGeohash(newGeohash: string): Promise<void>;
  /** Get the current active geohash */
  readonly activeGeohash: string;
  /** Whether the subscription is currently active */
  readonly isActive: boolean;
}

/**
 * Parameters for subscribing to a geo-room (Phase 2).
 */
export interface SubscribeToGeoRoomParams {
  /** The geohash to subscribe to (1-12 characters) */
  geohash: string;
  /** Callback invoked when a new event is received */
  onEvent: (event: NostrEvent) => void;
  /** Optional callback for terminal errors */
  onError?: (error: GeoRoomError) => void;
  /** Optional callback when subscription is established */
  onConnect?: () => void;
  /** Optional callback when end-of-stored-events is received */
  onEose?: () => void;
}

/**
 * Parameters for publishing a message to a geo-room (Phase 2).
 */
export interface PublishGeoRoomMessageParams {
  /** The geohash channel to publish to */
  geohash: string;
  /** Message content */
  content: string;
  /** Author's public key (hex format) */
  authorPubkey: string;
}

/**
 * Result of publishing a geo-room message (Phase 2).
 */
export interface PublishGeoRoomMessageResult {
  /** Event ID of the published message */
  eventId: string;
  /** Whether fallback relays were used */
  usedFallbackRelays: boolean;
  /** Relays the message was published to */
  relays: string[];
}

/**
 * Configuration for geo-room service (Phase 2).
 */
export interface GeoRoomServiceConfig {
  /** Maximum number of relays to select per geo-room (default: 3) */
  maxRelaysPerGeoRoom: number;
  /** Minimum health score for relay selection (default: 0.5) */
  minHealthScore: number;
  /** Nostr event kind for geo-room messages (default: 1 = short text note) */
  eventKind: number;
}

/**
 * Default configuration for geo-room service.
 */
export const DEFAULT_GEO_ROOM_CONFIG: GeoRoomServiceConfig = {
  maxRelaysPerGeoRoom: 3,
  minHealthScore: 0.5,
  eventKind: 1,
};

/**
 * State for the useGeoRoom hook (Phase 2).
 */
export interface GeoRoomState {
  /** Currently active geohash (null if not connected) */
  activeGeohash: string | null;
  /** Whether currently connecting */
  isConnecting: boolean;
  /** Whether connected and receiving events */
  isConnected: boolean;
  /** Received messages */
  messages: NostrEvent[];
  /** Current error (null if none) */
  error: GeoRoomError | null;
  /** Relays currently in use */
  activeRelays: string[];
}

/**
 * Actions for the useGeoRoom hook (Phase 2).
 */
export interface GeoRoomActions {
  /** Connect to a geo-room */
  connect: (geohash: string) => Promise<void>;
  /** Disconnect from current geo-room */
  disconnect: () => void;
  /** Send a message to the current geo-room */
  sendMessage: (content: string) => Promise<PublishGeoRoomMessageResult>;
  /** Clear error state */
  clearError: () => void;
  /** Clear message history */
  clearMessages: () => void;
}

// =============================================================================
// Phase 3: Trust, Contacts, and Private Messaging Types
// =============================================================================

/**
 * Context for contacts added from geo-room messages.
 * Stores origin information for trust weighting.
 */
export interface GeoContactContext {
  /** Truncated origin geohash where contact was encountered (max 4 chars, ~20km) */
  originGeohash: string;
  /** Timestamp when last seen in geo-room */
  lastSeenAt: Date;
  /** Nostr event ID of the message that initiated contact */
  messageId: string;
}

/**
 * Action types for geo-room contact reputation logging.
 */
export type GeoRoomContactActionType =
  | "geo_contact_added"
  | "geo_contact_dm_started"
  | "contact_verified_via_physical_mfa";

/**
 * Reputation action for geo-room contact events.
 */
export interface GeoRoomContactAction {
  /** Action type for trust scoring */
  actionType: GeoRoomContactActionType;
  /** Subject npub (may be ephemeral or persistent) */
  subjectNpub: string;
  /** Truncated origin geohash (max 4 chars for privacy) */
  originGeohash?: string;
  /** Timestamp of the action */
  timestamp: Date;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Physical MFA Attestation Types (Name Tag Reading Ritual)
// =============================================================================

/**
 * Scope for PhysicalMFAAttestation storage and sharing.
 * - local_only: Stored only in user's encrypted vault (mandatory)
 * - shared_dm: Additionally shared via NIP-59 giftwrap in DM
 * - nostr_attestation: Additionally published as redacted Nostr event (future, requires dual consent)
 */
export type PhysicalMFAAttestationScope =
  | "local_only"
  | "shared_dm"
  | "nostr_attestation";

/**
 * Physical MFA attestation record from the Name Tag Reading Ritual.
 * Proves two parties met in person and mutually verified identity.
 */
export interface PhysicalMFAAttestation {
  /** Local UUID or Nostr event ID that uniquely identifies this attestation */
  attestationId: string;
  /** Persistent npub of the user performing verification */
  subjectNpub: string;
  /** Persistent npub of the contact being verified */
  counterpartyNpub: string;
  /** When the Name Tag Reading Ritual was completed */
  createdAt: Date;
  /** Optional, truncated coarse geohash for context (max 4 chars, ~20km) */
  originGeohash?: string;
  /** Web Crypto–verifiable signature from subject's physical MFA device */
  subjectMfaSignature: string;
  /** Web Crypto–verifiable signature from counterparty's physical MFA device */
  counterpartyMfaSignature: string;
  /** Where this proof is stored or shared */
  scope: PhysicalMFAAttestationScope;
  /** Revocation timestamp if this attestation has been revoked */
  revokedAt?: Date;
}

/**
 * Shared challenge signed by both parties' MFA devices during the ritual.
 * Binds identities, time, optional coarse geohash, and a random nonce
 * to prevent replay and tie the proof to a specific meeting.
 *
 * Serialized using JCS (RFC 8785) for deterministic byte representation.
 */
export interface MFAChallenge {
  /** Persistent npub of the user initiating verification */
  subjectNpub: string;
  /** Persistent npub of the contact being verified */
  counterpartyNpub: string;
  /** When the challenge was issued (used for freshness check) */
  issuedAt: Date;
  /** Optional truncated geohash for context (max 4 chars) */
  originGeohash?: string;
  /** 32-character lowercase hex nonce (128 bits) for anti-replay */
  nonce: string;
}

/**
 * Parameters for verifying a contact with Physical MFA.
 */
export interface VerifyContactWithPhysicalMFAParams {
  /** The contact npub to verify (from the DM/contact context) */
  contactNpub: string;
  /** Challenge payload produced during the ritual */
  challenge: MFAChallenge;
  /** Signature from the local user's physical MFA device over the challenge */
  subjectMfaSignature: string;
  /** Signature from the contact's physical MFA device over the same challenge */
  counterpartyMfaSignature: string;
  /**
   * Hex-encoded P-256 uncompressed public key (65 bytes) from subject's MFA device.
   * This is the ECDSA P-256 key from the physical MFA device, NOT the Nostr secp256k1 key.
   */
  subjectMfaPublicKeyHex: string;
  /**
   * Hex-encoded P-256 uncompressed public key (65 bytes) from counterparty's MFA device.
   * This is the ECDSA P-256 key from the physical MFA device, NOT the Nostr secp256k1 key.
   */
  counterpartyMfaPublicKeyHex: string;
  /** Optional privacy-scoped storage preference (default: local_only) */
  scope?: PhysicalMFAAttestationScope;
}

/**
 * Result of physical MFA verification.
 */
export interface VerifyContactWithPhysicalMFAResult {
  /** Whether verification succeeded */
  verified: boolean;
  /** Final trust level label after applying this signal (e.g., "Verified") */
  trustLevel: string;
  /** The attestation record if verification succeeded */
  attestation?: PhysicalMFAAttestation;
}

// =============================================================================
// Add Contact from Geo Message Types
// =============================================================================

/**
 * Parameters for adding a contact from a geo-room message.
 */
export interface AddContactFromGeoMessageParams {
  /** Nostr npub of the contact (may be ephemeral geo-room key or persistent identity) */
  npub: string;
  /** Origin geohash where contact was encountered (will be truncated to 4 chars) */
  originGeohash: string;
  /** Optional display name for the contact */
  displayName?: string;
  /** If true, share user's persistent identity with this contact at creation time */
  revealIdentity?: boolean;
  /**
   * Identity information to include in identity revelation payload.
   * Required when revealIdentity is true.
   */
  identityInfo?: {
    /** User's persistent Nostr npub */
    npub: string;
    /** User's NIP-05 identifier (e.g., "alice@my.satnam.pub") */
    nip05?: string;
    /** Optional display name */
    displayName?: string;
    /** Optional profile picture URL */
    pictureUrl?: string;
    /** Selective trust summary (e.g., "Verified by 3 contacts", "Member since 2024") */
    trustSummary?: string;
  };
}

/**
 * Result of adding a contact from a geo-room message.
 */
export interface AddContactFromGeoMessageResult {
  /** Unique identifier for the created contact record */
  contactId: string;
  /** Initial trust level assigned to this contact */
  trustLevel: string;
  /** Whether identity was revealed to the contact */
  identityRevealed: boolean;
}

// =============================================================================
// Start Private Chat Types
// =============================================================================

/**
 * Parameters for starting a private chat from a geo-room.
 */
export interface StartPrivateChatParams {
  /** Nostr npub of the contact to start a DM with */
  npub: string;
  /** Optional origin geohash for context (used for trust weighting) */
  originGeohash?: string;
  /** If true, share identity immediately; if false/omitted, start in pseudonymous mode */
  revealIdentity?: boolean;
}

/**
 * Result of starting a private chat.
 */
export interface StartPrivateChatResult {
  /** Whether the DM session was successfully created or selected */
  success: boolean;
  /** DM session/conversation identifier */
  sessionId?: string;
  /** Whether identity was revealed in this DM */
  identityRevealed: boolean;
}

// =============================================================================
// Identity Sharing Payload Types
// =============================================================================

/**
 * Payload sent when a user reveals their identity to a contact.
 * Delivered as a NIP-59 giftwrapped Nostr event within the DM channel.
 * Fields are selectively included based on user preferences.
 */
export interface IdentitySharingPayload {
  /** User's persistent Nostr npub */
  npub: string;
  /** User's NIP-05 identifier (e.g., "alice@my.satnam.pub") */
  nip05?: string;
  /** Optional display name */
  displayName?: string;
  /** Optional profile picture URL */
  pictureUrl?: string;
  /** Selective trust summary (e.g., "Verified by 3 contacts", "Member since 2024") */
  trustSummary?: string;
  /** Timestamp when this payload was created */
  sharedAt: Date;
  /** Version identifier for forward compatibility */
  version: "1.0";
}

// =============================================================================
// Ephemeral Key Management Types (Phase 3)
// =============================================================================

/**
 * Ephemeral key record for geo-room anonymity.
 * Maps ephemeral pubkeys to persistent identity in the local vault.
 */
export interface EphemeralGeoKeyRecord {
  /** Ephemeral public key (hex) used in geo-room */
  ephemeralPubkey: string;
  /** First 8 hex chars of ephemeralPubkey for version identification */
  keyVersion: string;
  /** Geohash prefix this key is used for */
  geohashPrefix: string;
  /** When this key was created */
  createdAt: Date;
  /** When this key was rotated (null if still active) */
  rotatedAt?: Date;
  /** When this key expires and can no longer be used for decryption (7 days post-rotation) */
  validUntil: Date;
  /** Whether this is the currently active key for this geohash prefix */
  isActive: boolean;
}

/**
 * Constants for ephemeral key management.
 */
export const EPHEMERAL_KEY_CONSTANTS = {
  /** Key rotation interval in milliseconds (24 hours) */
  ROTATION_INTERVAL_MS: 24 * 60 * 60 * 1000,
  /** Key validity period after rotation in milliseconds (7 days) */
  POST_ROTATION_VALIDITY_MS: 7 * 24 * 60 * 60 * 1000,
  /** Length of key version identifier (first N hex chars of pubkey) */
  KEY_VERSION_LENGTH: 8,
} as const;

// =============================================================================
// Phase 3 Error Types
// =============================================================================

/**
 * Error kinds for Phase 3 operations.
 */
export type Phase3ErrorKind =
  | "contact_add_failed"
  | "identity_reveal_failed"
  | "mfa_verification_failed"
  | "mfa_challenge_stale"
  | "mfa_challenge_replay"
  | "mfa_signature_invalid"
  | "private_chat_failed"
  | "vault_access_failed"
  | "feature_disabled";

/**
 * Structured error for Phase 3 operations.
 */
export class Phase3Error extends Error {
  public readonly kind: Phase3ErrorKind;
  public readonly cause?: unknown;

  constructor(
    kind: Phase3ErrorKind,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "Phase3Error";
    this.kind = kind;
    this.cause = options?.cause;
  }
}
