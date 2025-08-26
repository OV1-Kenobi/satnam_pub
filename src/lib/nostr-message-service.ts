/**
 * MASTER CONTEXT COMPLIANCE: Nostr Message Service
 *
 * Privacy-first message sending with multiple encryption levels
 * Implements NIP-04 (Encrypted DMs), NIP-59 (Gift Wrapped), and standard messaging
 * Uses authenticated user's encrypted nsec from user_identities table with existing decryption utilities
 * All operations use browser-compatible APIs only
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/curves/utils";
import { finalizeEvent, nip04, nip19 } from "nostr-tools";
import { PrivacyLevel } from "../types/privacy";
import { GiftwrappedCommunicationService } from "./giftwrapped-communication-service";
import { decryptNsec } from "./privacy/encryption";
import { supabase } from "./supabase";

export interface MessageSendResult {
  success: boolean;
  messageId?: string;
  method: "giftwrapped" | "encrypted" | "minimal";
  error?: string;
  relayUrl?: string;
}

export interface NostrMessageConfig {
  content: string;
  recipientNpub: string;
  privacyLevel: PrivacyLevel;
  messageType?: "invitation" | "message" | "notification";
  groupId?: string; // For group messages
  groupName?: string; // For group message display
}

interface EncryptedNsecData {
  encrypted?: string;
  encryptedNsec?: string;
  salt: string;
  iv: string;
  tag: string;
}

export interface AuthenticatedUser {
  id: string;
  npub: string;
  encryptedNsec?: EncryptedNsecData | string; // JSON object or stringified JSON
  authMethod: string;
}

/**
 * Nostr Message Service - Privacy-first messaging implementation
 */
export class NostrMessageService {
  private static instance: NostrMessageService;
  private static DEFAULT_RELAYS = [
    "wss://relay.satnam.pub",
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
  ];
  private giftwrappedService: GiftwrappedCommunicationService;
  private relays: string[];
  private connections: Map<string, WebSocket> = new Map();

  constructor(relays?: string[]) {
    this.relays = relays || NostrMessageService.DEFAULT_RELAYS;
    this.giftwrappedService = new GiftwrappedCommunicationService();
    this.registerCleanup();
  }

  static getInstance(relays?: string[]): NostrMessageService {
    if (!NostrMessageService.instance) {
      NostrMessageService.instance = new NostrMessageService(relays);
    }
    return NostrMessageService.instance;
  }

  /**
   * Send message with privacy level routing
   */
  async sendMessage(config: NostrMessageConfig): Promise<MessageSendResult> {
    try {
      // Get authenticated user and their private key
      const user = await this.getAuthenticatedUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      const privateKey = await this.getUserPrivateKey(user);
      if (!privateKey) {
        throw new Error("Unable to access user private key");
      }

      // Route to group messaging if groupId is provided
      if (config.groupId) {
        return await this.sendGroupMessage(config, privateKey, user);
      }

      switch (config.privacyLevel) {
        case PrivacyLevel.GIFTWRAPPED:
          return await this.sendGiftWrappedMessage(config, privateKey, user);

        case PrivacyLevel.ENCRYPTED:
          return await this.sendEncryptedDM(config, privateKey, user);

        case PrivacyLevel.MINIMAL:
          return await this.sendStandardMessage(config, privateKey, user);

        default:
          throw new Error(`Unsupported privacy level: ${config.privacyLevel}`);
      }
    } catch (error) {
      console.error("Message sending failed:", error);
      const method = this.mapPrivacyLevelToMethod(config.privacyLevel);
      return {
        success: false,
        method,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get authenticated user from Supabase session
   */
  private async getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        return null;
      }

      // Get user identity from user_identities table
      const { data: userIdentity, error: userError } = await supabase
        .from("user_identities")
        .select("id, npub, encrypted_nsec, auth_method")
        .eq("id", session.user.id)
        .eq("is_active", true)
        .single();

      if (userError || !userIdentity) {
        return null;
      }

      return {
        id: userIdentity.id,
        npub: userIdentity.npub,
        encryptedNsec: userIdentity.encrypted_nsec,
        authMethod: userIdentity.auth_method,
      };
    } catch (error) {
      console.error("Failed to get authenticated user:", error);
      return null;
    }
  }

