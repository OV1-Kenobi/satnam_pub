/**
 * Client-Side Message Service
 *
 * Handles gift-wrapped message creation and signing on the client-side
 * before sending to the server. Integrates with hybrid signing system
 * and maintains compatibility with anon-key + custom JWT authentication.
 */

import { Event as NostrEvent } from "nostr-tools";
import { hybridMessageSigning, SigningResult } from "./hybrid-message-signing";
// Use CEPS for npub->hex conversion to avoid direct nostr-tools usage here
import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";

export interface MessageData {
  recipient: string;
  content: string;
  messageType: string;
  encryptionLevel: string;
  communicationType: string;
}

export interface MessageSendResult {
  success: boolean;
  messageId?: string;
  signingMethod?: string;
  securityLevel?: string;
  userMessage?: string;
  error?: string;
  deliveryTime?: string;
}

export class ClientMessageService {
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  /**
   * Send a gift-wrapped message with hybrid signing
   * @param messageData - Message data to send
   * @returns Promise<MessageSendResult>
   */
  async sendGiftWrappedMessage(
    messageData: MessageData
  ): Promise<MessageSendResult> {
    try {
      console.log("🔐 ClientMessageService: Starting message send process");
      console.log("🔐 ClientMessageService: Message data:", {
        recipient: messageData.recipient.substring(0, 20) + "...",
        messageType: messageData.messageType,
        encryptionLevel: messageData.encryptionLevel,
      });

      // Step 1: Create unsigned gift-wrapped event
      console.log(
        "🔐 ClientMessageService: Creating unsigned gift-wrapped event"
      );
      const unsignedEvent = await this.createUnsignedGiftWrappedEvent(
        messageData
      );
      console.log(
        "🔐 ClientMessageService: Unsigned event created, kind:",
        unsignedEvent.kind
      );

      // Step 2: Sign the event using hybrid signing approach
      console.log(
        "🔐 ClientMessageService: Attempting to sign message with hybrid approach"
      );
      const signingResult = await hybridMessageSigning.signMessage(
        unsignedEvent
      );

      console.log("🔐 ClientMessageService: Signing result:", {
        success: signingResult.success,
        method: signingResult.method,
        securityLevel: signingResult.securityLevel,
        error: signingResult.error,
      });

      if (!signingResult.success) {
        console.log(
          "🔐 ClientMessageService: Signing failed:",
          signingResult.error
        );
        return {
          success: false,
          error: signingResult.error || "Message signing failed",
          userMessage: signingResult.userMessage,
          signingMethod: signingResult.method,
          securityLevel: signingResult.securityLevel,
        };
      }

      console.log(
        "🔐 ClientMessageService: Message signed successfully with",
        signingResult.method
      );
      console.log(
        "🔐 ClientMessageService: Signed event ID:",
        signingResult.signedEvent?.id
      );

      // Step 3: Send signed event to server for database storage and relay publishing
      console.log(
        "🔐 ClientMessageService: Sending pre-signed message to server"
      );
      const serverResult = await this.sendSignedMessageToServer(
        signingResult.signedEvent!,
        messageData,
        signingResult
      );

      console.log(
        "🔐 ClientMessageService: Server result:",
        serverResult.success ? "SUCCESS" : "FAILED"
      );

      return {
        ...serverResult,
        signingMethod: signingResult.method,
        securityLevel: signingResult.securityLevel,
        userMessage: signingResult.userMessage,
      };
    } catch (error) {
      console.error("🔐 ClientMessageService: Error sending message:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        userMessage: "Failed to send message. Please try again.",
      };
    }
  }

