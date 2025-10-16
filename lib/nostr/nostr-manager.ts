// Browser-compatible Nostr manager for handling Nostr events and relays
// NO Node.js dependencies - uses Web Crypto API and WebSocket

import { central_event_publishing_service as CEPS } from "../central_event_publishing_service";

import { config } from "../../config";
import { logPrivacyOperation } from "../privacy/encryption";

// Nostr event interface
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

// Nostr relay interface
export interface NostrRelay {
  url: string;
  status: "connected" | "disconnected" | "connecting";
  lastSeen: number;
  latency: number;
}

// Nostr filter interface
export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
}

// Nostr manager class
export class NostrManager {
  private relays: Map<string, NostrRelay> = new Map();
  private connections: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, any> = new Map();
  private eventHandlers: Map<string, (event: NostrEvent) => void> = new Map();

  constructor() {
    this.initializeDefaultRelays();
  }

  /**
   * Initialize default relays
   */
  private initializeDefaultRelays(): void {
    const defaultRelays = config.nostr.relays;

    defaultRelays.forEach((url) => {
      this.relays.set(url, {
        url,
        status: "disconnected",
        lastSeen: 0,
        latency: 0,
      });
    });
  }

  /**
   * Connect to a relay
   */
  async connectToRelay(url: string): Promise<boolean> {
    try {
      if (this.connections.has(url)) {
        return true;
      }

      const relay = this.relays.get(url) || {
        url,
        status: "disconnected",
        lastSeen: 0,
        latency: 0,
      };

      relay.status = "connecting";
      this.relays.set(url, relay);

      const ws = new WebSocket(url);

      ws.onopen = () => {
        relay.status = "connected";
        relay.lastSeen = Date.now();
        this.relays.set(url, relay);
        this.connections.set(url, ws);

        logPrivacyOperation({
          action: "nostr_relay_connected",
          dataType: "relay",
          success: true,
        });
      };

      ws.onclose = () => {
        relay.status = "disconnected";
        this.relays.set(url, relay);
        this.connections.delete(url);

        logPrivacyOperation({
          action: "nostr_relay_disconnected",
          dataType: "relay",
          success: true,
        });
      };

      ws.onerror = (error) => {
        relay.status = "disconnected";
        this.relays.set(url, relay);
        this.connections.delete(url);

        logPrivacyOperation({
          action: "nostr_relay_error",
          dataType: "relay",
          success: false,
        });
      };

      ws.onmessage = (event) => {
        this.handleRelayMessage(url, event.data);
      };

      return true;
    } catch (error) {
      console.error("Failed to connect to relay:", error);
      return false;
    }
  }

  /**
   * Handle relay message
   */
  private handleRelayMessage(relayUrl: string, data: string): void {
    try {
      const message = JSON.parse(data);

      if (Array.isArray(message)) {
        const [type, subscriptionId, ...rest] = message;

        switch (type) {
          case "EVENT":
            const event = rest[0] as NostrEvent;
            this.handleEvent(event);
            break;
          case "EOSE":
            this.handleEOSE(subscriptionId);
            break;
          case "NOTICE":
            console.log("Relay notice:", rest[0]);
            break;
        }
      }
    } catch (error) {
      console.error("Failed to parse relay message:", error);
    }
  }

