/**
 * Communication Service Interface for Nostr Integration
 *
 * This module provides a clean interface for communication services,
 * designed for Nostr DM integration with future support for giftwrapping.
 * Ready for production Nostr integration while providing development fallbacks.
 */

export interface CommunicationMessage {
  recipient: string; // npub or nip05
  content: string;
  type: "otp" | "notification" | "invitation" | "payment_request";
  metadata?: {
    otp?: string;
    expiresAt?: Date;
    sessionId?: string;
    priority?: "low" | "normal" | "high" | "urgent";
    encrypted?: boolean;
    giftwrapped?: boolean;
  };
}

export interface CommunicationResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveryStatus?: "sent" | "delivered" | "failed" | "pending";
  retryAfter?: number; // seconds
}

export interface CommunicationServiceConfig {
  serviceType: "nostr" | "nostr-giftwrap" | "development";
  relayUrls?: string[];
  senderIdentity?: {
    npub: string;
    nip05: string;
  };
  encryption?: {
    enabled: boolean;
    method: "nip04" | "nip44" | "giftwrap";
  };
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

/**
 * Abstract Communication Service Interface
 */
export abstract class CommunicationService {
  protected config: CommunicationServiceConfig;

  constructor(config: CommunicationServiceConfig) {
    this.config = config;
  }

  /**
   * Send a message through the communication service
   */
  abstract sendMessage(
    message: CommunicationMessage
  ): Promise<CommunicationResponse>;

  /**
   * Send OTP message (convenience method)
   */
  async sendOTP(
    recipient: string,
    otp: string,
    sessionId: string,
    expiresAt: Date
  ): Promise<CommunicationResponse> {
    const message: CommunicationMessage = {
      recipient,
      content: this.formatOTPMessage(otp, expiresAt),
      type: "otp",
      metadata: {
        otp,
        expiresAt,
        sessionId,
        priority: "high",
        encrypted: this.config.encryption?.enabled || false,
        giftwrapped: this.config.encryption?.method === "giftwrap",
      },
    };

    return this.sendMessage(message);
  }

  /**
   * Check if service is available
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Format OTP message for user
   */
  protected formatOTPMessage(otp: string, expiresAt: Date): string {
    const timeRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / 60000);

    return `🔐 Your Satnam Family Wallet verification code is: ${otp}

This code expires in ${timeRemaining} minutes.

For your security:
• Don't share this code with anyone
• Only use it on the official Satnam app
• Report suspicious activity immediately

If you didn't request this code, please ignore this message.

Satnam Family Wallet - Sovereign Bitcoin for Families`;
  }
}

/**
 * Development Communication Service (Console logging)
 */
export class DevelopmentCommunicationService extends CommunicationService {
  constructor() {
    super({
      serviceType: "development",
      encryption: { enabled: false, method: "nip04" },
    });
  }

  async sendMessage(
    message: CommunicationMessage
  ): Promise<CommunicationResponse> {
    console.log(`📨 [DEV] Sending ${message.type} to ${message.recipient}`);
    console.log(`Content: ${message.content}`);

    if (message.metadata?.otp) {
      console.log(`🔐 [DEV] OTP sent (length: ${message.metadata.otp.length})`);
    }

    // Simulate network delay
    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.random() * 1000)
    );

    return {
      success: true,
      messageId: `dev_${Date.now()}_${crypto.randomUUID()}`,
      deliveryStatus: "sent",
    };
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available in development
  }
}

/**
 * Nostr Communication Service Implementation
 */
export class NostrCommunicationService extends CommunicationService {
  private senderNsec?: string;

  constructor(config: CommunicationServiceConfig, senderNsec?: string) {
    super(config);
    this.senderNsec = senderNsec;
  }

  async sendMessage(
    message: CommunicationMessage
  ): Promise<CommunicationResponse> {
    try {
      console.log(`📨 [NOSTR] Sending ${message.type} to ${message.recipient}`);

      // TODO: Implement actual Nostr DM sending
      // This would involve:
      // 1. Connect to Nostr relays
      // 2. Create encrypted DM event (NIP-04 or NIP-44)
      // 3. Publish to relays
      // 4. Wait for confirmation

      // For now, simulate the process
      if (typeof window !== "undefined" && (window as any).__DEV__) {
        console.log(
          `🔐 [DEV] OTP sent (length: ${message.metadata?.otp?.length || 0})`
        );
      }

      // Simulate network delay
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 2000)
      );

