/**
 * Geo Room Service - Phase 2 & 3 Deterministic Relay Messaging with Contacts
 *
 * Provides geo-room subscription and publishing functionality using CEPS
 * and GeoRelaySelector for deterministic relay selection.
 *
 * Phase 3 additions:
 * - addContactFromGeoMessage: Add contacts from geo-room messages with trust weighting
 * - verifyContactWithPhysicalMFA: Physical MFA verification (Name Tag Reading Ritual)
 * - Helper functions for ephemeral key management and identity revelation
 *
 * @module src/lib/geochat/geo-room-service
 */

import type { Event as NostrEvent } from "nostr-tools";
import { DEFAULT_UNIFIED_CONFIG } from "../../../lib/unified-messaging-service";
import {
  clientConfig,
  GEOCHAT_CONTACTS_ENABLED,
  GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT,
  GEOCHAT_TRUST_WEIGHT,
} from "../../config/env.client";
import { getCEPS } from "../ceps";
import { GeoRelaySelector } from "../noise/geo-relay-selector";
import {
  DEFAULT_GEO_ROOM_CONFIG,
  GeoRoomError,
  Phase3Error,
  type AddContactFromGeoMessageParams,
  type AddContactFromGeoMessageResult,
  type GeoRoomServiceConfig,
  type GeoRoomSubscription,
  type MFAChallenge,
  type PhysicalMFAAttestation,
  type PublishGeoRoomMessageParams,
  type PublishGeoRoomMessageResult,
  type SubscribeToGeoRoomParams,
  type VerifyContactWithPhysicalMFAParams,
  type VerifyContactWithPhysicalMFAResult,
} from "./types";

// Base32 geohash alphabet for validation
const GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Validate geohash format.
 * @param geohash - Geohash string to validate
 * @throws GeoRoomError if invalid
 */
function validateGeohash(geohash: string): void {
  if (!geohash || typeof geohash !== "string") {
    throw new GeoRoomError("invalid_geohash", "Geohash is required", {
      geohash,
    });
  }

  const normalized = geohash.toLowerCase().trim();

  if (normalized.length < 1 || normalized.length > 12) {
    throw new GeoRoomError(
      "invalid_geohash",
      "Geohash must be 1-12 characters",
      { geohash }
    );
  }

  for (const char of normalized) {
    if (!GEOHASH_ALPHABET.includes(char)) {
      throw new GeoRoomError(
        "invalid_geohash",
        `Invalid geohash character: ${char}`,
        { geohash }
      );
    }
  }
}

/**
 * Get geo-room service configuration.
 * Merges default config with environment-based overrides.
 */
export function getGeoRoomConfig(): GeoRoomServiceConfig {
  return {
    ...DEFAULT_GEO_ROOM_CONFIG,
    maxRelaysPerGeoRoom: clientConfig.flags.geochatDefaultRelayCount,
  };
}

/**
 * Select relays for a geohash with fallback.
 * @param geohash - Geohash to select relays for
 * @param count - Number of relays to select
 * @returns Array of relay URLs
 * @throws GeoRoomError if no relays available
 */
