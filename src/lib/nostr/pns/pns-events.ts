/**
 * NIP-PNS Event Creation, Parsing, and Publishing Module
 *
 * Handles kind 1080 Private Notes to Self events with:
 * - NIP-44 v2 outer encryption layer (always applied)
 * - Optional Noise-FS inner encryption layer for forward secrecy
 * - CEPS integration for relay publishing
 *
 * Security:
 * - Two-layer encryption when securityMode === "noise-fs"
 * - Deterministic PNS keypair (separate from main nsec)
 * - Forward secrecy via Noise protocol ratcheting
 *
 * @module src/lib/nostr/pns/pns-events
 */

import { randomBytes } from "@noble/ciphers/webcrypto";
import type { Event as NostrEvent } from "nostr-tools";
import type {
  NoisePnsEnvelope,
  PnsSecurityMode,
  PnsNoteMetadata,
  NoiseSecurityTier,
} from "../../noise/types";
import { NoiseProtocolError } from "../../noise/types";
import {
  chaCha20Poly1305Encrypt,
  chaCha20Poly1305Decrypt,
  bytesToBase64,
  base64ToBytes,
  bytesToHex,
  secureZero,
} from "../../noise/primitives";

// =============================================================================
// Constants
// =============================================================================

/** NIP-PNS event kind */
export const PNS_EVENT_KIND = 1080;

/** Nonce size for ChaCha20-Poly1305 */
const NONCE_SIZE = 12;

/** Current envelope version */
const ENVELOPE_VERSION = 1;

// =============================================================================
// Types
// =============================================================================

/**
 * Result of publishing a PNS event via CEPS
 */
export interface PnsPublishResult {
  success: boolean;
  eventId?: string;
  relaysPublished?: string[];
  error?: string;
}

/**
 * Parsed PNS event content
 */
export interface ParsedPnsContent {
  content: string;
  metadata: PnsNoteMetadata;
}

/**
 * Unsigned PNS event ready for signing
 */
export interface UnsignedPnsEvent {
  kind: typeof PNS_EVENT_KIND;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
}

// =============================================================================
// Inner Envelope (Noise-FS) Functions
// =============================================================================

/**
 * Create a Noise-FS encrypted envelope for inner layer protection.
 *
 * This envelope provides forward secrecy by encrypting with a note-specific
 * key derived from the Noise ratcheting chain.
 *
 * @param content - Note plaintext content
 * @param metadata - Note metadata (tags, timestamps, etc.)
 * @param noiseKey - 32-byte note key from NoisePnsManager
 * @param noteEpoch - Note index in the ratcheting chain
 * @param securityTier - Security tier used
 * @returns Encrypted NoisePnsEnvelope
 * @throws NoiseProtocolError if encryption fails
 *
 * @example
 * ```typescript
 * const envelope = await createNoisePnsEnvelope(
 *   "My private note",
 *   { tags: ["tag1"], createdAt: Date.now() },
 *   noiseKey,
 *   noteEpoch,
 *   "everlasting-standard"
 * );
 * ```
 */
