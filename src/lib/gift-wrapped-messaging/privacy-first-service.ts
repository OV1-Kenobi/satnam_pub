/**
 * Privacy-First Service for Gift-Wrapped Messaging
 *
 * Consolidated service that combines all messaging functionality for Satnam.pub
 * Integrates with the PrivateCommunicationModal for seamless messaging experience.
 */

export interface PrivacyConsentResponse {
  consentGiven: boolean;
  scope: "direct" | "groups" | "specific-groups";
  specificGroupIds?: string[];
  nip05?: string;
  timestamp: Date;
}

export interface ISatnamPrivacyFirstCommunications {
  sessionId: string;
  isConnected: boolean;
  sendGiftwrappedMessage: (
    config: GiftwrappedMessageConfig
  ) => Promise<MessageResponse>;
  enableNip05Disclosure: (config: Nip05DisclosureConfig) => Promise<void>;
  destroySession: () => Promise<void>;
}

export interface GiftwrappedMessageConfig {
  content: string;
  recipient: string;
  sender: string;
  encryptionLevel: "standard" | "enhanced" | "maximum";
  communicationType: "family" | "individual";
  messageType?: "direct" | "group";
}

export interface MessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  encryptionUsed?: string;
  deliveryMethod?: string;
}

export interface Nip05DisclosureConfig {
  nip05: string;
  scope: "direct" | "groups" | "specific-groups";
  specificGroupIds?: string[];
}

export interface MessagingConfig {
  relays: string[];
  defaultEncryptionLevel: "standard" | "enhanced" | "maximum";
  privacyWarnings: {
    enabled: boolean;
    showForNewContacts: boolean;
    showForGroupMessages: boolean;
  };
}

export const MESSAGING_CONFIG: MessagingConfig = {
  relays: ["wss://relay.satnam.pub", "wss://relay.damus.io", "wss://nos.lol"],
  defaultEncryptionLevel: "enhanced",
  privacyWarnings: {
    enabled: true,
    showForNewContacts: true,
    showForGroupMessages: true,
  },
};

export class PrivacyFirstMessagingService
  implements ISatnamPrivacyFirstCommunications
{
  public sessionId: string;
  public isConnected: boolean = false;
  private apiBaseUrl: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.apiBaseUrl = import.meta.env.VITE_API_URL || "/api";
  }

  async sendGiftwrappedMessage(
    config: GiftwrappedMessageConfig
  ): Promise<MessageResponse> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/giftwrapped`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...config,
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
          }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        return {
          success: true,
          messageId: result.messageId,
          encryptionUsed: result.encryptionUsed,
          deliveryMethod: result.deliveryMethod,
        };
      } else {
        return {
          success: false,
          error: result.error || "Failed to send message",
        };
      }
    } catch (error) {
      console.error("Privacy-first messaging error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async enableNip05Disclosure(config: Nip05DisclosureConfig): Promise<void> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/enable-nip05-disclosure`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...config,
            sessionId: this.sessionId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to enable NIP-05 disclosure");
      }
    } catch (error) {
      console.error("NIP-05 disclosure error:", error);
      throw error;
    }
  }

  async destroySession(): Promise<void> {
    try {
      await fetch(`${this.apiBaseUrl}/communications/destroy-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
        }),
      });
      this.isConnected = false;
    } catch (error) {
      console.error("Failed to destroy session:", error);
    }
  }

  static async createSession(
    nsec: string,
    options?: any
  ): Promise<PrivacyFirstMessagingService | null> {
    try {
      const response = await fetch("/api/communications/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nsec,
          options,
        }),
      });

      const result = await response.json();

      if (response.ok && result.sessionId) {
        const service = new PrivacyFirstMessagingService(result.sessionId);
        service.isConnected = true;
        return service;
      }

      return null;
    } catch (error) {
      console.error("Failed to create session:", error);
      return null;
    }
  }
}

// Export for backwards compatibility with existing code
export { PrivacyFirstMessagingService as SatnamPrivacyFirstCommunications };