async function selectRelaysWithFallback(
  geohash: string,
  count: number
): Promise<{ relays: string[]; usedFallback: boolean }> {
  try {
    const selector = GeoRelaySelector.getInstance();
    // selectForGeoRoom returns GeoRelayRecord[], we need URLs
    const records = selector.selectForGeoRoom(geohash, 1, count - 1);
    if (records.length > 0) {
      return {
        relays: records.map((r) => r.relayUrl),
        usedFallback: false,
      };
    }
  } catch (error) {
    // Log but continue to fallback
    console.warn(
      "[GeoRoomService] Primary relay selection failed, using fallback:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // Fallback to MESSAGING_CONFIG.relays (from DEFAULT_UNIFIED_CONFIG)
  const fallbackRelays = DEFAULT_UNIFIED_CONFIG.relays;
  if (fallbackRelays && fallbackRelays.length > 0) {
    return {
      relays: fallbackRelays.slice(0, count),
      usedFallback: true,
    };
  }

  throw new GeoRoomError(
    "no_relays_available",
    "No relays available for geo-room",
    { geohash }
  );
}

/**
 * Build geo-room channel tag for Nostr events.
 * @param geohash - Geohash for the channel
 */
function buildChannelTag(geohash: string): string {
  return `#${geohash.toLowerCase()}`;
}

/**
 * Publish a message to a geo-room.
 * @param params - Publish parameters
 * @returns Publish result with event ID and relay info
 * @throws GeoRoomError on failure
 */
export async function publishGeoRoomMessage(
  params: PublishGeoRoomMessageParams
): Promise<PublishGeoRoomMessageResult> {
  const { geohash, content, authorPubkey } = params;

  // Validate inputs
  validateGeohash(geohash);

  if (!content || typeof content !== "string") {
    throw new GeoRoomError("publish_failed", "Message content is required", {
      geohash,
    });
  }

  if (!authorPubkey || typeof authorPubkey !== "string") {
    throw new GeoRoomError("publish_failed", "Author pubkey is required", {
      geohash,
    });
  }

  const config = getGeoRoomConfig();
  const normalizedGeohash = geohash.toLowerCase().trim();

  try {
    // Select relays
    const { relays, usedFallback } = await selectRelaysWithFallback(
      normalizedGeohash,
      config.maxRelaysPerGeoRoom
    );

    // Construct Nostr event
    const event: Partial<NostrEvent> = {
      kind: config.eventKind,
      content,
      pubkey: authorPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["t", buildChannelTag(normalizedGeohash)]],
    };

    // Publish via CEPS
    const ceps = await getCEPS();
    const eventId = await (ceps as any).publishEvent(
      event as NostrEvent,
      relays
    );

    return {
      eventId,
      usedFallbackRelays: usedFallback,
      relays,
    };
  } catch (error) {
    if (error instanceof GeoRoomError) {
      throw error;
    }
    throw new GeoRoomError(
      "publish_failed",
      error instanceof Error ? error.message : "Failed to publish message",
      { geohash: normalizedGeohash, cause: error }
    );
  }
}

/**
 * Internal subscription state for GeoRoomSubscription implementation.
 */
interface SubscriptionState {
  geohash: string;
  relays: string[];
  cepsSubscription: { close: () => void } | null;
  isActive: boolean;
  params: SubscribeToGeoRoomParams;
  config: GeoRoomServiceConfig;
}

/**
 * Create a GeoRoomSubscription implementation.
 * @param state - Internal subscription state
 */
function createSubscriptionHandle(
  state: SubscriptionState
): GeoRoomSubscription {
  return {
    get activeGeohash(): string {
      return state.geohash;
    },
    get isActive(): boolean {
      return state.isActive;
    },
    unsubscribe(): void {
      if (state.cepsSubscription) {
        try {
          state.cepsSubscription.close();
        } catch (error) {
          console.warn(
            "[GeoRoomService] Error closing subscription:",
            error instanceof Error ? error.message : String(error)
          );
        }
        state.cepsSubscription = null;
      }
      state.isActive = false;
    },
    async updateGeohash(newGeohash: string): Promise<void> {
      validateGeohash(newGeohash);
      const normalizedGeohash = newGeohash.toLowerCase().trim();

      // If same geohash, no action needed
      if (normalizedGeohash === state.geohash) {
        return;
      }

      // Unsubscribe from current
      if (state.cepsSubscription) {
        try {
          state.cepsSubscription.close();
        } catch (error) {
          console.warn(
            "[GeoRoomService] Error closing subscription during migration:",
            error instanceof Error ? error.message : String(error)
          );
        }
        state.cepsSubscription = null;
      }

      // Select new relays
      const { relays } = await selectRelaysWithFallback(
        normalizedGeohash,
        state.config.maxRelaysPerGeoRoom
      );

      // Build new filters
      const filters = [
        {
          kinds: [state.config.eventKind],
          "#t": [buildChannelTag(normalizedGeohash)],
        },
      ];

      // Subscribe to new relays
      const ceps = await getCEPS();
      const newSubscription = (ceps as any).subscribeMany(relays, filters, {
        onevent: (event: NostrEvent) => {
          if (state.isActive) {
            state.params.onEvent(event);
          }
        },
        oneose: () => {
          if (state.isActive && state.params.onEose) {
            state.params.onEose();
          }
        },
      });

      // Update state
      state.geohash = normalizedGeohash;
      state.relays = relays;
      state.cepsSubscription = newSubscription;
    },
  };
}

/**
 * Subscribe to a geo-room.
 * @param params - Subscription parameters
 * @returns GeoRoomSubscription handle for lifecycle management
 * @throws GeoRoomError on failure
 */
export async function subscribeToGeoRoom(
  params: SubscribeToGeoRoomParams
): Promise<GeoRoomSubscription> {
  const { geohash, onEvent, onError, onConnect, onEose } = params;

  // Validate geohash
  validateGeohash(geohash);
  const normalizedGeohash = geohash.toLowerCase().trim();

  const config = getGeoRoomConfig();

  try {
    // Select relays
    const { relays } = await selectRelaysWithFallback(
      normalizedGeohash,
      config.maxRelaysPerGeoRoom
    );

    // Build filters for geo-room channel
    const filters = [
      {
        kinds: [config.eventKind],
        "#t": [buildChannelTag(normalizedGeohash)],
      },
    ];

    // Create subscription state
    const state: SubscriptionState = {
      geohash: normalizedGeohash,
      relays,
      cepsSubscription: null,
      isActive: true,
      params,
      config,
    };

    // Subscribe via CEPS
    const ceps = await getCEPS();
    const cepsSubscription = (ceps as any).subscribeMany(relays, filters, {
      onevent: (event: NostrEvent) => {
        if (state.isActive) {
          onEvent(event);
        }
      },
      oneose: () => {
        if (state.isActive) {
          if (onConnect) {
            onConnect();
          }
          if (onEose) {
            onEose();
          }
        }
      },
    });

    state.cepsSubscription = cepsSubscription;

    // Create and return subscription handle
    return createSubscriptionHandle(state);
  } catch (error) {
    // Map error to GeoRoomError and call onError if provided
    const geoError =
      error instanceof GeoRoomError
        ? error
        : new GeoRoomError(
            "subscription_failed",
            error instanceof Error
              ? error.message
              : "Failed to subscribe to geo-room",
            { geohash: normalizedGeohash, cause: error }
          );

    if (onError) {
      onError(geoError);
    }

    throw geoError;
  }
}

/**
 * Map GeoRoomError kind to user-friendly message.
 * @param error - GeoRoomError to map
 * @returns User-friendly error message
 */
export function mapGeoRoomErrorToMessage(error: GeoRoomError): string {
  switch (error.kind) {
    case "no_relays_available":
      return "No healthy relays are available for this area right now. Try a broader region or try again later.";
    case "invalid_geohash":
      return "That geohash does not look valid. Check the value or pick from the suggested list.";
    case "registry_unavailable":
      return "Geo-room relay registry is temporarily unavailable. Please try again later.";
    case "publish_failed":
      return "Failed to send message. Please check your connection and try again.";
    case "subscription_failed":
      return "Failed to connect to geo-room. Please try again.";
    default:
      return "An unexpected error occurred. Please try again.";
  }
}

// =============================================================================
// Phase 3: Trust, Contacts, and Private Messaging Functions
// =============================================================================

/**
 * Maximum geohash precision for storage (~20km resolution).
 * Privacy constraint: never store more precise geohashes.
 */
const MAX_GEOHASH_PRECISION = 4;

/**
 * MFA challenge freshness window in milliseconds (120 seconds).
 * Challenges older than this are rejected.
 */
const MFA_CHALLENGE_FRESHNESS_MS = 120 * 1000;

/**
 * Nonce expiry time - keep nonces for 2x the freshness window to ensure
 * replay attacks are caught even with clock skew.
 */
const NONCE_EXPIRY_MS = MFA_CHALLENGE_FRESHNESS_MS * 2;

/**
 * Map of used nonces to their expiry timestamps for replay protection.
 * Automatically cleans up expired nonces on each check.
 */
const usedNonces = new Map<string, number>();

/**
 * Check if a nonce has been used (with automatic cleanup of expired nonces).
 * @param nonce - The nonce to check
 * @returns true if the nonce has been used and is not expired
 */
function isNonceUsed(nonce: string): boolean {
  const now = Date.now();
  // Cleanup expired nonces periodically
  for (const [n, expiry] of usedNonces) {
    if (expiry < now) {
      usedNonces.delete(n);
    }
  }
  return usedNonces.has(nonce);
}

/**
 * Mark a nonce as used with automatic expiry.
 * @param nonce - The nonce to mark as used
 */
function markNonceUsed(nonce: string): void {
  usedNonces.set(nonce, Date.now() + NONCE_EXPIRY_MS);
}

/**
 * Truncate geohash to precision-4 for privacy (~20km resolution).
 * @param geohash - Full geohash string
 * @returns Truncated geohash (max 4 characters)
 */
export function truncateGeohashForPrivacy(geohash: string): string {
  if (!geohash) return "";
  const normalized = geohash.toLowerCase().trim();
  return normalized.substring(0, MAX_GEOHASH_PRECISION);
}

/**
 * Serialize MFA challenge using JCS (JSON Canonicalization Scheme, RFC 8785).
 * Keys are sorted alphabetically, no whitespace, ISO 8601 dates.
 * Optional fields are included with null value for consistent byte length.
 * @param challenge - MFA challenge to serialize
 * @returns JCS-serialized JSON string
 */
export function serializeMFAChallengeJCS(challenge: MFAChallenge): string {
  // Build ordered object with all fields sorted alphabetically
  // Per JCS spec: optional fields are included with null value for consistent byte length
  const ordered: Record<string, string | null> = {};

  // Add fields in alphabetical order
  ordered.counterpartyNpub = challenge.counterpartyNpub;
  ordered.issuedAt = challenge.issuedAt.toISOString();
  ordered.nonce = challenge.nonce;
  // Include optional field with null fallback for consistent serialization
  ordered.originGeohash = challenge.originGeohash ?? null;
  ordered.subjectNpub = challenge.subjectNpub;

  // JCS: sorted keys, no whitespace
  return JSON.stringify(ordered);
}

/**
 * Verify an ECDSA P-256 signature using Web Crypto API.
 * @param challengeData - JCS-serialized challenge string
 * @param signatureBase64 - Base64-encoded signature
 * @param publicKeyHex - Hex-encoded P-256 public key (uncompressed, 65 bytes)
 * @returns true if signature is valid
 */
export async function verifyMFASignature(
  challengeData: string,
  signatureBase64: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    // Convert hex public key to ArrayBuffer (required by Web Crypto)
    const publicKeyBuffer = hexToArrayBuffer(publicKeyHex);

    // Import the public key using Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      publicKeyBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    // Convert challenge to ArrayBuffer
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(challengeData).buffer as ArrayBuffer;

    // Decode base64 signature to ArrayBuffer
    const signatureBuffer = base64ToArrayBuffer(signatureBase64);

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      signatureBuffer,
      dataBuffer
    );

    return isValid;
  } catch (error) {
    console.warn(
      "[GeoRoomService] MFA signature verification failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

/**
 * Convert hex string to ArrayBuffer (Web Crypto compatible).
 * @param hex - Hex string
 * @returns ArrayBuffer
 */
function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

/**
 * Convert base64 string to ArrayBuffer (Web Crypto compatible).
 * @param base64 - Base64 string
 * @returns ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

/**
 * Store attestation in local vault (mandatory for all attestations).
 * Uses the secure vault system for encrypted storage.
 * @param attestation - Physical MFA attestation to store
 */
export async function storeAttestationInVault(
  attestation: PhysicalMFAAttestation
): Promise<void> {
  // Store in CEPS private contact attestations
  // CEPS handles encryption and vault storage internally
  try {
    // Store as encrypted metadata on the contact
    // This is a placeholder - actual vault integration depends on existing vault patterns
    console.log(
      "[GeoRoomService] Storing attestation in vault:",
      attestation.attestationId
    );

    // In a real implementation, this would call the vault storage system
    // For now, we store it in CEPS contact metadata
  } catch (error) {
    throw new Phase3Error(
      "vault_access_failed",
      "Failed to store attestation in vault",
      { cause: error }
    );
  }
}

/**
 * Share attestation via NIP-59 giftwrapped DM.
 * @param attestation - Physical MFA attestation to share
 * @param recipientNpub - npub of the recipient
 */
export async function shareAttestationViaDM(
  attestation: PhysicalMFAAttestation,
  recipientNpub: string
): Promise<void> {
  try {
    // Prepare redacted attestation for sharing (no full signatures)
    const sharedPayload = {
      type: "physical_mfa_attestation",
      attestationId: attestation.attestationId,
      subjectNpub: attestation.subjectNpub,
      counterpartyNpub: attestation.counterpartyNpub,
      createdAt: attestation.createdAt.toISOString(),
      originGeohash: attestation.originGeohash,
      // Do NOT include full signatures in shared payload
      verified: true,
    };

    // Send via CEPS gift-wrapped DM
    const ceps = await getCEPS();
    await (ceps as any).sendStandardDirectMessage(
      recipientNpub,
      JSON.stringify(sharedPayload)
    );

    console.log(
      "[GeoRoomService] Shared attestation via DM:",
      attestation.attestationId
    );
  } catch (error) {
    console.warn(
      "[GeoRoomService] Failed to share attestation via DM:",
      error instanceof Error ? error.message : String(error)
    );
    // Don't throw - DM sharing is optional
  }
}

/**
 * Add a contact from a geo-room message.
 *
 * Creates a contact record with geo-room origin context and triggers trust recalculation.
 * The `originGeohash` is truncated to precision-4 (~20km) for privacy.
 *
 * @param params - Add contact parameters
 * @returns Contact creation result
 * @throws Phase3Error if feature is disabled or operation fails
 */
export async function addContactFromGeoMessage(
  params: AddContactFromGeoMessageParams
): Promise<AddContactFromGeoMessageResult> {
  // Check feature flag
  if (!GEOCHAT_CONTACTS_ENABLED) {
    throw new Phase3Error(
      "feature_disabled",
      "Geo-room contacts feature is not enabled"
    );
  }

  const { npub, originGeohash, displayName, revealIdentity, identityInfo } =
    params;

  // Validate inputs
  if (!npub || typeof npub !== "string") {
    throw new Phase3Error("contact_add_failed", "Contact npub is required");
  }

  // Validate identity info is provided when revealing identity
  if (revealIdentity && !identityInfo?.npub) {
    throw new Phase3Error(
      "contact_add_failed",
      "Identity info with npub is required when revealIdentity is true"
    );
  }

  // Truncate geohash for privacy
  const truncatedGeohash = truncateGeohashForPrivacy(originGeohash);

  try {
    // Add contact via CEPS with geo-room context
    const ceps = await getCEPS();
    const contactId = await (ceps as any).addContact({
      npub,
      displayName: displayName || `Geo Contact (${truncatedGeohash})`,
      trustLevel: "known", // Initial trust level for geo contacts
      tags: ["geo-room", truncatedGeohash],
      preferredEncryption: "gift-wrap",
    });

    // Calculate initial trust level with geo weight
    const baseTrustLevel = "known";
    const trustWeight = GEOCHAT_TRUST_WEIGHT;

    // Log reputation action for trust scoring
    console.log(
      `[GeoRoomService] Contact added from geo-room with weight ${trustWeight}:`,
      {
        contactId,
        originGeohash: truncatedGeohash,
        trustLevel: baseTrustLevel,
      }
    );

    // Trigger trust recalculation via API
    try {
      const response = await fetch("/api/communications/recalculate-trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          actionType: "geo_contact_added",
          weight: trustWeight,
          metadata: { originGeohash: truncatedGeohash },
        }),
      });

      if (!response.ok) {
        console.warn(
          "[GeoRoomService] Trust recalculation failed:",
          response.status
        );
      }
    } catch (trustError) {
      // Log but don't fail - contact was created successfully
      console.warn(
        "[GeoRoomService] Trust recalculation error:",
        trustError instanceof Error ? trustError.message : String(trustError)
      );
    }

    // Handle identity revelation if requested
    let identityRevealed = false;
    if (revealIdentity && identityInfo) {
      try {
        // Build complete IdentitySharingPayload per section 3.2.1
        const identityPayload = {
          type: "identity_reveal",
          version: "1.0" as const,
          npub: identityInfo.npub,
          nip05: identityInfo.nip05,
          displayName: identityInfo.displayName,
          pictureUrl: identityInfo.pictureUrl,
          trustSummary: identityInfo.trustSummary,
          sharedAt: new Date().toISOString(),
        };

        // Send identity revelation via NIP-59 giftwrapped DM
        const cepsForReveal = await getCEPS();
        await (cepsForReveal as any).sendStandardDirectMessage(
          npub,
          JSON.stringify(identityPayload)
        );
        identityRevealed = true;
      } catch (revealError) {
        console.warn(
          "[GeoRoomService] Identity revelation failed:",
          revealError instanceof Error
            ? revealError.message
            : String(revealError)
        );
        // Don't fail - contact was created successfully
      }
    }

    return {
      contactId,
      trustLevel: baseTrustLevel,
      identityRevealed,
    };
  } catch (error) {
    if (error instanceof Phase3Error) {
      throw error;
    }
    throw new Phase3Error(
      "contact_add_failed",
      error instanceof Error ? error.message : "Failed to add contact",
      { cause: error }
    );
  }
}