  /**
   * Handle Nostr event
   */
  private handleEvent(event: NostrEvent): void {
    // Validate event signature
    if (!this.validateEventSignature(event)) {
      console.warn("Invalid event signature:", event.id);
      return;
    }

    // Call registered event handlers
    this.eventHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error("Event handler error:", error);
      }
    });

    logPrivacyOperation({
      action: "nostr_event_received",
      dataType: "event",
      success: true,
    });
  }

  /**
   * Handle EOSE (End of Stored Events)
   */
  private handleEOSE(subscriptionId: string): void {
    console.log("EOSE received for subscription:", subscriptionId);
  }

  /**
   * Validate event signature
   * - Performs schema sanity checks
   * - Normalizes npub to hex if needed
   * - Uses CEPS.verifyEvent for canonical verification
   */
  private validateEventSignature(event: NostrEvent): boolean {
    try {
      if (!event || typeof event !== "object") return false;
      if (!event.id || !event.sig || !event.pubkey) return false;
      if (typeof event.kind !== "number" || !Array.isArray(event.tags))
        return false;

      const ev: any = { ...event };
      // Normalize pubkey if provided as npub
      if (typeof ev.pubkey === "string" && ev.pubkey.startsWith("npub1")) {
        try {
          ev.pubkey = CEPS.decodeNpub(ev.pubkey);
        } catch {
          return false;
        }
      }

      // Basic created_at sanity: allow +/- 24h clock skew
      const now = Math.floor(Date.now() / 1000);
      if (
        typeof ev.created_at !== "number" ||
        ev.created_at < now - 86400 ||
        ev.created_at > now + 86400
      ) {
        // Do not fail hard; some relays may replay old events
        // But still proceed to cryptographic verification
      }

      return CEPS.verifyEvent(ev as any);
    } catch (e) {
      return false;
    }
  }

  /**
   * Subscribe to events
   */
  async subscribe(
    filter: NostrFilter,
    handler: (event: NostrEvent) => void
  ): Promise<string> {
    const subscriptionId = this.generateSubscriptionId();
    this.eventHandlers.set(subscriptionId, handler);

    const message = ["REQ", subscriptionId, filter];

    // Send to all connected relays
    for (const [url, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }

    this.subscriptions.set(subscriptionId, filter);

    logPrivacyOperation({
      action: "nostr_subscription_created",
      dataType: "subscription",
      success: true,
    });

    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const message = ["CLOSE", subscriptionId];

    // Send to all connected relays
    for (const [url, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }

    this.eventHandlers.delete(subscriptionId);
    this.subscriptions.delete(subscriptionId);

    logPrivacyOperation({
      action: "nostr_subscription_closed",
      dataType: "subscription",
      success: true,
    });
  }

  /**
   * Publish event
   */
  async publishEvent(event: Omit<NostrEvent, "id" | "sig">): Promise<string> {
    try {
      // Generate event ID
      const eventData = {
        ...event,
        id: await this.generateEventId(event),
      };

      // Sign event
      const signedEvent = await this.signEvent(eventData);

      const message = ["EVENT", signedEvent];

      // Send to all connected relays
      for (const [url, ws] of this.connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      }

      logPrivacyOperation({
        action: "nostr_event_published",
        dataType: "event",
        success: true,
      });

      return signedEvent.id;
    } catch (error) {
      console.error("Failed to publish event:", error);
      logPrivacyOperation({
        action: "nostr_event_publish_failed",
        dataType: "event",
        success: false,
      });
      throw error;
    }
  }

  /**
   * Generate event ID
   */
  private async generateEventId(
    event: Omit<NostrEvent, "id" | "sig">
  ): Promise<string> {
    const eventString = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content,
    ]);

    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(eventString)
    );
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Sign event
   */
  private async signEvent(event: Omit<NostrEvent, "sig">): Promise<NostrEvent> {
    // TODO: Implement proper signing with private key from Vault
    // For now, return unsigned event
    return {
      ...event,
      sig: "placeholder_signature",
    };
  }

  /**
   * Generate subscription ID
   */
  private generateSubscriptionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Get connected relays
   */
  getConnectedRelays(): NostrRelay[] {
    return Array.from(this.relays.values()).filter(
      (relay) => relay.status === "connected"
    );
  }

  /**
   * Disconnect from all relays
   */
  disconnectAll(): void {
    for (const [url, ws] of this.connections) {
      ws.close();
    }
    this.connections.clear();

    for (const relay of this.relays.values()) {
      relay.status = "disconnected";
    }
  }
}

// Export singleton instance
export const nostrManager = new NostrManager();
export default nostrManager;
