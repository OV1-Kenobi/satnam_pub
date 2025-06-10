import {
  generatePrivateKey,
  getPublicKey,
  nip19,
  SimplePool,
  verifySignature,
  getEventHash,
  signEvent,
  Filter,
} from "nostr-tools";
import { config, authConfig } from "../config";
import { NostrEvent } from "../types/user";

// Create a Nostr relay pool
const pool = new SimplePool();

// Connect to relays
if (!config.nostr?.relayUrl) {
  throw new Error("Nostr relay URL not configured");
}
const relays = Array.isArray(config.nostr.relayUrl)
  ? config.nostr.relayUrl
  : [config.nostr.relayUrl];

// Generate keys if not provided
const getKeys = () => {
  const privateKey = config.nostr.privateKey || generatePrivateKey();
  const publicKey = getPublicKey(privateKey);
  return { privateKey, publicKey };
};

// Encode public key to npub format
const encodePublicKey = (publicKey: string): string => {
  return nip19.npubEncode(publicKey);
};

// Encode private key to nsec format
const encodePrivateKey = (privateKey: string): string => {
  return nip19.nsecEncode(privateKey);
};

// Decode npub to hex public key
const decodePublicKey = (npub: string): string => {
  try {
    const { data } = nip19.decode(npub);
    if (typeof data !== "string") {
      throw new Error("Decoded npub is not a string");
    }
    return data;
  } catch (error) {
    throw new Error("Invalid npub format");
  }
};

// Decode nsec to hex private key
const decodePrivateKey = (nsec: string): string => {
  try {
    const { data } = nip19.decode(nsec);
    if (typeof data !== "string") {
      throw new Error("Decoded nsec is not a string");
    }
    return data;
  } catch (error) {
    throw new Error("Invalid nsec format");
  }
};

// Create an authentication challenge event
const createAuthChallengeEvent = (pubkey: string): NostrEvent => {
  const now = Math.floor(Date.now() / 1000);

  // Create a challenge with a timestamp to prevent replay attacks
  const challenge = `${authConfig.nostrAuthChallenge}:${now}`;

  // Create the event without signature (client will sign)
  const event: NostrEvent = {
    id: "", // Will be set by client
    pubkey,
    created_at: now,
    kind: authConfig.nostrAuthKind,
    tags: [
      ["challenge", challenge],
      ["domain", new URL(config.api.baseUrl).hostname],
    ],
    content: "Authenticate with Satnam",
    sig: "", // Will be set by client
  };

  return event;
};

// Verify an authentication event
const verifyAuthEvent = (event: NostrEvent): boolean => {
  // Verify signature
  if (!verifySignature(event)) {
    return false;
  }

  // Verify event hash
  const computedHash = getEventHash(event);
  if (computedHash !== event.id) {
    return false;
  }

  // Verify event kind
  if (event.kind !== authConfig.nostrAuthKind) {
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

// Create and sign a Nostr event
const createSignedEvent = (
  kind: number,
  content: string,
  tags: string[][] = [],
  privateKey: string,
): NostrEvent => {
  const pubkey = getPublicKey(privateKey);

  const event: NostrEvent = {
    id: "",
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags,
    content,
    sig: "",
  };

  // Calculate the event hash
  event.id = getEventHash(event);

  // Sign the event
  event.sig = signEvent(event, privateKey);

  return event;
};

// Publish an event to relays
const publishEvent = async (
  event: NostrEvent,
  relayUrls = relays,
): Promise<void> => {
  const results = await Promise.allSettled(pool.publish(relayUrls, event));
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`Failed to publish to ${failures.length} relays`);
  }
};

// Subscribe to events
const subscribeToEvents = (
  filters: Filter[],
  onEvent: (event: NostrEvent) => void,
  onEose?: () => void,
  relayUrls = relays,
) => {
  const sub = pool.sub(relayUrls, filters);

  sub.on("event", (event: NostrEvent) => {
    onEvent(event);
  });

  if (onEose) {
    sub.on("eose", onEose);
  }

  return sub;
};

export {
  pool,
  relays,
  getKeys,
  encodePublicKey,
  encodePrivateKey,
  decodePublicKey,
  decodePrivateKey,
  createAuthChallengeEvent,
  verifyAuthEvent,
  createSignedEvent,
  publishEvent,
  subscribeToEvents,
};