  /**
   * Maps PrivacyLevel enum to method string for MessageSendResult
   */
  private mapPrivacyLevelToMethod(
    level: PrivacyLevel
  ): "giftwrapped" | "encrypted" | "minimal" {
    switch (level) {
      case PrivacyLevel.GIFTWRAPPED:
        return "giftwrapped";
      case PrivacyLevel.ENCRYPTED:
        return "encrypted";
      case PrivacyLevel.MINIMAL:
        return "minimal";
      default:
        return "minimal";
    }
  }

  /**
   * Get current relay configuration
   */
  getRelays(): string[] {
    return [...this.relays]; // Return a copy to prevent external modification
  }

  /**
   * Update relay configuration
   * Closes existing connections and updates relay list
   */
  async updateRelays(newRelays: string[]): Promise<void> {
    if (!newRelays || newRelays.length === 0) {
      throw new Error("At least one relay URL is required");
    }

    // Validate relay URLs
    for (const relay of newRelays) {
      if (!relay.startsWith("wss://") && !relay.startsWith("ws://")) {
        throw new Error(`Invalid relay URL format: ${relay}`);
      }
    }

    // Close existing connections
    await this.closeAllConnections();

    // Update relay list
    this.relays = [...newRelays];
  }

  /**
   * Add relay to current configuration
   */
  async addRelay(relayUrl: string): Promise<void> {
    if (!relayUrl.startsWith("wss://") && !relayUrl.startsWith("ws://")) {
      throw new Error(`Invalid relay URL format: ${relayUrl}`);
    }

    if (!this.relays.includes(relayUrl)) {
      this.relays.push(relayUrl);
    }
  }

  /**
   * Remove relay from current configuration
   */
  async removeRelay(relayUrl: string): Promise<void> {
    const index = this.relays.indexOf(relayUrl);
    if (index > -1) {
      this.relays.splice(index, 1);

      // Close connection for this specific relay
      const connection = this.connections.get(relayUrl);
      if (connection) {
        connection.close();
        this.connections.delete(relayUrl);
      }
    }

    if (this.relays.length === 0) {
      throw new Error(
        "Cannot remove last relay - at least one relay is required"
      );
    }
  }

  /**
   * Reset relays to default configuration
   */
  async resetToDefaultRelays(): Promise<void> {
    await this.updateRelays([...NostrMessageService.DEFAULT_RELAYS]);
  }

