/**
 * CEPS Client Interface Layer
 *
 * Small, stable wrapper around the CentralEventPublishingService (CEPS) that
 * provides a lazy-loaded, TDZ-safe boundary for browser code.
 *
 * IMPORTANT:
 * - UI and service modules should depend on this file instead of importing
 *   `lib/central_event_publishing_service` directly.
 * - CEPS is loaded lazily via dynamic import so it lives in its own chunk and
 *   is only initialized when actually needed.
 * - This module must remain UI-free (no React, no components).
 * - Preserves zero-knowledge nsec handling and privacy-first principles.
 * - Never logs secret material (nsec, private keys, session keys).
 *
 * @module ceps-client
 */

import { getEnvVar } from "../../config/env.client";

// ============================================================================
// Environment Configuration (TDZ-safe via lazy getter pattern)
// ============================================================================

/**
 * Fallback relays when environment variable is not configured.
 * These are well-known, reliable Nostr relays.
 */
const FALLBACK_RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
] as const;

/**
 * Cached default relays - initialized lazily on first access.
 * This pattern prevents TDZ errors by deferring getEnvVar() call
 * until the function is actually invoked (not at module load time).
 */
let _cachedDefaultRelays: string[] | null = null;

/**
 * Get default relays from environment (lazy-loaded).
 * Falls back to standard Nostr relays if not configured.
 *
 * @returns Array of relay URLs
 */
export function getDefaultRelays(): string[] {
  if (_cachedDefaultRelays === null) {
    const raw = getEnvVar("VITE_NOSTR_RELAYS") ?? "";
    _cachedDefaultRelays = raw
      ? raw
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean)
      : [...FALLBACK_RELAYS];
  }
  return _cachedDefaultRelays;
}

// Legacy alias for backward compatibility (uses lazy getter)
const DEFAULT_RELAYS: string[] = new Proxy([] as string[], {
  get(_target, prop) {
    const relays = getDefaultRelays();
    if (prop === "length") return relays.length;
    if (typeof prop === "string" && !isNaN(Number(prop))) {
      return relays[Number(prop)];
    }
    if (prop === Symbol.iterator) return relays[Symbol.iterator].bind(relays);
    if (typeof prop === "string" && prop in Array.prototype) {
      const method = (relays as any)[prop];
      return typeof method === "function" ? method.bind(relays) : method;
    }
    return undefined;
  },
});

// ============================================================================
// Types (Module-level, erased at runtime where type-only)
// ============================================================================

/**
 * Type-only view of the CEPS module; erased at runtime.
 * This uses the existing CEPS implementation in lib/central_event_publishing_service.ts
 * and does NOT create a static import in the compiled bundle.
 */
type CepsModule =
  typeof import("../../../lib/central_event_publishing_service");

/** Runtime CEPS instance type (singleton exported by the CEPS module). */
type CepsInstance = CepsModule["central_event_publishing_service"];

/** Public client type re-exposed for external use. */
export type CepsClient = CepsInstance;

/** Nostr event type used by CEPS. */
export type CepsEvent = Parameters<CepsInstance["publishEvent"]>[0];

/** Filter type for Nostr subscriptions. */
export type CepsFilter = Parameters<CepsInstance["subscribeMany"]>[1][number];

/** Subscription handle returned by subscribeMany. */
export type CepsSubscription = ReturnType<CepsInstance["subscribeMany"]>;

/**
 * Result of a message send operation.
 */
export interface MessageSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  signingMethod?: string;
  securityLevel?: string;
  deliveryTime?: string;
}

/**
 * Relay health status for a single relay.
 */
export interface RelayHealthStatus {
  url: string;
  connected: boolean;
  latencyMs?: number;
  lastChecked: Date;
  error?: string;
}

/**
 * Aggregate relay health report.
 */
export interface RelayHealthReport {
  relays: RelayHealthStatus[];
  healthyCount: number;
  totalCount: number;
  timestamp: Date;
}

/**
 * Session status information.
 */
export interface CepsSessionStatus {
  active: boolean;
  sessionId: string | null;
  contactCount: number;
  groupCount: number;
  authMethod?: "nsec" | "nip07";
}

/**
 * Gift wrap preference for OTP and DM operations.
 */
