export interface GiftwrappedMessageConfig {
  content: string;
  recipient: string;
  sender: string;
  encryptionLevel: "standard" | "enhanced" | "maximum";
  communicationType: "family" | "individual";
}

export interface GiftWrappedMessage {
  id: string;
  content: string;
  sender: string;
  recipient: string;
  privacyLevel: "standard" | "enhanced" | "maximum";
  timestamp: Date;
  encryptionUsed?: string;
  deliveryMethod?: string;
  type: "individual" | "group";
}

export class GiftwrappedCommunicationService {
  private apiBaseUrl = import.meta.env.VITE_API_URL || "/api";
  private relays: string[];

  constructor() {
    this.relays = [
      "wss://relay.satnam.pub",
      "wss://relay.damus.io",
      "wss://nos.lol",
    ];
  }

  // Web Crypto API instead of Node.js crypto
  generateId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  async sendGiftwrappedMessage(config: GiftwrappedMessageConfig): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
    encryptionUsed?: string;
    deliveryMethod?: string;
  }> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/giftwrapped`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: config.content,
            recipient: config.recipient,
            sender: config.sender,
            encryptionLevel: config.encryptionLevel,
            communicationType: config.communicationType,
            messageId: this.generateId(),
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
      console.error("Giftwrapped communication error:", error);
      return {
        success: false,
        error: "Network error occurred",
      };
    }
  }

  async detectGiftWrapSupport(npub: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/check-giftwrap-support?npub=${npub}`
      );
      if (!response.ok) {
        return false;
      }
      const result = await response.json();
      return result.supportsGiftWrap || false;
    } catch {
      return false; // Default to false if detection fails
    }
  }

  async loadContacts(memberId: string): Promise<any[]> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/get-contacts?memberId=${memberId}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result.success ? result.contacts : [];
    } catch (error) {
      console.error("Failed to load contacts:", error);
      return [];
    }
  }

  async addContact(
    contactData: any,
    ownerId: string
  ): Promise<{ success: boolean; contact?: any }> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/add-contact`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...contactData,
            ownerId,
            supportsGiftWrap: await this.detectGiftWrapSupport(
              contactData.npub
            ),
          }),
        }
      );

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to add contact:", error);
      return { success: false };
    }
  }

  async createGiftWrappedMessage(
    content: string,
    sender: string,
    recipient: string,
    privacyLevel: "standard" | "enhanced" | "maximum",
    type: "individual" | "group" = "individual"
  ): Promise<GiftWrappedMessage> {
    const messageId = this.generateId();

    const config: GiftwrappedMessageConfig = {
      content,
      sender,
      recipient,
      encryptionLevel: privacyLevel,
      communicationType: type === "group" ? "family" : "individual",
    };

    const result = await this.sendGiftwrappedMessage(config);

    return {
      id: result.messageId || messageId,
      content,
      sender,
      recipient,
      privacyLevel,
      timestamp: new Date(),
      encryptionUsed: result.encryptionUsed,
      deliveryMethod: result.deliveryMethod,
      type,
    };
  }

  async getPrivacyMetrics(userNpub: string): Promise<{
    messagesEncrypted: number;
    metadataProtected: number;
    zeroKnowledgeProofs: number;
  }> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/communications/privacy-metrics?npub=${userNpub}`
      );
      const metrics = await response.json();

      return {
        messagesEncrypted: metrics.messagesEncrypted || 0,
        metadataProtected: metrics.metadataProtected || 0,
        zeroKnowledgeProofs: metrics.zeroKnowledgeProofs || 0,
      };
    } catch (error) {
      console.error("Failed to load privacy metrics:", error);
      return {
        messagesEncrypted: 0,
        metadataProtected: 0,
        zeroKnowledgeProofs: 0,
      };
    }
  }
}