  /**
   * Close all relay connections
   */
  private async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.values()).map(
      (connection) =>
        new Promise<void>((resolve) => {
          if (connection.readyState === WebSocket.OPEN) {
            connection.onclose = () => resolve();
            connection.close();
          } else {
            resolve();
          }
        })
    );

    await Promise.all(closePromises);
    this.connections.clear();
  }

  /**
   * Get user's private key (nsec) for signing using existing decryption utilities
   */
  private async getUserPrivateKey(
    user: AuthenticatedUser
  ): Promise<string | null> {
    try {
      // If user authenticated with NIP-07, use browser extension
      if (user.authMethod === "nip07") {
        return "nip07"; // Special marker to indicate NIP-07 usage
      }

      // Otherwise, decrypt the stored nsec using existing decryption utilities
      if (user.encryptedNsec) {
        // Parse the encrypted nsec data (should be JSON with encryption parameters)
        let encryptedData;
        if (typeof user.encryptedNsec === "string") {
          encryptedData = JSON.parse(user.encryptedNsec);
        } else {
          encryptedData = user.encryptedNsec;
        }

        // Use the existing decryptNsec function from privacy/encryption.ts
        const decryptedNsec = await decryptNsec({
          encryptedNsec: encryptedData.encrypted || encryptedData.encryptedNsec,
          salt: encryptedData.salt,
          iv: encryptedData.iv,
          tag: encryptedData.tag,
        });

        return decryptedNsec;
      }

      return null;
    } catch (error) {
      console.error("Failed to get user private key:", error);
      return null;
    }
  }

  /**
   * Send Gift Wrapped message (NIP-59) - Maximum privacy
   */
  private async sendGiftWrappedMessage(
    config: NostrMessageConfig,
    privateKey: string,
    user: AuthenticatedUser
  ): Promise<MessageSendResult> {
    try {
      // Convert npub to hex pubkey
      const recipientPubkey = this.npubToHex(config.recipientNpub);
      if (!recipientPubkey) {
        throw new Error("Invalid recipient npub format");
      }

      // Create a signed proof for authentication using the user's decrypted nsec
      let signedProof;
      const timestamp = Math.floor(Date.now() / 1000);
      // Include a nonce for additional security
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      // Create a message that includes the user's npub, timestamp, and nonce
      const authMessage = `satnam:auth:${user.npub}:${timestamp}:${nonce}`;

      if (privateKey === "nip07") {
        // Use NIP-07 browser extension for signing
        const nostr = (window as any).nostr;
        if (!nostr) {
          throw new Error("NIP-07 extension not available");
        }

        // Get the public key from the NIP-07 extension
        const pubkey = await nostr.getPublicKey();

        // Sign the authentication message with the user's private key via NIP-07
        // This uses the browser extension's secure signing capabilities
        const signature = await nostr.signSchnorr(authMessage);

        if (!signature) {
          throw new Error("Failed to sign message with NIP-07");
        }

        signedProof = {
          signature,
          pubkey,
          timestamp,
          nonce,
        };
      } else {
        // Use the decrypted nsec (privateKey) for signing
        if (!privateKey) {
          throw new Error("Private key is required for message signing");
        }

        // Get the public key from the private key
        const pubkey = bytesToHex(
          secp256k1.getPublicKey(privateKey, true)
        ).slice(2);

        // Sign the authentication message with the user's decrypted nsec
        const signature = finalizeEvent(authMessage, privateKey);

        if (!signature) {
          throw new Error("Failed to sign message with private key");
        }

        signedProof = {
          signature,
          pubkey,
          timestamp,
          nonce,
        };
      }

      // Use the existing giftwrapped service with signed proof
      const result = await this.giftwrappedService.sendGiftwrappedMessage({
        content: config.content,
        recipient: config.recipientNpub,
        sender: user.npub,
        encryptionLevel: "maximum",
        communicationType:
          config.messageType === "invitation" ? "individual" : "individual",
        signedProof, // Include signed proof for secure authentication
      });

      return {
        success: result.success,
        messageId: result.messageId,
        method: "giftwrapped",
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        method: "giftwrapped",
        error:
          error instanceof Error
            ? error.message
            : "Gift wrapped message failed",
      };
    }
  }

  /**
   * Send encrypted DM (NIP-04) - Selective privacy
   */
  private async sendEncryptedDM(
    config: NostrMessageConfig,
    privateKey: string,
    user: AuthenticatedUser
  ): Promise<MessageSendResult> {
    try {
      // Convert npub to hex pubkey
      const recipientPubkey = this.npubToHex(config.recipientNpub);
      if (!recipientPubkey) {
        throw new Error("Invalid recipient npub format");
      }

      let encryptedContent: string;
      let senderPubkey: string;
      let signedEvent: any;

      if (privateKey === "nip07") {
        // Use NIP-07 browser extension
        const nostr = (window as any).nostr;
        if (!nostr) {
          throw new Error("NIP-07 extension not available");
        }

        senderPubkey = await nostr.getPublicKey();

        // Encrypt using NIP-07
        if (nostr.nip04?.encrypt) {
          encryptedContent = await nostr.nip04.encrypt(
            recipientPubkey,
            config.content
          );
        } else {
          throw new Error("NIP-07 encryption not supported");
        }

        // Create the DM event (kind 4)
        const dmEvent = {
          kind: 4,
          pubkey: senderPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["p", recipientPubkey]],
          content: encryptedContent,
        };

        // Sign with NIP-07
        signedEvent = await nostr.signEvent(dmEvent);
      } else {
        // Use stored private key
        senderPubkey = bytesToHex(
          secp256k1.getPublicKey(privateKey, true)
        ).slice(2);

        // Encrypt the message using NIP-04
        encryptedContent = await nip04.encrypt(
          config.content,
          recipientPubkey,
          privateKey
        );

        // Create the DM event (kind 4)
        const dmEvent = {
          kind: 4,
          pubkey: senderPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["p", recipientPubkey]],
          content: encryptedContent,
          id: "",
        };

        // Sign the event
        signedEvent = finalizeEvent(dmEvent, privateKey);
      }

      // Publish to relays
      const publishResult = await this.publishToRelays(signedEvent);

      return {
        success: publishResult.success,
        messageId: signedEvent.id,
        method: "encrypted",
        error: publishResult.error,
        relayUrl: publishResult.relayUrl,
      };
    } catch (error) {
      return {
        success: false,
        method: "encrypted",
        error: error instanceof Error ? error.message : "Encrypted DM failed",
      };
    }
  }

  /**
   * Send standard message - Minimal encryption
   */
  private async sendStandardMessage(
    config: NostrMessageConfig,
    privateKey: string,
    user: AuthenticatedUser
  ): Promise<MessageSendResult> {
    try {
      // Convert npub to hex pubkey
      const recipientPubkey = this.npubToHex(config.recipientNpub);
      if (!recipientPubkey) {
        throw new Error("Invalid recipient npub format");
      }

      let senderPubkey: string;
      let signedEvent: any;

      if (privateKey === "nip07") {
        // Use NIP-07 browser extension
        const nostr = (window as any).nostr;
        if (!nostr) {
          throw new Error("NIP-07 extension not available");
        }

        senderPubkey = await nostr.getPublicKey();

        // Create a public note event (kind 1) mentioning the recipient
        const noteEvent = {
          kind: 1,
          pubkey: senderPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["p", recipientPubkey],
            ["t", "invitation"],
            ["t", "satnam-pub"],
          ],
          content: `${config.content}\n\n#invitation #satnam-pub`,
        };

        // Sign with NIP-07
        signedEvent = await nostr.signEvent(noteEvent);
      } else {
        // Use stored private key
        senderPubkey = bytesToHex(
          secp256k1.getPublicKey(privateKey, true)
        ).slice(2);

        // Create a public note event (kind 1) mentioning the recipient
        const noteEvent = {
          kind: 1,
          pubkey: senderPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["p", recipientPubkey],
            ["t", "invitation"],
            ["t", "satnam-pub"],
          ],
          content: `${config.content}\n\n#invitation #satnam-pub`,
          id: "",
        };

        // Sign the event
        signedEvent = finalizeEvent(noteEvent, privateKey);
      }

      // Publish to relays
      const publishResult = await this.publishToRelays(signedEvent);

      return {
        success: publishResult.success,
        messageId: signedEvent.id,
        method: "minimal",
        error: publishResult.error,
        relayUrl: publishResult.relayUrl,
      };
    } catch (error) {
      return {
        success: false,
        method: "minimal",
        error:
          error instanceof Error ? error.message : "Standard message failed",
      };
    }
  }

  /**
   * Send group message using the group-messaging API
   */
  private async sendGroupMessage(
    config: NostrMessageConfig,
    privateKey: string,
    user: AuthenticatedUser
  ): Promise<MessageSendResult> {
    try {
      // Create a signed authentication token
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const authMessage = `satnam:group:${user.npub}:${config.groupId}:${timestamp}:${nonce}`;

      // Sign the authentication message
      let signature: string;
      let pubkey: string;

      if (privateKey === "nip07") {
        // Use NIP-07 browser extension for signing
        const nostr = (window as any).nostr;
        if (!nostr) {
          throw new Error("NIP-07 extension not available");
        }

        pubkey = await nostr.getPublicKey();
        signature = await nostr.signSchnorr(authMessage);

        if (!signature) {
          throw new Error("Failed to sign group message with NIP-07");
        }
      } else {
        // Use the decrypted nsec for signing
        if (!privateKey) {
          throw new Error("Private key is required for group message signing");
        }

        pubkey = bytesToHex(secp256k1.getPublicKey(privateKey, true)).slice(2);
        signature = finalizeEvent(authMessage, privateKey);

        if (!signature) {
          throw new Error("Failed to sign group message with private key");
        }
      }

      // Create the signed auth token (without exposing the raw message)
      const authToken = {
        npub: user.npub,
        pubkey,
        signature,
        timestamp,
        nonce,
        context: "group",
        contextId: config.groupId,
      };

      // Use the existing group-messaging API endpoint with secure authentication
      const response = await fetch("/.netlify/functions/group-messaging", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Nostr ${JSON.stringify(authToken)}`,
        },
        body: JSON.stringify({
          action: "send_message",
          groupId: config.groupId,
          content: config.content,
          messageType:
            config.privacyLevel === PrivacyLevel.GIFTWRAPPED
              ? "sensitive"
              : "text",
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          success: true,
          messageId: result.data?.messageId || crypto.randomUUID(),
          method:
            config.privacyLevel === PrivacyLevel.GIFTWRAPPED
              ? "giftwrapped"
              : "encrypted",
          relayUrl: "group-messaging-api",
        };
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send group message");
      }
    } catch (error) {
      return {
        success: false,
        method:
          config.privacyLevel === PrivacyLevel.GIFTWRAPPED
            ? "giftwrapped"
            : "encrypted",
        error: error instanceof Error ? error.message : "Group message failed",
      };
    }
  }

  /**
   * Publish event to Nostr relays
   */
  private async publishToRelays(event: any): Promise<{
    success: boolean;
    error?: string;
    relayUrl?: string;
  }> {
    const publishPromises = this.relays.map(async (relayUrl) => {
      try {
        const ws = await this.connectToRelay(relayUrl);

        return new Promise<{
          success: boolean;
          relayUrl: string;
          error?: string;
        }>((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ success: false, relayUrl, error: "Timeout" });
          }, 10000); // 10 second timeout

          ws.onmessage = (message) => {
            try {
              const data = JSON.parse(message.data);
              if (data[0] === "OK" && data[1] === event.id) {
                clearTimeout(timeout);
                resolve({
                  success: data[2],
                  relayUrl,
                  error: data[2] ? undefined : data[3],
                });
              }
            } catch (e) {
              // Ignore parsing errors for other messages
            }
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve({ success: false, relayUrl, error: "Connection error" });
          };

          // Send the event
          ws.send(JSON.stringify(["EVENT", event]));
        });
      } catch (error) {
        return {
          success: false,
          relayUrl,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    try {
      const results = await Promise.allSettled(publishPromises);

      // Find the first successful result
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.success) {
          return {
            success: true,
            relayUrl: result.value.relayUrl,
          };
        }
      }

      // If no success, return the first error
      const firstError = results.find((r) => r.status === "fulfilled")?.value
        ?.error;
      return {
        success: false,
        error: firstError || "All relays failed",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Publish failed",
      };
    }
  }

  /**
   * Connect to a Nostr relay
   */
  private async connectToRelay(url: string): Promise<WebSocket> {
    // Check if we already have a connection
    const existing = this.connections.get(url);
    if (existing && existing.readyState === WebSocket.OPEN) {
      return existing;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Connection timeout to ${url}`));
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.connections.set(url, ws);
        resolve(ws);
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Failed to connect to ${url}`));
      };
    });
  }

  /**
   * Convert npub to hex pubkey
   */
  private npubToHex(npub: string): string | null {
    try {
      const { type, data } = nip19.decode(npub);
      if (type === "npub") {
        return typeof data === "string" ? data : bytesToHex(data as Uint8Array);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Register automatic cleanup on browser window unload
   */
  private registerCleanup(): void {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.cleanup());
    }
  }

  /**
   * Clean up connections and resources
   */
  cleanup(): void {
    // Clean up WebSocket connections
    this.connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    this.connections.clear();

    // Clean up giftwrapped service if it has a cleanup method
    if (
      this.giftwrappedService &&
      typeof (this.giftwrappedService as any).cleanup === "function"
    ) {
      (this.giftwrappedService as any).cleanup();
    }
  }
}

// Export singleton instance
export const nostrMessageService = NostrMessageService.getInstance();
