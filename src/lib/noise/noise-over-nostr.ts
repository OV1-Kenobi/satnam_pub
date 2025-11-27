/**
 * Noise-over-Nostr Transport Adapter
 *
 * Phase 5: Maps Noise protocol messages to Nostr events (NIP-17 kind:14)
 * using ["noise", "v1", pattern] tags for identification.
 *
 * @module src/lib/noise/noise-over-nostr
 */

import { nip19 } from "nostr-tools";
import type {
  NoiseTransportMessage,
  NoiseNostrEvent,
  NoiseMessageResult,
  NoiseSubscription,
  NoiseMessageCallback,
  NoiseHandshakePattern,
} from "./types";
import { NoiseSessionManager } from "./noise-session-manager";
import { bytesToBase64, base64ToBytes } from "./primitives";

// =============================================================================
// Constants
// =============================================================================

/** NIP-17 DM event kind */
const NIP17_DM_KIND = 14;

/** Noise protocol version tag */
const NOISE_VERSION = "v1";

/** Tag prefix for Noise messages */
const NOISE_TAG = "noise";

// =============================================================================
// Noise-over-Nostr Adapter
// =============================================================================

/**
 * Transport adapter for sending Noise messages over Nostr.
 * Singleton pattern for consistent subscription management.
 */
export class NoiseOverNostrAdapter {
  private static instance: NoiseOverNostrAdapter | null = null;

  /** Active subscriptions by peer npub */
  private subscriptions: Map<string, NoiseSubscription> = new Map();

  /** Callback registry by subscription ID */
  private callbacks: Map<string, NoiseMessageCallback> = new Map();

  /** Reference to session manager */
  private sessionManager: NoiseSessionManager;