export interface GiftWrapPreference {
  preferGiftWrap?: boolean;
  fallbackRelays?: string[];
}

/**
 * OTP delivery result.
 */
export interface OTPDeliveryResult {
  success: boolean;
  otp?: string;
  messageId?: string;
  expiresAt?: Date;
  messageType?: "gift-wrap" | "nip04";
  error?: string;
}

// ============================================================================
// Lazy Loading Infrastructure
// ============================================================================

/** Cached CEPS instance promise to ensure we only initialize once per page load. */
let cepsPromise: Promise<CepsInstance> | undefined;

/**
 * Lazily load the CentralEventPublishingService singleton.
 *
 * This uses a dynamic import to keep CEPS in a separate chunk and avoid any
 * work at module initialization time, which helps prevent TDZ-style issues
 * related to environment bootstrapping.
 *
 * @returns Promise resolving to the CEPS singleton instance
 */
async function loadCeps(): Promise<CepsInstance> {
  if (!cepsPromise) {
    cepsPromise = (async () => {
      const mod: CepsModule = await import(
        "../../../lib/central_event_publishing_service"
      );
      return mod.central_event_publishing_service;
    })();
  }
  return cepsPromise;
}

// ============================================================================
// Core Client Access
// ============================================================================

/**
 * Get the shared CEPS client instance.
 *
 * Prefer this accessor for advanced use cases that need full CEPS surface
 * area. For common operations, use the helper functions below instead.
 *
 * @returns Promise resolving to the CEPS client instance
 */
export async function getCepsClient(): Promise<CepsClient> {
  return loadCeps();
}

// ============================================================================
// Event Publishing API
// ============================================================================

/**
 * Publish a Nostr event via CEPS with optional relay override.
 *
 * This is the primary entry point for UI code that needs to publish events
 * without depending directly on the CEPS implementation.
 *
 * @param event - The Nostr event to publish
 * @param relays - Optional array of relay URLs to publish to
 * @returns Promise resolving to the event ID
 */
export async function publishEventWithCeps(
  event: CepsEvent,
  relays?: string[]
): Promise<string> {
  const ceps = await loadCeps();
  return ceps.publishEvent(event, relays);
}

/**
 * Publish an event with optimized relay selection based on recipient.
 *
 * Uses NIP-10050 inbox relay discovery when available.
 *
 * @param event - The Nostr event to publish
 * @param options - Optional recipient/sender pubkeys for relay optimization
 * @returns Promise resolving to the event ID
 */
export async function publishOptimizedWithCeps(
  event: CepsEvent,
  options?: {
    recipientPubHex?: string;
    senderPubHex?: string;
    includeFallback?: boolean;
  }
): Promise<string> {
  const ceps = await loadCeps();
  return ceps.publishOptimized(event, options);
}

/**
 * Sign an event using the active session.
 *
 * Uses the secure session provider or external signers (NIP-07, Amber)
 * based on user preferences and availability.
 *
 * @param unsignedEvent - The unsigned event to sign
 * @returns Promise resolving to the signed event
 */
export async function signEventWithCeps(
  unsignedEvent: Record<string, unknown>
): Promise<CepsEvent> {
  const ceps = await loadCeps();
  return ceps.signEventWithActiveSession(unsignedEvent);
}

// ============================================================================
// Subscription API
// ============================================================================

/**
 * Subscribe to Nostr events via CEPS.
 *
 * This delegates to CEPS.subscribeMany and returns the underlying
 * subscription handle.
 *
 * @param relays - Array of relay URLs to subscribe to
 * @param filters - Array of Nostr filters
 * @param handlers - Event handlers for onevent, oneose, etc.
 * @returns Promise resolving to the subscription handle
 */
export async function subscribeWithCeps(
  relays: string[],
  filters: CepsFilter[],
  handlers: Parameters<CepsInstance["subscribeMany"]>[2]
): Promise<CepsSubscription> {
  const ceps = await loadCeps();
  return ceps.subscribeMany(relays, filters, handlers);
}

/**
 * List events matching filters from relays.
 *
 * @param filters - Array of Nostr filters
 * @param relays - Optional relay URLs (uses defaults if not provided)
 * @param options - Optional timeout and other settings
 * @returns Promise resolving to array of matching events
 */
