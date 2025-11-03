/**
 * Nostr Event Publishing Helpers for Integration Tests
 * Phase 2 Week 3: Real Integration Testing
 *
 * Provides helpers for publishing and querying real Nostr events
 * to test relays. Uses nostr-tools SimplePool for relay communication.
 *
 * Usage:
 * ```typescript
 * const event = createNIP03Event(kind0EventId, otsProof);
 * const published = await publishNostrEvent(event);
 * const queried = await queryNostrEventFromRelay(event.id);
 * ```
 */

import {
  Event,
  finalizeEvent,
  generateSecretKey,
  SimplePool,
} from "nostr-tools";

// ============================================================================
// TYPES
// ============================================================================

export interface NostrEventPublishResult {
  success: boolean;
  eventId: string;
  relaysPublished: string[];
  error?: string;
}

export interface NostrEventQueryResult {
  success: boolean;
  events: Event[];
  relaysQueried: string[];
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const TEST_RELAYS = process.env.NOSTR_RELAYS
  ? process.env.NOSTR_RELAYS.split(",")
  : ["wss://relay.satnam.pub"];

const RELAY_TIMEOUT = 5000; // 5 seconds

// ============================================================================
// EVENT CREATION
// ============================================================================

/**
 * Create a Kind:0 (profile metadata) event
 */
export function createKind0Event(
  npub: string,
  nip05: string,
  metadata?: Record<string, any>
): Event {
  const sk = generateSecretKey();

  const event: Event = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify({
      name: "Test User",
      about: "Test account for integration testing",
      picture: "",
      nip05: nip05,
      ...metadata,
    }),
    pubkey: npub,
    sig: "",
    id: "",
  };

  return finalizeEvent(event, sk);
}

/**
 * Create a Kind:1040 (NIP-03 attestation) event
 */
export function createNIP03Event(
  kind0EventId: string,
  otsProof: string,
  bitcoinBlock?: number,
  bitcoinTx?: string
): Event {
  const sk = generateSecretKey();

  const tags: string[][] = [
    ["e", kind0EventId],
    ["ots", otsProof],
    ["alt", "OpenTimestamps attestation for Nostr event"],
  ];

  if (bitcoinBlock) {
    tags.push(["bitcoin_block", bitcoinBlock.toString()]);
  }

  if (bitcoinTx) {
    tags.push(["bitcoin_tx", bitcoinTx]);
  }

  tags.push(["relay", "wss://relay.satnam.pub"]);

  const event: Event = {
    kind: 1040,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify({
      attested_event_id: kind0EventId,
      ots_proof: otsProof,
      bitcoin_block: bitcoinBlock || null,
      bitcoin_tx: bitcoinTx || null,
    }),
    pubkey: "",
    sig: "",
    id: "",
  };

  return finalizeEvent(event, sk);
}

// ============================================================================
// EVENT PUBLISHING
// ============================================================================

/**
 * Publish a Nostr event to test relays
 */
export async function publishNostrEvent(
  event: Event
): Promise<NostrEventPublishResult> {
  const pool = new SimplePool();

  try {
    const publishPromises = TEST_RELAYS.map((relay) =>
      Promise.race([
        pool.publish([relay], event),
        new Promise<string[]>((_, reject) =>
          setTimeout(() => reject(new Error("Relay timeout")), RELAY_TIMEOUT)
        ),
      ]).catch((error) => {
        console.warn(`Failed to publish to ${relay}:`, error);
        return [];
      })
    );

    const results = await Promise.all(publishPromises);
    const relaysPublished: string[] = results
      .flat()
      .filter((r) => typeof r === "string");

    return {
      success: relaysPublished.length > 0,
      eventId: event.id,
      relaysPublished,
    };
  } catch (error) {
    return {
      success: false,
      eventId: event.id,
      relaysPublished: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    pool.close(TEST_RELAYS);
  }
}

// ============================================================================
// EVENT QUERYING
// ============================================================================

/**
 * Query a Nostr event from test relays by event ID
 */
export async function queryNostrEventFromRelay(
  eventId: string
): Promise<NostrEventQueryResult> {
  const pool = new SimplePool();

  try {
    const queryPromises = TEST_RELAYS.map((relay) =>
      Promise.race([
        pool.querySync([relay], { ids: [eventId] }),
        new Promise<Event[]>((_, reject) =>
          setTimeout(() => reject(new Error("Relay timeout")), RELAY_TIMEOUT)
        ),
      ]).catch((error) => {
        console.warn(`Failed to query from ${relay}:`, error);
        return [];
      })
    );

    const results = await Promise.all(queryPromises);
    const events = results.flat();

    return {
      success: events.length > 0,
      events,
      relaysQueried: TEST_RELAYS,
    };
  } catch (error) {
    return {
      success: false,
      events: [],
      relaysQueried: TEST_RELAYS,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    pool.close(TEST_RELAYS);
  }
}

/**
 * Query Nostr events by filter
 */
export async function queryNostrEventsByFilter(
  filter: Record<string, any>
): Promise<NostrEventQueryResult> {
  const pool = new SimplePool();

  try {
    const queryPromises = TEST_RELAYS.map((relay) =>
      Promise.race([
        pool.querySync([relay], filter),
        new Promise<Event[]>((_, reject) =>
          setTimeout(() => reject(new Error("Relay timeout")), RELAY_TIMEOUT)
        ),
      ]).catch((error) => {
        console.warn(`Failed to query from ${relay}:`, error);
        return [];
      })
    );

    const results = await Promise.all(queryPromises);
    const events = results.flat();

    return {
      success: events.length > 0,
      events,
      relaysQueried: TEST_RELAYS,
    };
  } catch (error) {
    return {
      success: false,
      events: [],
      relaysQueried: TEST_RELAYS,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    pool.close(TEST_RELAYS);
  }
}

// ============================================================================
// EVENT VALIDATION
// ============================================================================

/**
 * Validate event ID format (64-character hex string)
 */
export function isValidEventId(eventId: string): boolean {
  return /^[a-f0-9]{64}$/.test(eventId);
}

/**
 * Validate Nostr event structure
 */
export function isValidNostrEvent(event: any): boolean {
  return (
    event &&
    typeof event.id === "string" &&
    isValidEventId(event.id) &&
    typeof event.kind === "number" &&
    typeof event.created_at === "number" &&
    typeof event.pubkey === "string" &&
    typeof event.content === "string" &&
    Array.isArray(event.tags) &&
    typeof event.sig === "string"
  );
}