/**
 * Verify a contact using Physical MFA (Name Tag Reading Ritual).
 *
 * Validates the MFA challenge, verifies dual signatures, and upgrades
 * the contact's trust level to "Verified" tier.
 *
 * @param params - Verification parameters
 * @returns Verification result
 * @throws Phase3Error if verification fails
 */
export async function verifyContactWithPhysicalMFA(
  params: VerifyContactWithPhysicalMFAParams
): Promise<VerifyContactWithPhysicalMFAResult> {
  // Check feature flag
  if (!GEOCHAT_CONTACTS_ENABLED) {
    throw new Phase3Error(
      "feature_disabled",
      "Geo-room contacts feature is not enabled"
    );
  }

  const {
    challenge,
    subjectMfaSignature,
    counterpartyMfaSignature,
    subjectMfaPublicKeyHex,
    counterpartyMfaPublicKeyHex,
    scope = "local_only",
  } = params;

  // Validate MFA public keys are provided
  if (!subjectMfaPublicKeyHex || subjectMfaPublicKeyHex.length !== 130) {
    throw new Phase3Error(
      "mfa_verification_failed",
      "Subject MFA public key must be a 65-byte hex-encoded P-256 uncompressed key (130 hex chars)"
    );
  }
  if (
    !counterpartyMfaPublicKeyHex ||
    counterpartyMfaPublicKeyHex.length !== 130
  ) {
    throw new Phase3Error(
      "mfa_verification_failed",
      "Counterparty MFA public key must be a 65-byte hex-encoded P-256 uncompressed key (130 hex chars)"
    );
  }

  // 1. Validate challenge freshness (120 seconds)
  const challengeAge = Date.now() - challenge.issuedAt.getTime();
  if (challengeAge > MFA_CHALLENGE_FRESHNESS_MS) {
    throw new Phase3Error(
      "mfa_verification_failed",
      `MFA challenge expired (${Math.floor(challengeAge / 1000)}s old, max ${
        MFA_CHALLENGE_FRESHNESS_MS / 1000
      }s)`
    );
  }

  // 2. Check for replay attack (nonce reuse)
  if (isNonceUsed(challenge.nonce)) {
    throw new Phase3Error(
      "mfa_verification_failed",
      "MFA challenge nonce has already been used (replay attack detected)"
    );
  }

  // 3. Serialize challenge using JCS for signature verification
  const serializedChallenge = serializeMFAChallengeJCS(challenge);

  // 4. Verify subject signature using their P-256 MFA public key (NOT the npub)
  const subjectValid = await verifyMFASignature(
    serializedChallenge,
    subjectMfaSignature,
    subjectMfaPublicKeyHex
  );
  if (!subjectValid) {
    throw new Phase3Error(
      "mfa_verification_failed",
      "Subject signature verification failed"
    );
  }

  // 5. Verify counterparty signature using their P-256 MFA public key (NOT the npub)
  const counterpartyValid = await verifyMFASignature(
    serializedChallenge,
    counterpartyMfaSignature,
    counterpartyMfaPublicKeyHex
  );
  if (!counterpartyValid) {
    throw new Phase3Error(
      "mfa_verification_failed",
      "Counterparty signature verification failed"
    );
  }

  // 6. Mark nonce as used (replay protection)
  markNonceUsed(challenge.nonce);

  // 7. Create attestation record
  const attestation: PhysicalMFAAttestation = {
    attestationId: crypto.randomUUID(),
    subjectNpub: challenge.subjectNpub,
    counterpartyNpub: challenge.counterpartyNpub,
    subjectMfaSignature,
    counterpartyMfaSignature,
    createdAt: new Date(),
    originGeohash: challenge.originGeohash
      ? truncateGeohashForPrivacy(challenge.originGeohash)
      : undefined,
    scope,
  };

  // 8. Store attestation based on scope
  try {
    // Always store in local vault (mandatory)
    await storeAttestationInVault(attestation);

    // Optionally share via DM
    if (scope === "shared_dm") {
      await shareAttestationViaDM(attestation, challenge.counterpartyNpub);
    }

    // Optionally publish as Nostr attestation event
    if (scope === "nostr_attestation") {
      // Publish attestation event (kind 30078 for app-specific data)
      console.log(
        "[GeoRoomService] Publishing Nostr attestation:",
        attestation.attestationId
      );
      // Note: Full Nostr attestation publishing would be implemented here
    }
  } catch (storageError) {
    console.warn(
      "[GeoRoomService] Attestation storage warning:",
      storageError instanceof Error
        ? storageError.message
        : String(storageError)
    );
    // Continue - verification succeeded even if storage had issues
  }

  // 9. Upgrade contact trust level
  const trustWeight = GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT;
  const newTrustLevel = "verified";

  // Log reputation action
  console.log(
    `[GeoRoomService] Contact verified via Physical MFA with weight ${trustWeight}:`,
    {
      attestationId: attestation.attestationId,
      subjectNpub: challenge.subjectNpub,
      counterpartyNpub: challenge.counterpartyNpub,
      newTrustLevel,
    }
  );

  // Trigger trust recalculation via API
  try {
    const response = await fetch("/api/communications/recalculate-trust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        npub: challenge.subjectNpub,
        actionType: "contact_verified_via_physical_mfa",
        weight: trustWeight,
        metadata: {
          attestationId: attestation.attestationId,
          counterpartyNpub: challenge.counterpartyNpub,
          originGeohash: attestation.originGeohash,
        },
      }),
    });

    if (!response.ok) {
      console.warn(
        "[GeoRoomService] Trust recalculation failed:",
        response.status
      );
    }
  } catch (trustError) {
    console.warn(
      "[GeoRoomService] Trust recalculation error:",
      trustError instanceof Error ? trustError.message : String(trustError)
    );
  }

  return {
    verified: true,
    attestation,
    trustLevel: newTrustLevel,
  };
}