  private constructor() {
    this.sessionManager = NoiseSessionManager.getInstance();
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): NoiseOverNostrAdapter {
    if (!NoiseOverNostrAdapter.instance) {
      NoiseOverNostrAdapter.instance = new NoiseOverNostrAdapter();
    }
    return NoiseOverNostrAdapter.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   */
  static resetInstance(): void {
    if (NoiseOverNostrAdapter.instance) {
      // Clean up subscriptions
      for (const sub of NoiseOverNostrAdapter.instance.subscriptions.values()) {
        sub.unsubscribe();
      }
      NoiseOverNostrAdapter.instance.subscriptions.clear();
      NoiseOverNostrAdapter.instance.callbacks.clear();
    }
    NoiseOverNostrAdapter.instance = null;
  }

  /**
   * Wrap a Noise transport message for Nostr delivery.
   *
   * @param peerNpub - Recipient's npub
   * @param noiseMessage - Noise transport message to wrap
   * @returns Nostr event content (JSON string) and tags
   */
  wrapNoiseMessage(
    peerNpub: string,
    noiseMessage: NoiseTransportMessage
  ): { content: string; tags: string[][] } {
    const content = JSON.stringify({
      noise: noiseMessage.payload,
      session: noiseMessage.sessionId,
      type: noiseMessage.type,
      pattern: noiseMessage.pattern,
      index: noiseMessage.handshakeIndex,
      ts: noiseMessage.timestamp,
    });

    const tags: string[][] = [
      [NOISE_TAG, NOISE_VERSION, noiseMessage.pattern || "XX"],
    ];

    // Add recipient pubkey tag
    const recipientHex = this.npubToHex(peerNpub);
    if (recipientHex) {
      tags.push(["p", recipientHex]);
    }

    return { content, tags };
  }

  /**
   * Check if a Nostr event contains a Noise message.
   *
   * @param event - Nostr event to check
   * @returns Whether event contains Noise payload
   */
  isNoiseMessage(event: { kind: number; tags: string[][] }): boolean {
    if (event.kind !== NIP17_DM_KIND) {
      return false;
    }

    // Check for noise tag
    return event.tags.some(
      (tag) => tag[0] === NOISE_TAG && tag[1] === NOISE_VERSION
    );
  }

  /**
   * Unwrap a Nostr event to extract Noise transport message.
   *
   * @param event - Nostr event containing Noise payload
   * @returns Parsed NoiseNostrEvent or null if invalid
   */
  unwrapNoiseMessage(event: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
  }): NoiseNostrEvent | null {
    if (!this.isNoiseMessage(event)) {
      return null;
    }

    try {
      const parsed = JSON.parse(event.content);

      // Extract pattern from tag
      const noiseTag = event.tags.find(
        (t) => t[0] === NOISE_TAG && t[1] === NOISE_VERSION
      );
      const pattern = (noiseTag?.[2] as NoiseHandshakePattern) || "XX";

      // Extract recipient from p tag
      const pTag = event.tags.find((t) => t[0] === "p");
      const recipientPubkey = pTag?.[1] || "";

      const noiseMessage: NoiseTransportMessage = {
        type: parsed.type || "handshake",
        sessionId: parsed.session,
        pattern,
        handshakeIndex: parsed.index,
        payload: parsed.noise,
        timestamp: parsed.ts || event.created_at * 1000,
      };

      return {
        eventId: event.id,
        senderPubkey: event.pubkey,
        recipientPubkey,
        noiseMessage,
        createdAt: event.created_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Send a Noise message to a peer via Nostr.
   *
   * @param peerNpub - Recipient's npub
   * @param noiseMessage - Noise transport message
   * @param sendFn - Function to send the wrapped event
   * @returns Result of the send operation
   */
  async sendNoiseMessage(
    peerNpub: string,
    noiseMessage: NoiseTransportMessage,
    sendFn: (
      content: string,
      tags: string[][],
      recipientHex: string
    ) => Promise<string>
  ): Promise<NoiseMessageResult> {
    try {
      const { content, tags } = this.wrapNoiseMessage(peerNpub, noiseMessage);
      const recipientHex = this.npubToHex(peerNpub);

      if (!recipientHex) {
        return {
          success: false,
          error: "Invalid recipient npub",
        };
      }

      const eventId = await sendFn(content, tags, recipientHex);

      return {
        success: true,
        eventId,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Subscribe to Noise messages from a specific peer.
   *
   * @param peerNpub - Peer's npub to subscribe to
   * @param callback - Callback for received messages
   * @param subscribeFn - Function to create the subscription
   * @returns Subscription object
   */
  subscribeToNoiseMessages(
    peerNpub: string,
    callback: NoiseMessageCallback,
    subscribeFn: (
      peerHex: string,
      onEvent: (event: NoiseNostrEvent) => void
    ) => { unsubscribe: () => void }
  ): NoiseSubscription {
    const subscriptionId = `noise:${peerNpub}:${Date.now()}`;

    // Clean up any existing subscription for this peer to prevent memory leaks
    const existingSub = this.subscriptions.get(peerNpub);
    if (existingSub) {
      existingSub.unsubscribe();
    }

    // Store callback
    this.callbacks.set(subscriptionId, callback);

    const peerHex = this.npubToHex(peerNpub);
    if (!peerHex) {
      // Return a no-op subscription for invalid npub
      const noopSub: NoiseSubscription = {
        subscriptionId,
        peerNpub,
        unsubscribe: () => {
          this.callbacks.delete(subscriptionId);
        },
      };
      return noopSub;
    }

    // Create the underlying subscription
    const sub = subscribeFn(peerHex, async (event: NoiseNostrEvent) => {
      const cb = this.callbacks.get(subscriptionId);
      if (cb) {
        // Process the message and provide result to callback
        const result = await this.processIncomingMessageWithResult(event);
        cb(event, result);
      }
    });

    const subscription: NoiseSubscription = {
      subscriptionId,
      peerNpub,
      unsubscribe: () => {
        sub.unsubscribe();
        this.callbacks.delete(subscriptionId);
        this.subscriptions.delete(peerNpub);
      },
    };

    this.subscriptions.set(peerNpub, subscription);
    return subscription;
  }

  /**
   * Get active subscription for a peer.
   *
   * @param peerNpub - Peer's npub
   * @returns Active subscription or undefined
   */
  getSubscription(peerNpub: string): NoiseSubscription | undefined {
    return this.subscriptions.get(peerNpub);
  }

  /**
   * Unsubscribe from all Noise messages.
   */
  unsubscribeAll(): void {
    for (const sub of this.subscriptions.values()) {
      sub.unsubscribe();
    }
    this.subscriptions.clear();
    this.callbacks.clear();
  }

  /**
   * Process an incoming Noise message and route to session manager.
   *
   * @param event - Unwrapped Noise event
   * @returns Decrypted message content or null
   */
  async processIncomingMessage(
    event: NoiseNostrEvent
  ): Promise<Uint8Array | null> {
    const result = await this.processIncomingMessageWithResult(event);
    return result.plaintext || null;
  }

  /**
   * Process an incoming Noise message with full result.
   *
   * @param event - Unwrapped Noise event
   * @returns Processing result
   */
  async processIncomingMessageWithResult(
    event: NoiseNostrEvent
  ): Promise<NoiseMessageResult> {
    const { noiseMessage, senderPubkey } = event;

    // Convert sender pubkey to npub for session lookup
    const senderNpub = this.hexToNpub(senderPubkey);

    // Handle based on message type
    if (noiseMessage.type === "handshake") {
      // Process handshake message - pass the full NoiseTransportMessage
      // First handshake message may not have sessionId known yet
      const sessionId =
        noiseMessage.sessionId ||
        this.sessionManager.findSessionByPeer(senderNpub)?.sessionId;
      const result = await this.sessionManager.processHandshakeMessage(
        sessionId,
        noiseMessage,
        senderNpub
      );

      return result;
    } else if (noiseMessage.type === "transport") {
      // Decrypt transport message
      const session = this.sessionManager.findSessionByPeer(senderNpub);
      if (!session || session.handshakeComplete !== true) {
        return { success: false, error: "No active session for sender" };
      }

      // Parse the payload as NoiseEnvelope (JSON encoded)
      try {
        const envelopeJson = new TextDecoder().decode(
          base64ToBytes(noiseMessage.payload)
        );
        const envelope = JSON.parse(
          envelopeJson
        ) as import("./types").NoiseEnvelope;
        const decrypted = await this.sessionManager.decrypt(
          session.sessionId,
          envelope
        );
        return {
          success: true,
          sessionId: session.sessionId,
          plaintext: decrypted,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Decryption failed",
        };
      }
    }

    return { success: false, error: "Unknown message type" };
  }

  /**
   * Create a transport message for encrypted data.
   *
   * @param sessionId - Session ID
   * @param encryptedPayload - Encrypted payload bytes
   * @param pattern - Handshake pattern used
   * @returns Transport message ready for sending
   */
  createTransportMessage(
    sessionId: string,
    encryptedPayload: Uint8Array,
    pattern: NoiseHandshakePattern = "XX"
  ): NoiseTransportMessage {
    return {
      type: "transport",
      sessionId,
      pattern,
      payload: bytesToBase64(encryptedPayload),
      timestamp: Date.now(),
    };
  }

  /**
   * Create a handshake message.
   *
   * @param sessionId - Session ID
   * @param handshakePayload - Handshake payload bytes
   * @param pattern - Handshake pattern
   * @param index - Handshake message index
   * @returns Handshake message ready for sending
   */
  createHandshakeMessage(
    sessionId: string,
    handshakePayload: Uint8Array,
    pattern: NoiseHandshakePattern,
    index: number
  ): NoiseTransportMessage {
    return {
      type: "handshake",
      sessionId,
      pattern,
      handshakeIndex: index,
      payload: bytesToBase64(handshakePayload),
      timestamp: Date.now(),
    };
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  /**
   * Convert npub to hex pubkey.
   */
  private npubToHex(npub: string): string | null {
    try {
      if (npub.startsWith("npub1")) {
        const decoded = nip19.decode(npub);
        if (decoded.type === "npub") {
          return decoded.data;
        }
      }
      // Assume already hex if not npub
      if (/^[0-9a-f]{64}$/i.test(npub)) {
        return npub.toLowerCase();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Convert hex pubkey to npub.
   */
  private hexToNpub(hex: string): string {
    try {
      return nip19.npubEncode(hex);
    } catch {
      return hex;
    }
  }
}
