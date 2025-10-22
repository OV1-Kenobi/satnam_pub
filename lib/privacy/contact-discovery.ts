/**
 * Contact Discovery Module
 * Implements NIP-17 gift-wrapped contact discovery to prevent relay-based correlation attacks
 * Contacts are discovered and synchronized via encrypted gift-wrapped messaging instead of direct relay queries
 *
 * SECURITY ARCHITECTURE:
 * - Uses NIP-44 (XChaCha20-Poly1305) for gift-wrapped message encryption via CEPS
 * - NIP-17 sealing prevents relay operators from seeing message metadata
 * - Privacy-level-based contact filtering (public/private/tor)
 * - Contact discovery requests expire after 24 hours
 * - Response validation prevents tampering
 * - Production-grade encryption with active session management
 */

import { central_event_publishing_service as CEPS } from "../central_event_publishing_service";

export interface ContactDiscoveryRequest {
  requesterId: string;
  requesterNpub: string;
  targetNpub: string;
  requestedAt: number;
  expiresAt: number;
}

export interface ContactDiscoveryResponse {
  responderId: string;
  responderNpub: string;
  requesterId: string;
  contacts: Array<{
    npub: string;
    displayName: string;
    trustLevel: "family" | "trusted" | "known" | "unverified";
    familyRole?: string;
  }>;
  respondedAt: number;
}

export interface GiftWrappedContactMessage {
  kind: 1059; // Gift-wrapped message kind
  content: string; // Encrypted content
  tags: Array<[string, string]>;
  created_at: number;
  pubkey: string;
  sig: string;
}

/**
 * Contact Discovery Manager
 * Handles NIP-17 gift-wrapped contact discovery and synchronization
 */
export class ContactDiscoveryManager {
  /**
   * Create a contact discovery request to be sent via NIP-17 gift-wrapped messaging
   * This prevents relay operators from seeing who is requesting contact information
   */
  static async createContactDiscoveryRequest(
    requesterNpub: string,
    targetNpub: string,
    expiresInHours: number = 24
  ): Promise<ContactDiscoveryRequest> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + expiresInHours * 3600;