export async function listEventsWithCeps(
  filters: CepsFilter[],
  relays?: string[],
  options?: { eoseTimeout?: number }
): Promise<CepsEvent[]> {
  const ceps = await loadCeps();
  return ceps.list(filters, relays ?? getDefaultRelays(), options);
}

// ============================================================================
// Messaging API
// ============================================================================

/**
 * Send a gift-wrapped direct message to a recipient.
 *
 * Uses NIP-59 gift wrapping for maximum privacy when available,
 * with NIP-04 fallback.
 *
 * @param recipientNpub - Recipient's npub
 * @param plaintext - Message content
 * @returns Promise resolving to the event ID
 */
export async function sendGiftwrappedMessageWithCeps(
  recipientNpub: string,
  plaintext: string
): Promise<string> {
  const ceps = await loadCeps();
  // Use standard direct message which internally prefers gift-wrap
  return ceps.sendStandardDirectMessage(recipientNpub, plaintext);
}

/**
 * Send a standard direct message (NIP-04/44) to a recipient.
 *
 * @param recipientNpub - Recipient's npub
 * @param plaintext - Message content
 * @returns Promise resolving to the event ID
 */
export async function sendDirectMessageWithCeps(
  recipientNpub: string,
  plaintext: string
): Promise<string> {
  const ceps = await loadCeps();
  return ceps.sendStandardDirectMessage(recipientNpub, plaintext);
}

/**
 * Send an OTP via Nostr DM with optional gift-wrap preference.
 *
 * @param recipientNpub - Recipient's npub
 * @param userNip05 - Optional NIP-05 identifier for the user
 * @param prefs - Optional gift wrap preferences
 * @returns Promise resolving to the OTP delivery result
 */
export async function sendOTPWithCeps(
  recipientNpub: string,
  userNip05?: string,
  prefs?: GiftWrapPreference
): Promise<OTPDeliveryResult> {
  const ceps = await loadCeps();
  return ceps.sendOTPDM(recipientNpub, userNip05, prefs);
}

// ============================================================================
// Session Management API
// ============================================================================

/**
 * Initialize a messaging session.
 *
 * @param nsecOrMarker - Either an nsec or "nip07" marker for extension auth
 * @param options - Session options including auth method and TTL
 * @returns Promise resolving to the session ID
 */
export async function initializeSessionWithCeps(
  nsecOrMarker: string,
  options?: {
    ipAddress?: string;
    userAgent?: string;
    ttlHours?: number;
    authMethod?: "nip07";
    npub?: string;
  }
): Promise<string> {
  const ceps = await loadCeps();
  return ceps.initializeSession(nsecOrMarker, options);
}

/**
 * Get the current session status.
 *
 * @returns Promise resolving to session status information
 */
export async function getSessionStatusWithCeps(): Promise<CepsSessionStatus> {
  const ceps = await loadCeps();
  return ceps.getSessionStatus();
}

/**
 * End the current session and clean up resources.
 *
 * @returns Promise that resolves when session is ended
 */
export async function endSessionWithCeps(): Promise<void> {
  const ceps = await loadCeps();
  return ceps.destroySession();
}

// ============================================================================
// Relay Health API
// ============================================================================

/**
 * Get the configured relay list from CEPS.
 *
 * @returns Promise resolving to array of relay URLs
 */
export async function getRelaysWithCeps(): Promise<string[]> {
  const ceps = await loadCeps();
  return ceps.getRelays();
}

/**
 * Set the relay list for CEPS.
 *
 * @param relays - Array of relay URLs
 */
export async function setRelaysWithCeps(relays: string[]): Promise<void> {
  const ceps = await loadCeps();
  ceps.setRelays(relays);
}

/**
 * Check the health of configured relays.
 *
 * Attempts to connect and measure latency for each relay.
 *
 * @param relays - Optional specific relays to check (uses configured if not provided)
 * @returns Promise resolving to relay health report
 */