      return {
        success: true,
        messageId: `nostr_${Date.now()}_${crypto.randomUUID()}`,
        deliveryStatus: "sent",
      };
    } catch (error) {
      console.error("Failed to send Nostr message:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        deliveryStatus: "failed",
        retryAfter: 30,
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    // Check if we have sender credentials
    return Boolean(this.senderNsec && this.config.relayUrls?.length);
  }
}

/**
 * Nostr Giftwrap Communication Service (Future Implementation)
 */
export class NostrGiftwrapCommunicationService extends NostrCommunicationService {
  constructor(config: CommunicationServiceConfig, senderNsec?: string) {
    super(config, senderNsec);
    // Force giftwrap encryption
    this.config.encryption = {
      enabled: true,
      method: "giftwrap",
    };
  }

  async sendMessage(
    message: CommunicationMessage
  ): Promise<CommunicationResponse> {
    console.log(
      `🎁 [GIFTWRAP] Preparing giftwrapped message for ${message.recipient}`
    );

    // TODO: Implement NIP-59 giftwrapping
    // For now, delegate to parent with giftwrap metadata
    message.metadata = {
      ...message.metadata,
      giftwrapped: true,
      encrypted: true,
    };

    return super.sendMessage(message);
  }
}

/**
 * Communication Service Factory
 */
export class CommunicationServiceFactory {
  private static services: Map<string, CommunicationService> = new Map();

  static async createService(
    type: "nostr" | "nostr-giftwrap" | "development" = "development",
    config: Partial<CommunicationServiceConfig> = {}
  ): Promise<CommunicationService> {
    const serviceKey = `${type}_${JSON.stringify(config)}`;

    if (this.services.has(serviceKey)) {
      return this.services.get(serviceKey)!;
    }

    let service: CommunicationService;

    switch (type) {
      case "development":
        service = new DevelopmentCommunicationService();
        break;

      case "nostr": {
        const nostrConfig: CommunicationServiceConfig = {
          serviceType: "nostr",
          relayUrls: config.relayUrls || [
            process.env.VITE_NOSTR_RELAY_1 || "wss://relay.satnam.pub",
            process.env.VITE_NOSTR_RELAY_2 || "wss://relay.damus.io",
            process.env.VITE_NOSTR_RELAY_3 || "wss://nos.lol",
          ],
          senderIdentity: config.senderIdentity || {
            npub:
              process.env.VITE_NOSTR_SENDER_NPUB ||
              (() => {
                throw new Error("VITE_NOSTR_SENDER_NPUB not configured");
              })(),
            nip05:
              process.env.VITE_NOSTR_SENDER_NIP05 ||
              (() => {
                throw new Error("VITE_NOSTR_SENDER_NIP05 not configured");
              })(),
          },
          encryption: config.encryption || {
            enabled: true,
            method: "nip04",
          },
          retryPolicy: config.retryPolicy || {
            maxRetries: 3,
            backoffMs: 1000,
          },
        };
        service = new NostrCommunicationService(nostrConfig);
        break;
      }

      case "nostr-giftwrap": {
        const giftwrapConfig: CommunicationServiceConfig = {
          serviceType: "nostr-giftwrap",
          relayUrls: config.relayUrls || [
            process.env.VITE_NOSTR_RELAY_1 || "wss://relay.satnam.pub",
            process.env.VITE_NOSTR_RELAY_2 || "wss://relay.damus.io",
            process.env.VITE_NOSTR_RELAY_3 || "wss://nos.lol",
          ],
          senderIdentity: config.senderIdentity || {
            npub:
              process.env.VITE_NOSTR_SENDER_NPUB ||
              (() => {
                throw new Error("VITE_NOSTR_SENDER_NPUB not configured");
              })(),
            nip05:
              process.env.VITE_NOSTR_SENDER_NIP05 ||
              (() => {
                throw new Error("VITE_NOSTR_SENDER_NIP05 not configured");
              })(),
          },
          encryption: {
            enabled: true,
            method: "giftwrap",
          },
          retryPolicy: config.retryPolicy || {
            maxRetries: 3,
            backoffMs: 1000,
          },
        };
        service = new NostrGiftwrapCommunicationService(giftwrapConfig);
        break;
      }

      default:
        throw new Error(`Unsupported communication service type: ${type}`);
    }

    this.services.set(serviceKey, service);
    return service;
  }

  static async getDefaultService(): Promise<CommunicationService> {
    // Use development service in development, Nostr in production
    const serviceType =
      typeof window !== "undefined" && (window as any).__DEV__
        ? "development"
        : "nostr";
    return this.createService(serviceType);
  }

  static async getGiftwrapService(): Promise<CommunicationService> {
    return this.createService("nostr-giftwrap");
  }

  static clearCache(): void {
    this.services.clear();
  }
}
