import type { Event as NostrEvent } from "nostr-tools"; // Type-only ok; runtime imports centralized via CEPS
import { config } from "../config";
import { central_event_publishing_service as CEPS } from "./central_event_publishing_service";

/**
 * Nostr relay connection pool
 * Manages connections to multiple relays for redundancy
 */
const pool = {
  publish: async (_relays?: string[], _event?: NostrEvent) => {
    if (_relays && _relays.length && _event) {
      await CEPS.publishEvent(_event as any, _relays);
    }
  },
  list: async (relays?: string[], filters?: any[]) => {
    const listRelays =
      Array.isArray(relays) && relays.length ? relays : undefined;
    const listFilters = Array.isArray(filters) && filters.length ? filters : [];
    return CEPS.list(listFilters as any[], listRelays);
  },
  subscribeMany: (
    relayUrls: string[],
    filters: any[],
    handlers: { onevent?: (e: NostrEvent) => void; oneose?: () => void }
  ) => CEPS.subscribeMany(relayUrls, filters, handlers),
}; // CEPS manages pool internally

/**
 * Configure relay connections from application settings
 * Supports both single relay and multiple relay configurations
 */
if (!config.nostr?.relays || config.nostr.relays.length === 0) {
  throw new Error("Nostr relay URLs not configured");
}
const relays = config.nostr.relays;

/**
 * Key management for application identity
 * Caches keys to avoid regeneration on each request
 */
let cachedKeys: { privateKey: string; publicKey: string } | null = null;
/**
 * Get or generate application keypair
 * Uses configured private key or generates a new one if not provided
 * @returns Object containing privateKey and publicKey
 */
const getKeys = () => {
  if (!cachedKeys) {
    const privateKeyBytes = config.nostr.privateKey
      ? typeof config.nostr.privateKey === "string"
        ? Buffer.from(config.nostr.privateKey, "hex")
        : config.nostr.privateKey
      : (generatePrivateKey as any)();
    const privateKey = Buffer.from(privateKeyBytes).toString("hex");
    cachedKeys = {
      privateKey,
      publicKey: (getPublicKey as any)(privateKeyBytes),
    };
  }
  return cachedKeys;
};

/**
 * Convert hex public key to bech32 npub format
 * @param publicKey Hex-encoded public key
 * @returns Bech32-encoded npub
 */
const encodePublicKey = (publicKey: string): string => {
  return CEPS.encodeNpub(publicKey);
};

/**
 * Convert hex private key to bech32 nsec format
 * @param privateKey Hex-encoded private key
 * @returns Bech32-encoded nsec
 */
const encodePrivateKey = (privateKey: string): string => {
  const bytes = new Uint8Array(
    (privateKey.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16))
  );
  return CEPS.encodeNsec(bytes);
};

/**
 * Convert bech32 npub to hex public key
 * @param npub Bech32-encoded public key
 * @returns Hex-encoded public key
 * @throws Error if npub format is invalid
 */
const decodePublicKey = (npub: string): string => {
  try {
    const { data } = nip19.decode(npub);
    return data as string;
  } catch {
    throw new Error("Invalid npub format");
  }
};

/**
 * Convert bech32 nsec to hex private key
 * @param nsec Bech32-encoded private key
 * @returns Hex-encoded private key
 * @throws Error if nsec format is invalid
 */
const decodePrivateKey = (nsec: string): string => {
  try {
    const { data } = nip19.decode(nsec);
    return data as string;
  } catch {
    throw new Error("Invalid nsec format");
  }
};

/**
 * Create an authentication challenge event for Nostr authentication
 *
 * This creates an unsigned event template that will be sent to the client.
 * The client must sign this event with their private key to prove identity.
 *
 * @param pubkey The public key of the user attempting to authenticate
 * @returns Unsigned Nostr event with challenge
 */
const createAuthChallengeEvent = (pubkey: string): NostrEvent => {
  const now = Math.floor(Date.now() / 1000);

  // Create a challenge with a timestamp to prevent replay attacks
  const challenge = `${config.nostr.nostrAuthChallenge}:${now}`;

  // Create the event without signature (client will sign)
  const event: NostrEvent = {
    id: "", // Will be set by client
    pubkey,
    created_at: now,
    kind: config.nostr.nostrAuthKind,
    tags: [
      ["challenge", challenge],
      ["domain", new URL(config.api.baseUrl).hostname],
    ],
    content: "Authenticate with Satnam",
    sig: "", // Will be set by client
  };

  return event;
};

