/**
 * Relay Privacy Layer
 *
 * Implements configurable privacy levels for Nostr event publishing with per-relay batching.
 * Supports three relay types: public, private-paid, and private-tor.
 *
 * Privacy Levels:
 * - 'public': No batching, direct publish (default)
 * - 'private': Event batching with random delays (0-5s) to obscure timing patterns
 * - 'tor': Maximum privacy with batching and Tor relay routing
 */

import type { Event } from "nostr-tools";

/**
 * Privacy level configuration for relay publishing
 */
export type PrivacyLevel = "public" | "private" | "tor";

/**
 * Relay type classification
 */
export type RelayType = "public" | "private-paid" | "private-tor";

/**
 * Privacy-configured relay definition
 */
export interface PrivacyRelay {
  url: string;
  type: RelayType;
  privacyLevel: PrivacyLevel;
  batchingEnabled: boolean;
  batchSize: number;
  batchDelayMs: number; // Random delay range: 0 to batchDelayMs
}

/**
 * Batched event queue entry
 */
interface BatchedEventEntry {
  event: Event;
  relay: PrivacyRelay;
  timestamp: number;
  resolve: (id: string) => void;
  reject: (error: Error) => void;
}

/**
 * Relay Privacy Layer Manager
 *
 * Manages event batching and privacy-level configuration per relay.
 * Ensures timing patterns are obscured for privacy-sensitive relays.
 */
export class RelayPrivacyLayer {
  private batchQueues: Map<string, BatchedEventEntry[]> = new Map();
  private batchTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private relayConfigs: Map<string, PrivacyRelay> = new Map();
  private publishCallback?: (event: Event, relayUrl: string) => Promise<void>;

  /**
   * Initialize with optional publish callback
   * @param publishCallback - Function to publish events to relay (e.g., via WebSocket)
   */
  constructor(
    publishCallback?: (event: Event, relayUrl: string) => Promise<void>
  ) {
    this.publishCallback = publishCallback;
  }

  /**
   * Configure a relay with privacy settings
   */
  configureRelay(relay: PrivacyRelay): void {
    this.relayConfigs.set(relay.url, relay);
  }

  /**
   * Get relay configuration or create default
   */
  getRelayConfig(relayUrl: string): PrivacyRelay {
    if (this.relayConfigs.has(relayUrl)) {
      return this.relayConfigs.get(relayUrl)!;
    }

    // Default: public relay, no batching
    const defaultConfig: PrivacyRelay = {
      url: relayUrl,
      type: "public",
      privacyLevel: "public",
      batchingEnabled: false,
      batchSize: 1,
      batchDelayMs: 0,
    };

    this.relayConfigs.set(relayUrl, defaultConfig);
    return defaultConfig;
  }

