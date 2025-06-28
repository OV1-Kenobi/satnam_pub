export interface GiftwrappedMessageConfig {
  content: string;
  recipient: string;
  sender: string;
  encryptionLevel: "standard" | "enhanced" | "maximum";
  communicationType: "family" | "individual";
}

export class GiftwrappedCommunicationService {
  private apiBaseUrl = import.meta.env.VITE_API_URL || "/api";

  async sendGiftwrappedMessage(config: GiftwrappedMessageConfig): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
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
            timestamp: new Date().toISOString(),
          }),
        }
      );
      const result = await response.json();

      if (response.ok) {
        return {
          success: true,
          messageId: result.messageId,
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