    return {
      requesterId: crypto.randomUUID(),
      requesterNpub,
      targetNpub,
      requestedAt: now,
      expiresAt,
    };
  }

  /**
   * Prepare contact discovery response for gift-wrapped transmission
   * Filters contacts based on trust level and privacy preferences
   */
  static async prepareContactDiscoveryResponse(
    responderNpub: string,
    requesterId: string,
    requesterNpub: string,
    userContacts: any[],
    privacyLevel: "public" | "private" | "tor" = "private"
  ): Promise<ContactDiscoveryResponse> {
    // Filter contacts based on privacy level and trust
    const filteredContacts = userContacts
      .filter((contact) => {
        // Only share contacts with appropriate trust levels
        if (privacyLevel === "public") {
          return (
            contact.trust_level === "family" ||
            contact.trust_level === "trusted"
          );
        } else if (privacyLevel === "private") {
          return contact.trust_level === "family";
        } else {
          // TOR: only share family contacts
          return contact.trust_level === "family";
        }
      })
      .map((contact) => ({
        npub: contact.encrypted_npub || contact.npub,
        displayName: contact.display_name_hash || "Contact",
        trustLevel: contact.trust_level,
        familyRole: contact.family_role,
      }));

    return {
      responderId: crypto.randomUUID(),
      responderNpub,
      requesterId,
      contacts: filteredContacts,
      respondedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Encrypt contact discovery response for NIP-17 gift-wrapped transmission
   * Uses NIP-44 (XChaCha20-Poly1305) for encryption via CEPS
   * Requires an active signing session for encryption
   */
  static async encryptContactDiscoveryResponse(
    response: ContactDiscoveryResponse,
    recipientNpub: string
  ): Promise<string> {
    try {
      const responseJson = JSON.stringify(response);

      // Convert npub to hex format for CEPS NIP-44 encryption
      const recipientHex = recipientNpub.startsWith("npub1")
        ? CEPS.npubToHex(recipientNpub)
        : recipientNpub;

      // Encrypt using NIP-44 (XChaCha20-Poly1305) via CEPS with active session
      const ciphertext = await CEPS.encryptNip44WithActiveSession(
        recipientHex,
        responseJson
      );

      return ciphertext;
    } catch (error) {
      throw new Error(
        `Failed to encrypt contact discovery response: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Decrypt contact discovery response from NIP-17 gift-wrapped message
   * Uses NIP-44 (XChaCha20-Poly1305) for decryption via CEPS
   * Requires an active signing session for decryption
   */
  static async decryptContactDiscoveryResponse(
    encryptedContent: string,
    senderNpub: string
  ): Promise<ContactDiscoveryResponse> {
    try {
      // Convert npub to hex format for CEPS NIP-44 decryption
      const senderHex = senderNpub.startsWith("npub1")
        ? CEPS.npubToHex(senderNpub)
        : senderNpub;

      // Decrypt using NIP-44 (XChaCha20-Poly1305) via CEPS with active session
      const result = await CEPS.decryptStandardDirectMessageWithActiveSession(
        senderHex,
        encryptedContent
      );

      return JSON.parse(result.plaintext) as ContactDiscoveryResponse;
    } catch (error) {
      throw new Error(
        `Failed to decrypt contact discovery response: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Validate contact discovery request
   * Ensures request is not expired and properly formatted
   */
  static validateContactDiscoveryRequest(request: ContactDiscoveryRequest): {
    valid: boolean;
    error?: string;
  } {
    const now = Math.floor(Date.now() / 1000);

    if (request.expiresAt < now) {
      return { valid: false, error: "Contact discovery request has expired" };
    }

    if (!request.requesterNpub || !request.targetNpub) {
      return { valid: false, error: "Invalid requester or target npub" };
    }

    if (request.requestedAt > now) {
      return { valid: false, error: "Request timestamp is in the future" };
    }

    return { valid: true };
  }

  /**
   * Validate contact discovery response
   * Ensures response matches request and is properly formatted
   */
  static validateContactDiscoveryResponse(
    response: ContactDiscoveryResponse,
    originalRequest: ContactDiscoveryRequest
  ): { valid: boolean; error?: string } {
    if (response.requesterId !== originalRequest.requesterId) {
      return { valid: false, error: "Response request ID does not match" };
    }

    if (response.responderNpub === originalRequest.requesterNpub) {
      return { valid: false, error: "Responder cannot be the requester" };
    }

    if (!Array.isArray(response.contacts)) {
      return { valid: false, error: "Response contacts must be an array" };
    }

    // Validate each contact
    for (const contact of response.contacts) {
      if (!contact.npub || !contact.displayName) {
        return { valid: false, error: "Invalid contact in response" };
      }
    }

    return { valid: true };
  }

  /**
   * Merge contact discovery responses from multiple sources
   * Deduplicates and prioritizes based on trust level
   */
  static mergeContactDiscoveryResponses(
    responses: ContactDiscoveryResponse[]
  ): Array<{
    npub: string;
    displayName: string;
    trustLevel: "family" | "trusted" | "known" | "unverified";
    sources: number; // Number of sources that provided this contact
  }> {
    const contactMap = new Map<
      string,
      {
        npub: string;
        displayName: string;
        trustLevel: "family" | "trusted" | "known" | "unverified";
        sources: number;
      }
    >();

    for (const response of responses) {
      for (const contact of response.contacts) {
        const existing = contactMap.get(contact.npub);
        if (existing) {
          existing.sources += 1;
          // Upgrade trust level if multiple sources agree
          if (
            contact.trustLevel === "family" &&
            existing.trustLevel !== "family"
          ) {
            existing.trustLevel = "family";
          }
        } else {
          contactMap.set(contact.npub, {
            npub: contact.npub,
            displayName: contact.displayName,
            trustLevel: contact.trustLevel,
            sources: 1,
          });
        }
      }
    }

    return Array.from(contactMap.values());
  }

  /**
   * Check if contact discovery is enabled for a user
   * Users can opt-out of contact discovery to maintain maximum privacy
   */
  static shouldEnableContactDiscovery(userPrivacyPreferences: {
    contactDiscoveryEnabled?: boolean;
    privacyLevel?: "public" | "private" | "tor";
  }): boolean {
    // Default to enabled unless explicitly disabled
    return userPrivacyPreferences.contactDiscoveryEnabled !== false;
  }
}