  /**
   * Create unsigned gift-wrapped event structure
   * @param messageData - Message data
   * @returns Promise<Partial<NostrEvent>>
   */
  private async createUnsignedGiftWrappedEvent(
    messageData: MessageData
  ): Promise<Partial<NostrEvent>> {
    // Normalize recipient to hex for p-tag to satisfy nostr-tools validation
    const recipientHex = messageData.recipient.startsWith("npub1")
      ? CEPS.npubToHex(messageData.recipient)
      : messageData.recipient;

    // Create the inner event (actual message)
    const innerEvent = {
      kind: 14, // Direct message kind
      content: messageData.content,
      tags: [
        ["p", recipientHex],
        ["message-type", messageData.messageType],
        ["encryption-level", messageData.encryptionLevel],
        ["communication-type", messageData.communicationType],
      ],
      created_at: Math.floor(Date.now() / 1000),
    };

    // Create the gift-wrapped event (NIP-59)
    const giftWrappedEvent = {
      kind: 1059, // Gift-wrapped event kind
      content: JSON.stringify(innerEvent), // Inner event as content
      tags: [
        ["p", recipientHex], // Recipient must be 64-hex
        ["protocol", "nip59"], // Protocol version
        ["encryption", messageData.encryptionLevel],
      ],
      created_at: Math.floor(Date.now() / 1000),
    };

    return giftWrappedEvent;
  }

  /**
   * Send signed message to server for storage and relay publishing
   * @param signedEvent - Signed Nostr event
   * @param originalMessageData - Original message data
   * @param signingResult - Result from signing process
   * @returns Promise<MessageSendResult>
   */
  private async sendSignedMessageToServer(
    signedEvent: NostrEvent,
    originalMessageData: MessageData,
    signingResult: SigningResult
  ): Promise<MessageSendResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/communications/giftwrapped`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Include authentication headers if available
            ...(await this.getAuthHeaders()),
          },
          body: JSON.stringify({
            // Original message data for server processing
            ...originalMessageData,
            // Pre-signed event data
            signedEvent: signedEvent,
            signingMethod: signingResult.method,
            securityLevel: signingResult.securityLevel,
            // CRITICAL: Mark this as a pre-signed message
            preSigned: true,
            // Additional metadata for server processing
            clientSigned: true,
            hybridSigning: true,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();

      return {
        success: true,
        messageId: result.messageId,
        deliveryTime: result.deliveryTime || new Date().toISOString(),
        userMessage: result.userMessage || "Message sent successfully",
      };
    } catch (error) {
      console.error("🔐 ClientMessageService: Server request failed:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Server communication failed",
        userMessage: "Failed to deliver message to server",
      };
    }
  }

  /**
   * Get authentication headers for API requests
   * @returns Promise<Record<string, string>>
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    // Try to get JWT token from various sources
    const token = await this.getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Get authentication token from SecureTokenManager (memory-only storage)
   * @returns Promise<string | null>
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      // Use SecureTokenManager for consistent token access (same as working endpoints)
      const { SecureTokenManager } = await import(
        "../auth/secure-token-manager"
      );
      const token = await SecureTokenManager.silentRefresh();
      if (token) return token;
      return SecureTokenManager.getAccessToken();
    } catch (error) {
      console.warn("Failed to get token from SecureTokenManager:", error);

      // Fallback to storage-based tokens (legacy compatibility)
      if (typeof window !== "undefined" && window.sessionStorage) {
        const sessionData = sessionStorage.getItem("satnam_session");
        if (sessionData) {
          try {
            const parsed = JSON.parse(sessionData);
            return parsed.sessionToken || parsed.token;
          } catch (error) {
            console.warn("Failed to parse session data:", error);
          }
        }
      }

      // Try localStorage as final fallback
      if (typeof window !== "undefined" && window.localStorage) {
        return localStorage.getItem("satnam_auth_token");
      }

      return null;
    }
  }

  /**
   * Check if any signing method is available
   * @returns Promise<boolean>
   */
  async hasAvailableSigningMethod(): Promise<boolean> {
    return await hybridMessageSigning.hasAvailableSigningMethod();
  }

  /**
   * Get available signing methods for user education
   * @returns Promise<SigningMethodInfo[]>
   */
  async getAvailableSigningMethods() {
    return await hybridMessageSigning.getAvailableSigningMethods();
  }
}

// Global instance for easy access
export const clientMessageService = new ClientMessageService();

// Export for use in components
export default ClientMessageService;