export async function createNoisePnsEnvelope(
  content: string,
  metadata: PnsNoteMetadata,
  noiseKey: Uint8Array,
  noteEpoch: number,
  securityTier: NoiseSecurityTier = "everlasting-standard"
): Promise<NoisePnsEnvelope> {
  if (!noiseKey || noiseKey.length !== 32) {
    throw new NoiseProtocolError(
      "Invalid noise key: expected 32 bytes",
      "INVALID_KEY"
    );
  }

  const nonce = randomBytes(NONCE_SIZE);
  const now = Date.now();

  // Prepare payload: content + metadata as JSON
  const payload = JSON.stringify({
    content,
    metadata: {
      ...metadata,
      createdAt: metadata.createdAt ?? now,
      updatedAt: metadata.updatedAt ?? now,
    },
  });

  const plaintextBytes = new TextEncoder().encode(payload);

  try {
    const ciphertext = await chaCha20Poly1305Encrypt(
      noiseKey,
      nonce,
      plaintextBytes
    );

    return {
      version: ENVELOPE_VERSION as 1,
      fs_mode: "noise-fs",
      note_epoch: noteEpoch,
      noise_ciphertext: bytesToBase64(ciphertext),
      noise_nonce: bytesToBase64(nonce),
      security_tier: securityTier,
      created_at: now,
    };
  } catch (error) {
    if (error instanceof NoiseProtocolError) {
      throw error;
    }
    throw new NoiseProtocolError(
      "Failed to create Noise-FS envelope",
      "ENCRYPTION_FAILED",
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Parse and decrypt a Noise-FS envelope.
 *
 * @param envelope - The NoisePnsEnvelope to decrypt
 * @param noiseKey - 32-byte note key from NoisePnsManager (for the note's epoch)
 * @returns Decrypted content and metadata
 * @throws NoiseProtocolError if decryption fails or envelope is invalid
 *
 * @example
 * ```typescript
 * const { content, metadata } = await parseNoisePnsEnvelope(envelope, noiseKey);
 * ```
 */
export async function parseNoisePnsEnvelope(
  envelope: NoisePnsEnvelope,
  noiseKey: Uint8Array
): Promise<ParsedPnsContent> {
  // Validate envelope structure
  if (!envelope || envelope.version !== 1 || envelope.fs_mode !== "noise-fs") {
    throw new NoiseProtocolError(
      "Invalid or unsupported Noise-PNS envelope",
      "DECRYPTION_FAILED"
    );
  }

  if (!noiseKey || noiseKey.length !== 32) {
    throw new NoiseProtocolError(
      "Invalid noise key: expected 32 bytes",
      "INVALID_KEY"
    );
  }

  let ciphertext: Uint8Array;
  let nonce: Uint8Array;

  try {
    ciphertext = base64ToBytes(envelope.noise_ciphertext);
    nonce = base64ToBytes(envelope.noise_nonce);
  } catch {
    throw new NoiseProtocolError(
      "Invalid base64 encoding in envelope",
      "DECRYPTION_FAILED"
    );
  }

  if (nonce.length !== NONCE_SIZE) {
    throw new NoiseProtocolError(
      `Invalid nonce size: expected ${NONCE_SIZE} bytes`,
      "DECRYPTION_FAILED"
    );
  }

  try {
    const plaintextBytes = await chaCha20Poly1305Decrypt(
      noiseKey,
      nonce,
      ciphertext
    );

    const payloadJson = new TextDecoder().decode(plaintextBytes);
    const payload = JSON.parse(payloadJson);

    if (typeof payload.content !== "string" || !payload.metadata) {
      throw new NoiseProtocolError(
        "Invalid envelope payload structure",
        "DECRYPTION_FAILED"
      );
    }

    return {
      content: payload.content,
      metadata: payload.metadata as PnsNoteMetadata,
    };
  } catch (error) {
    if (error instanceof NoiseProtocolError) {
      throw error;
    }
    throw new NoiseProtocolError(
      "Failed to decrypt Noise-FS envelope",
      "DECRYPTION_FAILED",
      error instanceof Error ? error : undefined
    );
  }
}

// =============================================================================
// NIP-44 Encryption Helpers
// =============================================================================

/**
 * Encrypt content using NIP-44 v2 for the outer layer.
 * Uses nostr-tools/nip44 for encryption with conversation key pattern.
 *
 * For PNS, we encrypt to ourselves (same pubkey for sender and recipient).
 *
 * @param content - Content to encrypt (plain text or stringified envelope)
 * @param privateKeyHex - PNS private key in hex format
 * @param publicKeyHex - PNS public key in hex format
 * @returns NIP-44 encrypted ciphertext
 * @throws Error if encryption fails
 */
export async function encryptNip44Pns(
  content: string,
  privateKeyHex: string,
  publicKeyHex: string
): Promise<string> {
  try {
    const nip44 = await import("nostr-tools/nip44");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyNip44 = nip44 as any;

    // Try v2 API with conversation key first (preferred)
    if (anyNip44?.v2?.utils?.getConversationKey && anyNip44?.v2?.encrypt) {
      const convKey = await anyNip44.v2.utils.getConversationKey(
        privateKeyHex,
        publicKeyHex
      );
      return await anyNip44.v2.encrypt(content, convKey);
    }

    // Fallback to direct encrypt signature if provided by the lib version
    if (anyNip44?.encrypt) {
      return await anyNip44.encrypt(privateKeyHex, publicKeyHex, content);
    }

    throw new Error("No compatible NIP-44 encryption API found");
  } catch (error) {
    throw new NoiseProtocolError(
      "NIP-44 encryption failed",
      "ENCRYPTION_FAILED",
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Decrypt content using NIP-44 v2 for the outer layer.
 * Uses nostr-tools/nip44 for decryption with conversation key pattern.
 *
 * @param ciphertext - NIP-44 encrypted content
 * @param privateKeyHex - PNS private key in hex format
 * @param publicKeyHex - PNS public key in hex format (sender = self)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails
 */
export async function decryptNip44Pns(
  ciphertext: string,
  privateKeyHex: string,
  publicKeyHex: string
): Promise<string> {
  try {
    const nip44 = await import("nostr-tools/nip44");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyNip44 = nip44 as any;

    // Try v2 API with conversation key first (preferred)
    if (anyNip44?.v2?.utils?.getConversationKey && anyNip44?.v2?.decrypt) {
      const convKey = await anyNip44.v2.utils.getConversationKey(
        privateKeyHex,
        publicKeyHex
      );
      return await anyNip44.v2.decrypt(ciphertext, convKey);
    }

    // Fallback to direct decrypt signature if provided by the lib version
    if (anyNip44?.decrypt) {
      return await anyNip44.decrypt(privateKeyHex, publicKeyHex, ciphertext);
    }

    throw new Error("No compatible NIP-44 decryption API found");
  } catch (error) {
    throw new NoiseProtocolError(
      "NIP-44 decryption failed",
      "DECRYPTION_FAILED",
      error instanceof Error ? error : undefined
    );
  }
}

// =============================================================================
// Event Creation and Parsing
// =============================================================================

/**
 * Create a kind 1080 PNS event.
 *
 * Encryption flow:
 * 1. If securityMode is "noise-fs", create NoisePnsEnvelope (inner layer)
 * 2. Encrypt with NIP-44 v2 using PNS keypair (outer layer)
 * 3. Build kind 1080 event with appropriate tags
 *
 * @param content - Note plaintext content
 * @param metadata - Note metadata
 * @param pnsKeypair - Derived PNS keypair { publicKey, privateKey }
 * @param securityMode - "none" for NIP-44 only, "noise-fs" for double encryption
 * @param noiseKey - Required if securityMode is "noise-fs" (from NoisePnsManager)
 * @param noteEpoch - Required if securityMode is "noise-fs" (note index)
 * @param securityTier - Security tier for Noise-FS notes
 * @returns Unsigned PNS event ready for signing
 * @throws NoiseProtocolError if encryption fails
 *
 * @example
 * ```typescript
 * // Simple mode (NIP-44 only)
 * const event = await createPnsEvent(
 *   "My note",
 *   { tags: [], createdAt: Date.now() },
 *   pnsKeypair,
 *   "none"
 * );
 *
 * // Forward-secure mode
 * const event = await createPnsEvent(
 *   "Secret note",
 *   { tags: ["important"] },
 *   pnsKeypair,
 *   "noise-fs",
 *   noiseKey,
 *   noteEpoch
 * );
 * ```
 */
export async function createPnsEvent(
  content: string,
  metadata: PnsNoteMetadata,
  pnsKeypair: { publicKey: Uint8Array; privateKey: Uint8Array },
  securityMode: PnsSecurityMode = "none",
  noiseKey?: Uint8Array,
  noteEpoch?: number,
  securityTier: NoiseSecurityTier = "everlasting-standard"
): Promise<UnsignedPnsEvent> {
  const privateKeyHex = bytesToHex(pnsKeypair.privateKey);
  const publicKeyHex = bytesToHex(pnsKeypair.publicKey);

  let contentToEncrypt: string;
  const now = Math.floor(Date.now() / 1000);

  if (securityMode === "noise-fs") {
    // Validate required parameters
    if (!noiseKey || noiseKey.length !== 32) {
      throw new NoiseProtocolError(
        "Noise key required for noise-fs security mode",
        "INVALID_KEY"
      );
    }
    if (typeof noteEpoch !== "number" || noteEpoch < 0) {
      throw new NoiseProtocolError(
        "Valid note epoch required for noise-fs security mode",
        "ENCRYPTION_FAILED"
      );
    }

    // Create inner envelope with Noise-FS encryption
    const envelope = await createNoisePnsEnvelope(
      content,
      metadata,
      noiseKey,
      noteEpoch,
      securityTier
    );
    contentToEncrypt = JSON.stringify(envelope);
  } else {
    // Simple mode: just wrap content + metadata in JSON
    contentToEncrypt = JSON.stringify({
      content,
      metadata: {
        ...metadata,
        createdAt: metadata.createdAt ?? Date.now(),
        updatedAt: metadata.updatedAt ?? Date.now(),
      },
    });
  }

  // Encrypt outer layer with NIP-44
  const encryptedContent = await encryptNip44Pns(
    contentToEncrypt,
    privateKeyHex,
    publicKeyHex
  );

  // Build event tags
  const tags: string[][] = [];

  // Add "d" tag for replaceable event (using note ID if available)
  if (metadata.noteId) {
    tags.push(["d", metadata.noteId]);
  }

  // Add expiration tag for ephemeral notes
  if (metadata.ephemeralPolicy?.expiresAt) {
    const expirationUnix = Math.floor(
      metadata.ephemeralPolicy.expiresAt / 1000
    );
    tags.push(["expiration", expirationUnix.toString()]);
  }

  // Add custom tags from metadata
  if (metadata.tags && metadata.tags.length > 0) {
    for (const tag of metadata.tags) {
      tags.push(["t", tag]);
    }
  }

  // Add security mode tag
  tags.push(["security", securityMode]);

  // Add noise-epoch tag for Noise-FS mode (required for decryption)
  if (securityMode === "noise-fs" && typeof noteEpoch === "number") {
    tags.push(["noise-epoch", noteEpoch.toString()]);
  }

  return {
    kind: PNS_EVENT_KIND,
    created_at: now,
    tags,
    content: encryptedContent,
    pubkey: publicKeyHex,
  };
}

/**
 * Parse and decrypt a kind 1080 PNS event.
 *
 * @param event - The Nostr event to parse
 * @param pnsKeypair - Derived PNS keypair for NIP-44 decryption
 * @param noiseKey - Required for "noise-fs" events (from NoisePnsManager)
 * @returns Decrypted content and metadata
 * @throws NoiseProtocolError if decryption fails or event is invalid
 *
 * @example
 * ```typescript
 * const { content, metadata } = await parsePnsEvent(event, pnsKeypair, noiseKey);
 * ```
 */
export async function parsePnsEvent(
  event: NostrEvent,
  pnsKeypair: { publicKey: Uint8Array; privateKey: Uint8Array },
  noiseKey?: Uint8Array
): Promise<ParsedPnsContent> {
  // Validate event
  if (!validatePnsEvent(event)) {
    throw new NoiseProtocolError(
      "Invalid PNS event format",
      "DECRYPTION_FAILED"
    );
  }

  const privateKeyHex = bytesToHex(pnsKeypair.privateKey);
  const publicKeyHex = bytesToHex(pnsKeypair.publicKey);

  // Decrypt outer NIP-44 layer
  const decryptedContent = await decryptNip44Pns(
    event.content,
    privateKeyHex,
    publicKeyHex
  );

  // Parse the decrypted content
  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptedContent);
  } catch {
    throw new NoiseProtocolError(
      "Failed to parse decrypted content as JSON",
      "DECRYPTION_FAILED"
    );
  }

  // Check if this is a Noise-FS envelope
  const envelope = parsed as Record<string, unknown>;
  if (
    envelope.version === 1 &&
    envelope.fs_mode === "noise-fs" &&
    typeof envelope.noise_ciphertext === "string"
  ) {
    // Decrypt inner Noise-FS layer
    if (!noiseKey || noiseKey.length !== 32) {
      throw new NoiseProtocolError(
        "Noise key required to decrypt noise-fs envelope",
        "INVALID_KEY"
      );
    }
    // Type assertion through unknown since we've validated the required fields
    return parseNoisePnsEnvelope(
      envelope as unknown as NoisePnsEnvelope,
      noiseKey
    );
  }

  // Simple mode: content + metadata directly in JSON
  if (typeof envelope.content === "string" && envelope.metadata) {
    return {
      content: envelope.content,
      metadata: envelope.metadata as PnsNoteMetadata,
    };
  }

  throw new NoiseProtocolError(
    "Unknown PNS content format",
    "DECRYPTION_FAILED"
  );
}

/**
 * Validate that an event is a properly formatted kind 1080 PNS event.
 *
 * @param event - The event to validate
 * @returns true if event is a valid PNS event, false otherwise
 *
 * @example
 * ```typescript
 * if (!validatePnsEvent(event)) {
 *   throw new Error("Not a valid PNS event");
 * }
 * ```
 */
export function validatePnsEvent(event: NostrEvent | unknown): boolean {
  if (!event || typeof event !== "object") {
    return false;
  }

  const e = event as Record<string, unknown>;

  // Check required fields
  if (e.kind !== PNS_EVENT_KIND) {
    return false;
  }

  if (typeof e.content !== "string" || e.content.length === 0) {
    return false;
  }

  if (typeof e.pubkey !== "string" || !/^[0-9a-fA-F]{64}$/.test(e.pubkey)) {
    return false;
  }

  if (typeof e.created_at !== "number" || e.created_at <= 0) {
    return false;
  }

  if (!Array.isArray(e.tags)) {
    return false;
  }

  return true;
}

/**
 * Get the security mode from a PNS event's tags.
 *
 * @param event - The PNS event
 * @returns Security mode ("none" or "noise-fs"), defaults to "none"
 */
export function getPnsSecurityMode(event: NostrEvent): PnsSecurityMode {
  if (!event.tags || !Array.isArray(event.tags)) {
    return "none";
  }

  for (const tag of event.tags) {
    if (Array.isArray(tag) && tag[0] === "security" && tag[1]) {
      if (tag[1] === "noise-fs") {
        return "noise-fs";
      }
    }
  }

  return "none";
}

// =============================================================================
// CEPS Publishing Integration
// =============================================================================

/**
 * Sign and publish a PNS event using CEPS.
 *
 * Uses the Central Event Publishing Service for:
 * - Event signing via active session
 * - Relay selection and publishing
 * - Error handling and retry logic
 *
 * @param unsignedEvent - Unsigned PNS event from createPnsEvent()
 * @param pnsPrivateKeyHex - PNS private key for signing
 * @param relays - Optional specific relays to publish to
 * @returns Publishing result with event ID
 *
 * @example
 * ```typescript
 * const unsignedEvent = await createPnsEvent(content, metadata, pnsKeypair, "none");
 * const result = await publishPnsEvent(unsignedEvent, privateKeyHex);
 * if (result.success) {
 *   console.log("Published:", result.eventId);
 * }
 * ```
 */
export async function publishPnsEvent(
  unsignedEvent: UnsignedPnsEvent,
  pnsPrivateKeyHex: string,
  relays?: string[]
): Promise<PnsPublishResult> {
  try {
    // Dynamic import CEPS to avoid circular dependencies
    // CEPS is at lib/central_event_publishing_service.ts
    const { central_event_publishing_service: CEPS } = await import(
      "../../../../lib/central_event_publishing_service"
    );

    // Sign the event with PNS private key
    const signedEvent = CEPS.signEvent(unsignedEvent, pnsPrivateKeyHex);

    // Publish via CEPS
    const eventId = await CEPS.publishEvent(signedEvent, relays);

    return {
      success: true,
      eventId,
      relaysPublished: relays,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Publishing failed",
    };
  }
}

/** Default timeout for relay queries in milliseconds */
const DEFAULT_QUERY_TIMEOUT_MS = 5000;

/**
 * Query PNS events from relays via CEPS.
 *
 * @param pnsPublicKeyHex - PNS public key to query events for
 * @param filters - Additional filters (limit, since, until, noteId, timeout)
 * @param relays - Optional specific relays to query
 * @returns Array of matching PNS events
 */
export async function queryPnsEvents(
  pnsPublicKeyHex: string,
  filters?: {
    limit?: number;
    since?: number;
    until?: number;
    noteId?: string;
    /** Query timeout in milliseconds (default: 5000) */
    timeout?: number;
  },
  relays?: string[]
): Promise<NostrEvent[]> {
  try {
    // Warn if no relays provided - this is likely unintentional
    if (!relays || relays.length === 0) {
      console.warn(
        "[PNS] queryPnsEvents: No relays specified, query may return empty results"
      );
    }

    const { central_event_publishing_service: CEPS } = await import(
      "../../../../lib/central_event_publishing_service"
    );

    // Build filter for kind 1080 events from PNS pubkey
    const queryFilters: Record<string, unknown>[] = [
      {
        kinds: [PNS_EVENT_KIND],
        authors: [pnsPublicKeyHex],
        limit: filters?.limit ?? 100,
        ...(filters?.since && { since: filters.since }),
        ...(filters?.until && { until: filters.until }),
        ...(filters?.noteId && { "#d": [filters.noteId] }),
      },
    ];

    // Use CEPS subscribeMany with a configurable timeout for query
    const events: NostrEvent[] = [];
    const timeoutMs = filters?.timeout ?? DEFAULT_QUERY_TIMEOUT_MS;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(
          `[PNS] queryPnsEvents: Timeout after ${timeoutMs}ms, returning ${events.length} events`
        );
        resolve(events);
      }, timeoutMs);

      try {
        const sub = CEPS.subscribeMany(relays ?? [], queryFilters, {
          onevent: (e: NostrEvent) => {
            if (validatePnsEvent(e)) {
              events.push(e);
            }
          },
          oneose: () => {
            clearTimeout(timeout);
            if (sub && typeof sub.close === "function") {
              sub.close();
            }
            resolve(events);
          },
        });
      } catch (error) {
        console.error(
          "[PNS] queryPnsEvents: Subscription error:",
          error instanceof Error ? error.message : "Unknown error"
        );
        clearTimeout(timeout);
        resolve(events);
      }
    });
  } catch (error) {
    console.error(
      "[PNS] queryPnsEvents: Failed to initialize query:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return [];
  }
}

/**
 * Publish a kind 5 deletion event for a PNS note.
 *
 * @param eventId - Event ID of the note to delete
 * @param pnsPrivateKeyHex - PNS private key for signing
 * @param pnsPublicKeyHex - PNS public key
 * @param relays - Optional specific relays
 * @returns Publishing result
 */
export async function publishPnsDeletion(
  eventId: string,
  pnsPrivateKeyHex: string,
  pnsPublicKeyHex: string,
  relays?: string[]
): Promise<PnsPublishResult> {
  try {
    const { central_event_publishing_service: CEPS } = await import(
      "../../../../lib/central_event_publishing_service"
    );

    const now = Math.floor(Date.now() / 1000);

    const unsignedDeletion = {
      kind: 5,
      created_at: now,
      tags: [["e", eventId]],
      content: "PNS note deleted",
      pubkey: pnsPublicKeyHex,
    };

    const signedEvent = CEPS.signEvent(unsignedDeletion, pnsPrivateKeyHex);
    const deletionEventId = await CEPS.publishEvent(signedEvent, relays);

    return {
      success: true,
      eventId: deletionEventId,
      relaysPublished: relays,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Deletion failed",
    };
  }
}