  /**
   * Queue event for batched publishing
   * Returns promise that resolves when event is published to relay
   * Rejects if no publish callback is configured or if publishing fails
   */
  async publishWithBatching(
    event: Event,
    relay: PrivacyRelay
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const entry: BatchedEventEntry = {
        event,
        relay,
        timestamp: Date.now(),
        resolve,
        reject,
      };

      if (!relay.batchingEnabled) {
        // Direct publish without batching
        this.publishEvent(event, relay).then(
          () => resolve(event.id || ""),
          (error) => reject(error)
        );
        return;
      }

      // Add to batch queue
      const queueKey = relay.url;
      if (!this.batchQueues.has(queueKey)) {
        this.batchQueues.set(queueKey, []);
      }

      const queue = this.batchQueues.get(queueKey)!;
      queue.push(entry);

      // Check if batch is full
      if (queue.length >= relay.batchSize) {
        this.flushBatch(queueKey);
      } else {
        // Schedule batch flush with random delay
        this.scheduleBatchFlush(queueKey, relay);
      }
    });
  }

  /**
   * Publish a single event to relay
   * Uses configured publish callback or throws error if not configured
   */
  private async publishEvent(event: Event, relay: PrivacyRelay): Promise<void> {
    if (!this.publishCallback) {
      throw new Error(
        `No publish callback configured for RelayPrivacyLayer. Cannot publish event to ${relay.url}`
      );
    }

    try {
      await this.publishCallback(event, relay.url);
    } catch (error) {
      throw new Error(
        `Failed to publish event to ${relay.url}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Schedule batch flush with random delay
   * CRITICAL: Only schedules if no timer is already active
   * Prevents timer reset on continuous trickle of events
   */
  private scheduleBatchFlush(queueKey: string, relay: PrivacyRelay): void {
    // Only schedule if no timer is active
    // This prevents the timer from perpetually resetting if events arrive continuously
    if (this.batchTimers.has(queueKey)) {
      return;
    }

    // Random delay between 0 and batchDelayMs
    const delay = Math.random() * relay.batchDelayMs;

    const timer = setTimeout(() => {
      this.flushBatch(queueKey);
    }, delay);

    this.batchTimers.set(queueKey, timer);
  }

  /**
   * Flush all batched events for a relay
   * Publishes all queued events and resolves/rejects their promises
   */
  private async flushBatch(queueKey: string): Promise<void> {
    const queue = this.batchQueues.get(queueKey);
    if (!queue || queue.length === 0) return;

    // Clear timer
    if (this.batchTimers.has(queueKey)) {
      clearTimeout(this.batchTimers.get(queueKey)!);
      this.batchTimers.delete(queueKey);
    }

    // Publish all events in batch
    for (const entry of queue) {
      try {
        await this.publishEvent(entry.event, entry.relay);
        entry.resolve(entry.event.id || "");
      } catch (error) {
        entry.reject(
          error instanceof Error ? error : new Error("Unknown publishing error")
        );
      }
    }

    // Clear queue
    this.batchQueues.delete(queueKey);
  }

  /**
   * Get default Satnam relay configurations
   * Includes public, private-paid, and private-tor options
   */
  static getDefaultSatnamRelays(): PrivacyRelay[] {
    return [
      {
        url: "wss://relay.satnam.pub",
        type: "public",
        privacyLevel: "public",
        batchingEnabled: false,
        batchSize: 1,
        batchDelayMs: 0,
      },
      {
        url: "wss://private.satnam.pub",
        type: "private-paid",
        privacyLevel: "private",
        batchingEnabled: true,
        batchSize: 5,
        batchDelayMs: 5000, // 0-5 second random delay
      },
      {
        url: "wss://private-tor.satnam.pub",
        type: "private-tor",
        privacyLevel: "tor",
        batchingEnabled: true,
        batchSize: 10,
        batchDelayMs: 5000, // 0-5 second random delay
      },
    ];
  }

  /**
   * Flush all pending batches (for cleanup/shutdown)
   */
  flushAll(): void {
    for (const queueKey of this.batchQueues.keys()) {
      this.flushBatch(queueKey);
    }
  }

  /**
   * Set or update the publish callback
   * CRITICAL: Must be called before publishing events
   */
  setPublishCallback(
    callback: (event: Event, relayUrl: string) => Promise<void>
  ): void {
    this.publishCallback = callback;
  }
}

/**
 * Global instance of relay privacy layer
 * CRITICAL: Must be initialized with a publish callback before use
 */
export const relayPrivacyLayer = new RelayPrivacyLayer();

/**
 * Initialize relay privacy layer with publish callback and default relay configurations
 * CRITICAL: Must be called before publishing events
 */
export function initializeRelayPrivacyLayer(
  publishCallback: (event: Event, relayUrl: string) => Promise<void>
): void {
  relayPrivacyLayer.setPublishCallback(publishCallback);
  const defaultRelays = RelayPrivacyLayer.getDefaultSatnamRelays();
  for (const relay of defaultRelays) {
    relayPrivacyLayer.configureRelay(relay);
  }
}

/**
 * Initialize default Satnam relay configurations only
 * @deprecated Use initializeRelayPrivacyLayer instead to ensure publish callback is set
 */
export function initializeDefaultRelayConfigs(): void {
  const defaultRelays = RelayPrivacyLayer.getDefaultSatnamRelays();
  for (const relay of defaultRelays) {
    relayPrivacyLayer.configureRelay(relay);
  }
}