/**
 * Verify a signed authentication event from a client
 *
 * Performs comprehensive validation of the event:
 * 1. Cryptographic signature verification
 * 2. Event hash integrity check
 * 3. Event kind validation
 * 4. Challenge tag presence and format
 * 5. Domain verification (prevents cross-site attacks)
 * 6. Timestamp validation (prevents replay attacks)
 *
 * @param event The signed Nostr event to verify
 * @returns boolean indicating if the event is valid
 */
const verifyAuthEvent = (event: NostrEvent): boolean => {
  // Verify signature
  if (!CEPS.verifyEvent(event as any)) {
    return false;
  }

  // Verify event kind
  if (event.kind !== config.nostr.nostrAuthKind) {
    return false;
  }

  // Verify challenge tag exists
  const challengeTag = event.tags.find((tag) => tag[0] === "challenge");
  if (!challengeTag || !challengeTag[1]) {
    return false;
  }

  // Verify domain tag
  const domainTag = event.tags.find((tag) => tag[0] === "domain");
  if (!domainTag || domainTag[1] !== new URL(config.api.baseUrl).hostname) {
    return false;
  }

  // Verify timestamp (challenge should be recent)
  const challengeParts = challengeTag[1].split(":");
  if (challengeParts.length !== 2) {
    return false;
  }

  const timestamp = parseInt(challengeParts[1], 10);
  const now = Math.floor(Date.now() / 1000);

  // Challenge should be within the last 5 minutes
  if (now - timestamp > 300) {
    return false;
  }

  return true;
};

/**
 * Create and cryptographically sign a Nostr event
 *
 * @param kind The Nostr event kind (numeric identifier)
 * @param content The content of the event
 * @param tags Array of tags for the event
 * @param privateKey The private key to sign with
 * @returns A complete, signed Nostr event ready for publication
 */
const createSignedEvent = (
  kind: number,
  content: string,
  tags: string[][] = [],
  privateKey: string
): NostrEvent => {
  const privateKeyBytes = new Uint8Array(
    privateKey.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );
  const pubkey = (getPublicKey as any)(privateKeyBytes);

  const eventTemplate = {
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags,
    content,
  };

  // Use finalizeEvent to calculate hash and sign
  const event = (finalizeEvent as any)(
    eventTemplate,
    privateKeyBytes
  ) as NostrEvent;

  return event;
};

/**
 * Publish a Nostr event to one or more relays
 *
 * Attempts to publish to all specified relays and handles failures gracefully.
 * Uses Promise.allSettled to ensure all publish attempts complete regardless
 * of individual failures.
 *
 * @param event The signed Nostr event to publish
 * @param relayUrls Array of relay URLs to publish to (defaults to configured relays)
 */
const publishEvent = async (
  event: NostrEvent,
  relayUrls: string[] = relays
): Promise<void> => {
  // Publish to each relay individually
  const publishPromises = relayUrls.map((relayUrl: string) =>
    pool.publish([relayUrl], event)
  );

  // Wait for all publish attempts to complete
  await Promise.allSettled(publishPromises);

  // Publication continues even with some relay failures
};

/**
 * Subscribe to Nostr events matching specified filters
 *
 * Creates a subscription to receive events from relays in real-time.
 * Supports both event handling and end-of-stored-events (EOSE) notification.
 *
 * @param filters Array of Nostr filters to match events
 * @param onEvent Callback function for each matching event
 * @param onEose Optional callback for when relays have sent all stored events
 * @param relayUrls Array of relay URLs to subscribe to (defaults to configured relays)
 * @returns Subscription object that can be used to unsubscribe
 */
const subscribeToEvents = (
  filters: any[],
  onEvent: (event: NostrEvent) => void,
  onEose?: () => void,
  relayUrls: string[] = relays
) => {
  const sub = pool.subscribeMany(relayUrls, filters, {
    onevent: onEvent,
    oneose: onEose,
  });

  return sub;
};

export {
  createAuthChallengeEvent,
  createSignedEvent,
  decodePrivateKey,
  decodePublicKey,
  encodePrivateKey,
  encodePublicKey,
  getKeys,
  pool,
  publishEvent,
  relays,
  subscribeToEvents,
  verifyAuthEvent,
};