export async function getRelayHealthWithCeps(
  relays?: string[]
): Promise<RelayHealthReport> {
  const ceps = await loadCeps();
  const relayList = relays ?? ceps.getRelays();
  const results: RelayHealthStatus[] = [];
  const now = new Date();

  for (const url of relayList) {
    const startTime = Date.now();
    try {
      // Attempt a simple list query to test connectivity
      await Promise.race([
        ceps.list([{ kinds: [0], limit: 1 }], [url], { eoseTimeout: 3000 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 5000)
        ),
      ]);
      results.push({
        url,
        connected: true,
        latencyMs: Date.now() - startTime,
        lastChecked: now,
      });
    } catch (error) {
      results.push({
        url,
        connected: false,
        lastChecked: now,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    relays: results,
    healthyCount: results.filter((r) => r.connected).length,
    totalCount: results.length,
    timestamp: now,
  };
}

// ============================================================================
// Key Conversion Utilities
// ============================================================================

/**
 * Convert an npub to hex format.
 *
 * @param npub - The npub to convert
 * @returns The hex public key
 */
export async function npubToHexWithCeps(npub: string): Promise<string> {
  const ceps = await loadCeps();
  return ceps.npubToHex(npub);
}

/**
 * Encode a hex public key as npub.
 *
 * @param pubkeyHex - The hex public key
 * @returns The npub-encoded public key
 */
export async function encodeNpubWithCeps(pubkeyHex: string): Promise<string> {
  const ceps = await loadCeps();
  return ceps.encodeNpub(pubkeyHex);
}

/**
 * Decode an npub to hex format (alias for npubToHex).
 *
 * @param npub - The npub to decode
 * @returns The hex public key
 */
export async function decodeNpubWithCeps(npub: string): Promise<string> {
  const ceps = await loadCeps();
  return ceps.decodeNpub(npub);
}

/**
 * Derive npub from nsec.
 *
 * SECURITY: The nsec is passed to CEPS which handles it securely.
 * Never store or log nsec values.
 *
 * @param nsec - The nsec to derive from
 * @returns The derived npub
 */
export async function deriveNpubFromNsecWithCeps(
  nsec: string
): Promise<string> {
  const ceps = await loadCeps();
  return ceps.deriveNpubFromNsec(nsec);
}

/**
 * Derive hex public key from nsec.
 *
 * SECURITY: The nsec is passed to CEPS which handles it securely.
 * Never store or log nsec values.
 *
 * @param nsec - The nsec to derive from
 * @returns The derived hex public key
 */
export async function derivePubkeyHexFromNsecWithCeps(
  nsec: string
): Promise<string> {
  const ceps = await loadCeps();
  return ceps.derivePubkeyHexFromNsec(nsec);
}

// ============================================================================
// Profile & Identity API
// ============================================================================

/**
 * Publish a Nostr profile (kind:0 event).
 *
 * SECURITY: The nsec is passed to CEPS for signing and never stored.
 *
 * @param privateNsec - The private key for signing
 * @param profileContent - The profile metadata
 * @returns Promise resolving to the event ID
 */
export async function publishProfileWithCeps(
  privateNsec: string,
  profileContent: Record<string, unknown>
): Promise<string> {
  const ceps = await loadCeps();
  return ceps.publishProfile(privateNsec, profileContent);
}

/**
 * Publish inbox relay preferences (kind:10050).
 *
 * @param relays - Array of inbox relay URLs
 * @returns Promise resolving to success status and event ID
 */
export async function publishInboxRelaysWithCeps(
  relays: string[]
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const ceps = await loadCeps();
  return ceps.publishInboxRelaysKind10050(relays);
}

// ============================================================================
// Contact Management API
// ============================================================================

/**
 * Load and decrypt contacts from the database.
 *
 * @returns Promise resolving to array of decrypted contacts
 */
export async function loadContactsWithCeps(): Promise<
  Array<{
    npub: string;
    relayHints?: string[];
    trustLevel?: string;
    supportsGiftWrap?: boolean;
  }>
> {
  const ceps = await loadCeps();
  return ceps.loadAndDecryptContacts();
}

// ============================================================================
// Event Verification API
// ============================================================================

/**
 * Verify a Nostr event signature.
 *
 * @param event - The event to verify
 * @returns Boolean indicating if the signature is valid
 */
export async function verifyEventWithCeps(event: CepsEvent): Promise<boolean> {
  const ceps = await loadCeps();
  return ceps.verifyEvent(event);
}
