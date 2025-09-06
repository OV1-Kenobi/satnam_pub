import SecureTokenManager from "./auth/secure-token-manager";

export interface GiftwrappedMessageConfig {
  content: string;
  recipient: string;
  sender: string;
  encryptionLevel: "standard" | "enhanced" | "maximum";
  communicationType: "family" | "individual";
  signedProof?: {
    signature: string;
    pubkey: string;
    timestamp: number;
    nonce?: string; // Added nonce for additional security
  };
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
  private apiBaseUrl =
    (typeof process !== "undefined" &&
      process.env &&
      process.env.VITE_API_BASE_URL) ||
    import.meta.env.VITE_API_URL ||
    "/api";
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
      console.log(
        "🔐 GiftwrappedCommunicationService: Using ClientMessageService for hybrid signing"
      );

      // Use the ClientMessageService which handles hybrid signing
      const { clientMessageService } = await import(
        "./messaging/client-message-service"
      );

      const messageData = {
        recipient: config.recipient,
        content: config.content,
        messageType: "direct" as const,
        encryptionLevel: config.encryptionLevel || "maximum",
        communicationType: config.communicationType || "individual",
      };

      const result = await clientMessageService.sendGiftWrappedMessage(
        messageData
      );

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
        encryptionUsed: messageData.encryptionLevel,
        deliveryMethod: result.signingMethod || "hybrid",
      };
    } catch (error) {
      console.error("Giftwrapped communication error:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Network error occurred",
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
      const token = SecureTokenManager.getAccessToken();
      const response = await fetch(
        `${this.apiBaseUrl}/communications/get-contacts?memberId=current-user`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
      const contentType = response.headers.get("content-type") || "";
      const result = contentType.includes("application/json")
        ? await response.json().catch(async () => ({
            success: false,
            error: await response.text().catch(() => "Invalid JSON"),
          }))
        : {
            success: false,
            error: await response.text().catch(() => `HTTP ${response.status}`),
          };
      if (!response.ok) {
        throw new Error(
          result && (result as any).error
            ? (result as any).error
            : `HTTP ${response.status}`
        );
      }
      if (!result.success || !Array.isArray(result.contacts)) return [];

      // Decrypt contacts using per-record salt/iv and return UI-friendly objects
      const { decryptSensitiveData } = await import("./privacy/encryption");

      const decrypted = await Promise.all(
        result.contacts.map(async (row: any) => {
          try {
            const decryptedJson = await decryptSensitiveData({
              encrypted: row.encrypted_contact,
              salt: row.contact_encryption_salt,
              iv: row.contact_encryption_iv,
              tag: "",
            });
            const payload = JSON.parse(decryptedJson || "{}");
            const npub: string = payload.npub || "";
            const displayName: string =
              payload.displayName ||
              payload.nip05 ||
              (npub ? `${npub.slice(0, 12)}…` : "Contact");

            return {
              id: row.id,
              username: displayName,
              npub,
              supportsGiftWrap: !!row.supports_gift_wrap,
              trustLevel: row.trust_level || "unverified",
              relationshipType: row.family_role || "contact",
            };
          } catch (e) {
            console.warn("Contact decrypt failed", e);
            return {
              id: row.id,
              username: "Contact",
              npub: "",
              supportsGiftWrap: !!row.supports_gift_wrap,
              trustLevel: row.trust_level || "unverified",
              relationshipType: row.family_role || "contact",
            };
          }
        })
      );

      return decrypted;
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
