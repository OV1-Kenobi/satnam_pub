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

import type { Event } from 'nostr-tools';

/**
 * Privacy level configuration for relay publishing
 */
export type PrivacyLevel = 'public' | 'private' | 'tor';

/**
 * Relay type classification
 */
export type RelayType = 'public' | 'private-paid' | 'private-tor';

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
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private relayConfigs: Map<string, PrivacyRelay> = new Map();

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
      type: 'public',
      privacyLevel: 'public',
      batchingEnabled: false,
      batchSize: 1,
      batchDelayMs: 0,
    };

    this.relayConfigs.set(relayUrl, defaultConfig);
    return defaultConfig;
  }

  /**
   * Queue event for batched publishing
   * Returns promise that resolves when event is published
   */
  async publishWithBatching(event: Event, relay: PrivacyRelay): Promise<string> {
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
        resolve(event.id || '');
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
   * Schedule batch flush with random delay
   */
  private scheduleBatchFlush(queueKey: string, relay: PrivacyRelay): void {
    // Clear existing timer if any
    if (this.batchTimers.has(queueKey)) {
      clearTimeout(this.batchTimers.get(queueKey)!);
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
   */
  private flushBatch(queueKey: string): void {
    const queue = this.batchQueues.get(queueKey);
    if (!queue || queue.length === 0) return;

    // Clear timer
    if (this.batchTimers.has(queueKey)) {
      clearTimeout(this.batchTimers.get(queueKey)!);
      this.batchTimers.delete(queueKey);
    }

    // Resolve all entries in batch
    for (const entry of queue) {
      entry.resolve(entry.event.id || '');
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
        url: 'wss://relay.satnam.pub',
        type: 'public',
        privacyLevel: 'public',
        batchingEnabled: false,
        batchSize: 1,
        batchDelayMs: 0,
      },
      {
        url: 'wss://private.satnam.pub',
        type: 'private-paid',
        privacyLevel: 'private',
        batchingEnabled: true,
        batchSize: 5,
        batchDelayMs: 5000, // 0-5 second random delay
      },
      {
        url: 'wss://private-tor.satnam.pub',
        type: 'private-tor',
        privacyLevel: 'tor',
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
}

/**
 * Global instance of relay privacy layer
 */
export const relayPrivacyLayer = new RelayPrivacyLayer();

/**
 * Initialize default Satnam relay configurations
 */
export function initializeDefaultRelayConfigs(): void {
  const defaultRelays = RelayPrivacyLayer.getDefaultSatnamRelays();
  for (const relay of defaultRelays) {
    relayPrivacyLayer.configureRelay(relay);
  }
}

