/**
 * Client-Side Message Service
 *
 * Handles gift-wrapped message creation and signing on the client-side
 * before sending to the server. Integrates with hybrid signing system
 * and maintains compatibility with anon-key + custom JWT authentication.
 */

import { hybridMessageSigning, SigningResult } from "./hybrid-message-signing";
// Use CEPS for npub->hex conversion to avoid direct nostr-tools usage here
import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";

import { showToast } from "../../services/toastService";

import { fetchWithAuth } from "../auth/fetch-with-auth";

// Custom error to signal that NIP-59 construction failed and we should try NIP-44 fallback
class Nip59FallbackError extends Error {
  constructor(message = "NIP-59 fallback failed") {
    super(message);
    this.name = "Nip59FallbackError";
  }
}

type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export interface MessageData {
  recipient: string;
  content: string;
  messageType: string;
  encryptionLevel: string;
  communicationType: string;
  /** Optional extra tags to include in the inner event (e.g., imeta, fallback) */
  extraTags?: string[][];
}

import type {
  MessageSendResult,
  MessageDataWithAttachments,
  NIP17MessageContent,
  AttachmentDescriptor,
} from "./types";
export type {
  MessageSendResult,
  MessageDataWithAttachments,
  NIP17MessageContent,
} from "./types";

// Import Blossom utilities for attachment tags
import { buildImetaTag, buildFallbackTag } from "../api/blossom-client";

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

      // Third-tier fallback: NIP-44 direct publish when NIP-17 discovery failed and NIP-59 fallback also failed
      if (error instanceof Nip59FallbackError) {
        try {
          const recipientHex = messageData.recipient.startsWith("npub1")
            ? CEPS.npubToHex(messageData.recipient)
            : messageData.recipient;
          const ciphertext = await (
            CEPS as any
          ).encryptNip44WithActiveSession?.(recipientHex, messageData.content);
          if (
            typeof ciphertext !== "string" ||
            !ciphertext ||
            ciphertext.length < 10
          ) {
            throw new Error("NIP-44 encryption failed");
          }
          if (typeof ciphertext !== "string" || !ciphertext) {
            throw new Error("NIP-44 encryption failed");
          }
          const now = Math.floor(Date.now() / 1000);
          const ev = await (CEPS as any).signEventWithActiveSession?.({
            kind: 4,
            created_at: now,
            tags: [["p", recipientHex]],
            content: ciphertext,
          });
          if (!ev || typeof ev !== "object") {
            throw new Error("NIP-44 sign failed");
          }
          const id = await (CEPS as any).publishOptimized?.(ev, {
            recipientPubHex: recipientHex,
            includeFallback: true,
          });
          try {
            showToast.warning(
              "Sent via NIP-44 fallback (may not appear in server history)",
              { title: "Fallback delivery", duration: 5000 }
            );
          } catch {}
          return {
            success: true,
            messageId: typeof id === "string" ? id : undefined,
            signingMethod: "nip44",
            securityLevel: "standard",
            userMessage:
              "Delivered using NIP-44 fallback. This message might not appear in server threads.",
          } as MessageSendResult;
        } catch (err) {
          console.error("NIP-44 fallback failed:", err);
          return {
            success: false,
            error:
              err instanceof Error ? err.message : "NIP-44 fallback failed",
            userMessage:
              "All delivery methods failed (NIP-17, NIP-59, NIP-44). Please try again later.",
          } as MessageSendResult;
        }
      }

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
    const USE_NIP17 = (import.meta as any).env?.VITE_USE_NIP17 === "true";

    // Normalize recipient to hex for p-tag
    const recipientHex = messageData.recipient.startsWith("npub1")
      ? CEPS.npubToHex(messageData.recipient)
      : messageData.recipient;

    if (USE_NIP17) {
      console.log("🔐 ClientMessageService: Using NIP-17 flow");
      // NIP-17 relay discovery (kind:10050 inbox relays) with TTL cache handled in CEPS
      try {
        const inboxRelays = await (
          CEPS as any
        ).resolveInboxRelaysFromKind10050?.(recipientHex);
        if (!Array.isArray(inboxRelays) || inboxRelays.length === 0) {
          // Recipient not ready for NIP-17; fallback to NIP-59 per requirement
          try {
            showToast.warning(
              "Recipient has no NIP-17 inbox relays (kind 10050). Falling back to NIP-59.",
              { title: "NIP-17 not available", duration: 5000 }
            );
          } catch {}
          // Fallback to NIP-59 construction path
          console.log("🔐 ClientMessageService: Falling back to NIP-59 flow");
          try {
            // Build base tags
            const baseTags: string[][] = [
              ["p", recipientHex],
              ["message-type", messageData.messageType],
              ["encryption-level", messageData.encryptionLevel],
              ["communication-type", messageData.communicationType],
            ];
            // Append any extra tags (e.g., imeta, fallback for attachments)
            const allTags = messageData.extraTags
              ? [...baseTags, ...messageData.extraTags]
              : baseTags;
            const innerEvent: any = {
              kind: 14,
              content: messageData.content,
              tags: allTags,
              created_at: Math.floor(Date.now() / 1000),
            };
            const innerSign = await hybridMessageSigning.signMessage(
              innerEvent
            );
            if (!innerSign.success || !innerSign.signedEvent) {
              throw new Error(
                innerSign.error || "Failed to sign inner DM event"
              );
            }
            const signedInner = innerSign.signedEvent;
            let senderHex: string | null = null;

            if (
              !senderHex &&
              typeof (CEPS as any)?.getUserPubkeyHexForVerification ===
                "function"
            ) {
              try {
                senderHex = await (
                  CEPS as any
                ).getUserPubkeyHexForVerification();
              } catch (err) {
                console.warn("Failed to get pubkey from CEPS:", err);
              }
            }
            if (!senderHex) {
              throw new Error(
                "No sender public key available for NIP-59 wrapping"
              );
            }
            const wrappedFallback = await CEPS.wrapGift59(
              signedInner as any,
              recipientHex
            );
            if (!wrappedFallback || typeof wrappedFallback !== "object") {
              throw new Error("NIP-59 wrapping failed: invalid wrapped event");
            }
            if ((wrappedFallback as any).kind !== 1059) {
              throw new Error(
                `NIP-59 wrapping failed: expected kind 1059, got ${
                  (wrappedFallback as any).kind
                }`
              );
            }
            return wrappedFallback as Partial<NostrEvent>;
          } catch (err) {
            console.warn(
              "NIP-59 fallback failed, will trigger NIP-44 third-tier fallback in sender:",
              err
            );
            throw new Nip59FallbackError(
              "NIP-59 wrapping failed; trigger NIP-44 fallback"
            );
          }
        }
      } catch (e) {
        console.warn("NIP-17 inbox relay discovery error:", e);
      }
      // Proceed with NIP-17 construction (recipient has inbox relays)
      const unsigned14 = CEPS.buildUnsignedKind14DirectMessage(
        messageData.content,
        recipientHex
      );
      try {
        const sealed13 = await CEPS.sealKind13WithActiveSession(
          unsigned14 as any,
          recipientHex
        );
        const wrapped = await CEPS.giftWrap1059(sealed13 as any, recipientHex);
        if (!wrapped || typeof wrapped !== "object") {
          throw new Error("NIP-17 wrapping failed: invalid wrapped event");
        }
        if ((wrapped as any).kind !== 1059) {
          throw new Error(
            `NIP-17 wrapping failed: expected kind 1059, got ${
              (wrapped as any).kind
            }`
          );
        }
        return wrapped as Partial<NostrEvent>;
      } catch (nip17Err) {
        console.warn(
          "NIP-17 sealing/wrapping error; will try NIP-59 fallback:",
          nip17Err
        );
        // Fall through to NIP-59 flow below
      }
    }

    console.log("🔐 ClientMessageService: Using NIP-59 flow");
    // Create the inner event (the actual message)
    // Build base tags
    const baseTagsNip59: string[][] = [
      ["p", recipientHex],
      ["message-type", messageData.messageType],
      ["encryption-level", messageData.encryptionLevel],
      ["communication-type", messageData.communicationType],
    ];
    // Append any extra tags (e.g., imeta, fallback for attachments)
    const allTagsNip59 = messageData.extraTags
      ? [...baseTagsNip59, ...messageData.extraTags]
      : baseTagsNip59;
    const innerEvent: any = {
      kind: 14, // Direct message kind
      content: messageData.content,
      tags: allTagsNip59,
      created_at: Math.floor(Date.now() / 1000),
    };

    // Stage 1: sign the inner DM (NIP-07 preferred, session fallback)
    const innerSign = await hybridMessageSigning.signMessage(innerEvent);
    if (!innerSign.success || !innerSign.signedEvent) {
      throw new Error(innerSign.error || "Failed to sign inner DM event");
    }
    const signedInner = innerSign.signedEvent;

    // Determine sender pubkey hex for wrapping
    let senderHex: string | null = null;

    if (
      !senderHex &&
      typeof (CEPS as any)?.getUserPubkeyHexForVerification === "function"
    ) {
      try {
        senderHex = await (CEPS as any).getUserPubkeyHexForVerification();
      } catch (err) {
        console.warn("Failed to get pubkey from CEPS:", err);
      }
    }
    if (!senderHex) {
      throw new Error("No sender public key available for NIP-59 wrapping");
    }

    // Proper NIP-59: wrap the SIGNED inner event via CEPS (produces kind:1059)
    try {
      const wrapped = await CEPS.wrapGift59(signedInner as any, recipientHex);

      // Validate wrapped event structure
      if (!wrapped || typeof wrapped !== "object") {
        throw new Error("NIP-59 wrapping failed: invalid wrapped event");
      }
      if ((wrapped as any).kind !== 1059) {
        throw new Error(
          `NIP-59 wrapping failed: expected kind 1059, got ${
            (wrapped as any).kind
          }`
        );
      }

      return wrapped as Partial<NostrEvent>;
    } catch (err) {
      console.warn(
        "NIP-59 wrapping failed; will trigger NIP-44 tertiary fallback",
        err
      );
      throw new Nip59FallbackError(
        "NIP-59 wrapping failed; trigger NIP-44 fallback"
      );
    }
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
      const response = await fetchWithAuth(
        `${this.baseUrl}/api/communications/giftwrapped`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
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

  /**
   * Subscribe to NIP-59 gift-wrapped DMs for the recipient and attempt client-side unwrap
   */
  subscribeToGiftWrappedForRecipient(
    recipient: string,
    handlers: {
      onInner?: (inner: NostrEvent) => void;
      onRaw?: (outer: NostrEvent) => void;
      onError?: (error: string) => void;
      onEose?: () => void;
    }
  ): any {
    try {
      const recipientHex = recipient.startsWith("npub1")
        ? CEPS.npubToHex(recipient)
        : recipient;
      const filters = [{ kinds: [1059], "#p": [recipientHex] }];

      return CEPS.subscribeMany([], filters, {
        onevent: async (e: any) => {
          // Structured analytics (no content exposure)
          try {
            console.info("🔓 NIP59-RX: event received", {
              outerId: e?.id,
              kind: e?.kind,
              created_at: e?.created_at,
            });

            const sessionId = CEPS.getActiveSigningSessionId();
            if (!sessionId) {
              console.info("🔓 NIP59-RX: session unavailable; cannot unwrap");
              showToast.info(
                "Cannot decrypt - please sign in to create a secure session",
                { title: "Decryption unavailable", duration: 0 }
              );
              handlers.onError?.("session_unavailable");
              handlers.onRaw?.(e as NostrEvent);
              return;
            }

            // Use CEPS unwrap with the active secure session
            const inner = await CEPS.unwrapGift59WithActiveSession(e as any);

            if (!inner) {
              console.warn(
                "🔓 NIP59-RX: unwrap produced null/undefined inner event"
              );
              showToast.error("Failed to decrypt message: invalid format", {
                title: "Decryption failed",
                duration: 0,
              });
              handlers.onError?.("invalid_format");
              handlers.onRaw?.(e as NostrEvent);
              return;
            }

            // Validate minimal required fields
            const hasMinimal =
              typeof (inner as any).kind === "number" &&
              typeof (inner as any).content === "string";
            if (!hasMinimal) {
              console.warn("🔓 NIP59-RX: inner event missing required fields", {
                innerPreview: {
                  id: (inner as any)?.id,
                  kind: (inner as any)?.kind,
                  pubkey: (inner as any)?.pubkey,
                },
              });
              showToast.error("Failed to decrypt message: invalid format", {
                title: "Invalid message",
                duration: 0,
              });
              handlers.onError?.("invalid_format");
              handlers.onRaw?.(e as NostrEvent);
              return;
            }

            // For NIP-59 path we still try to verify; for NIP-17 inner events may be unsigned
            const isSigned = typeof (inner as any).sig === "string";
            if (isSigned) {
              const validSig = CEPS.verifyEvent(inner as NostrEvent);
              if (!validSig) {
                console.warn("🔓 NIP59-RX: inner signature invalid", {
                  innerId: (inner as any).id,
                });
                showToast.warning(
                  "Message signature invalid - possible tampering",
                  { title: "Verification failed", duration: 0 }
                );
                handlers.onError?.("signature_invalid");
                handlers.onRaw?.(e as NostrEvent);
                return;
              }
              console.info("🔓 NIP59-RX: unwrap and verification successful", {
                outerId: e?.id,
                innerId: (inner as any).id,
              });
            } else {
              // NIP-17: unsigned inner OK
              console.info("🔓 NIP17-RX: unwrap successful (unsigned inner)", {
                outerId: e?.id,
                innerKind: (inner as any)?.kind,
              });
            }
            handlers.onInner?.(inner as NostrEvent);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("🔓 NIP-RX: unwrap error", { error: msg });
            showToast.error(`Failed to decrypt message: ${msg}`, {
              title: "Decryption failed",
              duration: 0,
            });
            handlers.onError?.(msg);
            handlers.onRaw?.(e as NostrEvent);
          }
        },
        oneose: handlers.onEose,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      handlers.onError?.(msg);
      return null;
    }
  }

  /**
   * Subscribe to NIP-17 (sealed) messages: accept unsigned inner events (kinds 14, 15)
   */
  subscribeToNip17ForRecipient(
    recipient: string,
    handlers: {
      onInner?: (inner: NostrEvent) => void;
      onRaw?: (outer: NostrEvent) => void;
      onError?: (error: string) => void;
      onEose?: () => void;
    }
  ): any {
    try {
      const recipientHex = recipient.startsWith("npub1")
        ? CEPS.npubToHex(recipient)
        : recipient;
      const filters = [{ kinds: [1059], "#p": [recipientHex] }];
      return CEPS.subscribeMany([], filters, {
        onevent: async (e: any) => {
          try {
            const sessionId = CEPS.getActiveSigningSessionId();
            if (!sessionId) {
              handlers.onError?.("session_unavailable");
              handlers.onRaw?.(e as NostrEvent);
              return;
            }
            const inner = await CEPS.unwrapGift59WithActiveSession(e as any);
            if (!inner) {
              handlers.onError?.("invalid_format");
              handlers.onRaw?.(e as NostrEvent);
              return;
            }
            const okKind =
              (inner as any).kind === 14 || (inner as any).kind === 15;
            if (!okKind || typeof (inner as any).content !== "string") {
              handlers.onError?.("unsupported_inner");
              handlers.onRaw?.(e as NostrEvent);
              return;
            }
            handlers.onInner?.(inner as NostrEvent);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            handlers.onError?.(msg);
            handlers.onRaw?.(e as NostrEvent);
          }
        },
        oneose: handlers.onEose,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      handlers.onError?.(msg);
      return null;
    }
  }

  /**
   * Send a gift-wrapped message with attachments (NIP-17 compliant).
   *
   * This method:
   * 1. Builds NIP-17 compliant content JSON with text and attachments
   * 2. Adds imeta tags for cross-client compatibility
   * 3. Adds fallback tag for non-Blossom clients
   * 4. Wraps in NIP-59 gift-wrapped envelope
   *
   * @param messageData - Message data with optional attachments
   * @returns Promise<MessageSendResult>
   */
  async sendGiftWrappedMessageWithAttachments(
    messageData: MessageDataWithAttachments
  ): Promise<MessageSendResult> {
    // Build NIP-17 compliant content structure
    const nip17Content: NIP17MessageContent = {
      text: messageData.content,
    };

    if (messageData.attachments && messageData.attachments.length > 0) {
      nip17Content.attachments = messageData.attachments;
    }

    // Convert to JSON for the inner event content
    const contentJson = JSON.stringify(nip17Content);

    // Build tags for cross-client compatibility
    const extraTags: string[][] = [];

    if (messageData.attachments) {
      for (const attachment of messageData.attachments) {
        // Add imeta tag for each attachment (NIP-92/NIP-94 format)
        extraTags.push(buildImetaTag(attachment));
        // Add fallback tag for non-Blossom clients
        extraTags.push(buildFallbackTag(attachment));
      }
    }

    // Create base MessageData with JSON content and extra tags for cross-client compatibility
    const baseMessageData: MessageData = {
      recipient: messageData.recipient,
      content: contentJson,
      messageType: messageData.messageType,
      encryptionLevel: messageData.encryptionLevel,
      communicationType: messageData.communicationType,
      extraTags: extraTags.length > 0 ? extraTags : undefined,
    };

    // Use the existing sendGiftWrappedMessage with JSON content and extra tags
    return this.sendGiftWrappedMessage(baseMessageData);
  }

  /**
   * Parse NIP-17 message content from a received inner event.
   *
   * Handles both:
   * 1. New format: JSON with { text, attachments }
   * 2. Legacy format: Plain text string
   *
   * @param content - Decrypted content string from inner event
   * @returns Parsed NIP-17 content or null if parsing fails
   */
  parseNIP17Content(content: string): NIP17MessageContent | null {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(content);

      // Validate structure
      if (typeof parsed === "object" && parsed !== null) {
        // Check if it's the new NIP-17 format
        if ("text" in parsed || "attachments" in parsed) {
          // Validate text field
          const text = typeof parsed.text === "string" ? parsed.text : "";

          // Validate attachments field
          let attachments = undefined;
          if (parsed.attachments !== undefined) {
            if (Array.isArray(parsed.attachments)) {
              attachments = parsed.attachments;
            } else {
              console.warn(
                "Invalid attachments field (not an array), ignoring"
              );
            }
          }

          return {
            text,
            attachments,
          };
        }
      }

      // If it's not our format, treat whole content as text
      return { text: content };
    } catch {
      // Not JSON, treat as plain text (legacy format)
      return { text: content };
    }
  }
}

// Global instance for easy access
export const clientMessageService = new ClientMessageService();

// Export for use in components
export default ClientMessageService;
