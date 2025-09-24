/**
 * Contact API Service - Production Integration Layer
 *
 * Integrates with existing contact management system to provide
 * contact data for payment automation and recipient selection.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Uses existing contact API endpoints and data structures
 * - Maintains privacy-first approach with encrypted data handling
 * - Integrates with authentication and authorization flows
 * - Follows established error handling patterns
 */

import { Contact } from "../types/contacts";
import { showToast } from "./toastService";

// Types for payment recipient data
export interface PaymentRecipient {
  id: string;
  type: "family_member" | "contact" | "external";
  displayName: string;
  npub?: string;
  nip05?: string;
  lightningAddress?: string;
  familyRole?: "private" | "offspring" | "adult" | "steward" | "guardian";
  trustLevel?: "family" | "trusted" | "known" | "unverified";
  verified?: boolean;
  avatar?: string;
}

export interface ContactValidationResult {
  valid: boolean;
  type: "npub" | "nip05" | "lightning_address" | "cashu_token";
  error?: string;
  normalizedValue?: string;
  metadata?: {
    domain?: string;
    username?: string;
    verified?: boolean;
  };
}

export interface UserContactData {
  userNpub?: string;
  userNip05?: string;
  userLightningAddress?: string;
  preferredSigningMethod: "nip07" | "nip05" | "password";
  hasNip07Extension: boolean;
}

/**
 * Contact API Service Class
 * Handles all contact-related operations for payment automation
 */
class ContactApiService {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor() {
    this.baseUrl = process.env.VITE_API_BASE_URL || "/api";
  }

  /**
   * Set authentication token for API requests
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (this.authToken) {
      (headers as Record<string, string>)[
        "Authorization"
      ] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(async () => {
          const text = await response.text().catch(() => "");
          return {
            message: text || `HTTP ${response.status}: ${response.statusText}`,
          };
        });
        throw new Error(
          errorData.message ||
            errorData.error ||
            `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error(`Contact API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Get user's contact list for payment recipients
   */
  async getUserContacts(userId: string): Promise<PaymentRecipient[]> {
    try {
      const response = await this.makeRequest<{
        success: boolean;
        contacts: Contact[];
      }>(`/communications/get-contacts?memberId=${userId}`);

      if (!response.success) {
        throw new Error("Failed to load contacts");
      }

      // Transform contacts to payment recipients
      return response.contacts.map((contact) => ({
        id: contact.id,
        type: contact.familyRole ? "family_member" : "contact",
        displayName: contact.displayName,
        npub: contact.npub,
        nip05: contact.nip05,
        lightningAddress: contact.lightningAddress,
        familyRole: contact.familyRole,
        trustLevel: contact.trustLevel,
        verified: contact.nip05Verified || contact.pubkeyVerified,
        avatar: contact.profileImageUrl
          ? contact.displayName.charAt(0).toUpperCase()
          : undefined,
      }));
    } catch (error) {
      console.error("Failed to load user contacts:", error);
      showToast.error("Failed to load contacts", {
        title: "Contact Loading Error",
        duration: 5000,
      });
      return [];
    }
  }

  /**
   * Get current user's identity data for payment authentication
   */
  async getUserIdentityData(userId: string): Promise<UserContactData> {
    try {
      const response = await this.makeRequest<{
        success: boolean;
        identity: {
          npub?: string;
          nip05?: string;
          lightning_address?: string;
          username?: string;
        };
      }>(`/user/identity/${userId}`);

      if (!response.success) {
        throw new Error("Failed to load user identity");
      }

      // Check for NIP-07 extension
      const hasNip07Extension =
        typeof window !== "undefined" &&
        "nostr" in window &&
        typeof (window as any).nostr?.getPublicKey === "function";

      // Determine preferred signing method
      let preferredSigningMethod: "nip07" | "nip05" | "password" = "password";
      if (hasNip07Extension) {
        preferredSigningMethod = "nip07";
      } else if (response.identity.nip05) {
        preferredSigningMethod = "nip05";
      }

      return {
        userNpub: response.identity.npub,
        userNip05: response.identity.nip05,
        userLightningAddress: response.identity.lightning_address,
        preferredSigningMethod,
        hasNip07Extension,
      };
    } catch (error) {
      console.error("Failed to load user identity data:", error);
      return {
        preferredSigningMethod: "password",
        hasNip07Extension: false,
      };
    }
  }

  /**
   * Validate external recipient input (npub, NIP-05, Lightning address, Cashu)
   */
  async validateRecipientInput(
    input: string
  ): Promise<ContactValidationResult> {
    const trimmedInput = input.trim();

    // Validate npub format
    if (trimmedInput.startsWith("npub1")) {
      return this.validateNpub(trimmedInput);
    }

    // Validate NIP-05 format (email-like)
    if (trimmedInput.includes("@") && !trimmedInput.startsWith("http")) {
      return this.validateNip05(trimmedInput);
    }

    // Validate Cashu token/mint URL
    if (trimmedInput.startsWith("http")) {
      return this.validateCashuInput(trimmedInput);
    }

    // Default to Lightning address validation
    return this.validateLightningAddress(trimmedInput);
  }

  /**
   * Validate npub format and verify on network
   */
  private async validateNpub(npub: string): Promise<ContactValidationResult> {
    // Basic format validation
    if (!npub.startsWith("npub1") || npub.length !== 63) {
      return {
        valid: false,
        type: "npub",
        error:
          'Invalid npub format. Must start with "npub1" and be 63 characters long.',
      };
    }

    // Bech32 format validation
    if (!/^npub1[a-z0-9]{58}$/.test(npub)) {
      return {
        valid: false,
        type: "npub",
        error: "Invalid npub format. Contains invalid characters.",
      };
    }

    try {
      // Verify npub exists on Nostr network (optional verification) with timeout protection
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await this.makeRequest<{
        success: boolean;
        verified: boolean;
        metadata?: any;
      }>(`/nostr/verify-npub`, {
        method: "POST",
        body: JSON.stringify({ npub }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return {
        valid: true,
        type: "npub",
        normalizedValue: npub,
        metadata: {
          verified: response.verified,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Npub verification timed out after 5 seconds");
      }
      // Still valid format, just couldn't verify
      return {
        valid: true,
        type: "npub",
        normalizedValue: npub,
        metadata: {
          verified: false,
        },
      };
    }
  }

  /**
   * Validate NIP-05 identifier and verify domain
   */
  private async validateNip05(nip05: string): Promise<ContactValidationResult> {
    // Basic format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nip05)) {
      return {
        valid: false,
        type: "nip05",
        error: "Invalid NIP-05 format. Must be in format: username@domain.com",
      };
    }

    const [username, domain] = nip05.split("@");

    try {
      // Verify NIP-05 identifier
      const response = await this.makeRequest<{
        success: boolean;
        verified: boolean;
        pubkey?: string;
      }>(`/nostr/verify-nip05`, {
        method: "POST",
        body: JSON.stringify({ nip05 }),
      });

      return {
        valid: response.success,
        type: "nip05",
        normalizedValue: nip05.toLowerCase(),
        error: response.success ? undefined : "NIP-05 verification failed",
        metadata: {
          domain,
          username,
          verified: response.verified,
        },
      };
    } catch (error) {
      return {
        valid: false,
        type: "nip05",
        error: "Failed to verify NIP-05 identifier",
      };
    }
  }

  /**
   * Validate Lightning address format and availability
   */
  private async validateLightningAddress(
    address: string
  ): Promise<ContactValidationResult> {
    // Basic format validation
    const lightningRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!lightningRegex.test(address)) {
      return {
        valid: false,
        type: "lightning_address",
        error: "Invalid Lightning address format",
      };
    }

    const [username, domain] = address.split("@");

    try {
      // Verify Lightning address via LNURL
      const response = await this.makeRequest<{
        success: boolean;
        available: boolean;
        metadata?: any;
      }>(`/lightning/verify-address`, {
        method: "POST",
        body: JSON.stringify({ address }),
      });

      return {
        valid: response.success && response.available,
        type: "lightning_address",
        normalizedValue: address.toLowerCase(),
        error: response.success
          ? undefined
          : "Lightning address verification failed",
        metadata: {
          domain,
          username,
          verified: response.available,
        },
      };
    } catch (error) {
      return {
        valid: false,
        type: "lightning_address",
        error: "Failed to verify Lightning address",
      };
    }
  }

  /**
   * Validate Cashu token or mint URL
   */
  private async validateCashuInput(
    input: string
  ): Promise<ContactValidationResult> {
    try {
      const url = new URL(input);

      // Basic URL validation
      if (!["http:", "https:"].includes(url.protocol)) {
        return {
          valid: false,
          type: "cashu_token",
          error: "Invalid Cashu URL. Must use HTTP or HTTPS protocol.",
        };
      }

      return {
        valid: true,
        type: "cashu_token",
        normalizedValue: input,
        metadata: {
          domain: url.hostname,
        },
      };
    } catch (error) {
      return {
        valid: false,
        type: "cashu_token",
        error: "Invalid Cashu URL format",
      };
    }
  }

  /**
   * Search contacts by name or identifier
   */
  async searchContacts(
    userId: string,
    query: string
  ): Promise<PaymentRecipient[]> {
    try {
      const response = await this.makeRequest<{
        success: boolean;
        contacts: Contact[];
      }>(`/communications/search-contacts`, {
        method: "POST",
        body: JSON.stringify({
          userId,
          query: query.toLowerCase(),
          limit: 20,
        }),
      });

      if (!response.success) {
        return [];
      }

      return response.contacts.map((contact) => ({
        id: contact.id,
        type: contact.familyRole ? "family_member" : "contact",
        displayName: contact.displayName,
        npub: contact.npub,
        nip05: contact.nip05,
        lightningAddress: contact.lightningAddress,
        familyRole: contact.familyRole,
        trustLevel: contact.trustLevel,
        verified: contact.nip05Verified || contact.pubkeyVerified,
        avatar:
          contact.profileImageUrl ||
          contact.displayName.charAt(0).toUpperCase(),
      }));
    } catch (error) {
      console.error("Failed to search contacts:", error);
      return [];
    }
  }

  /**
   * Update verification flags for a contact
   */
  async updateContactVerification(
    contactHash: string,
    updates: {
      physical_mfa_verified?: boolean;
      vp_verified?: boolean;
      verification_proofs_encrypted?: string;
    }
  ): Promise<{ success: boolean }> {
    try {
      const resp = await this.makeRequest<{ success: boolean }>(
        "/communications/update-contact-verification",
        {
          method: "POST",
          body: JSON.stringify({ contact_hash: contactHash, updates }),
        }
      );
      return resp;
    } catch (error) {
      console.error("Failed to update contact verification:", error);
      showToast.error("Verification update failed", {
        title: "Contact",
        duration: 4000,
      });
      return { success: false };
    }
  }

  /**
   * Create an attestation for a contact (vouch)
   */
  async attestContact(
    contactHash: string,
    type: "physical_nfc" | "vp_jwt" | "inbox_relays" | "group_peer",
    vpHash?: string,
    metadata?: string
  ): Promise<{ success: boolean }> {
    try {
      const resp = await this.makeRequest<{ success: boolean }>(
        "/communications/attest-contact",
        {
          method: "POST",
          body: JSON.stringify({
            contact_hash: contactHash,
            attestation_type: type,
            vp_hash: vpHash,
            metadata,
          }),
        }
      );
      return resp;
    } catch (error) {
      console.error("Failed to create attestation:", error);
      showToast.error("Could not vouch for contact", {
        title: "Attestation",
        duration: 4000,
      });
      return { success: false };
    }
  }

  /**
   * Recalculate trust scores for the current user
   */
  async recalculateTrust(): Promise<{ success: boolean; updated?: number }> {
    try {
      const resp = await this.makeRequest<{
        success: boolean;
        updated?: number;
      }>("/communications/recalculate-trust", { method: "POST" });
      return resp;
    } catch (error) {
      console.error("Failed to recalculate trust:", error);
      showToast.error("Trust recalculation failed", {
        title: "Trust",
        duration: 4000,
      });
      return { success: false };
    }
  }
}

// Singleton instance for use across the application
const contactApiService = new ContactApiService();

// Export convenience functions
export const contactApi = {
  /**
   * Get user contacts for payment recipients
   */
  getUserContacts: async (userId: string): Promise<PaymentRecipient[]> => {
    return contactApiService.getUserContacts(userId);
  },

  /**
   * Get user identity data for authentication
   */
  getUserIdentityData: async (userId: string): Promise<UserContactData> => {
    return contactApiService.getUserIdentityData(userId);
  },

  /**
   * Validate recipient input
   */
  validateRecipientInput: async (
    input: string
  ): Promise<ContactValidationResult> => {
    return contactApiService.validateRecipientInput(input);
  },

  /**
   * Search contacts
   */
  searchContacts: async (
    userId: string,
    query: string
  ): Promise<PaymentRecipient[]> => {
    return contactApiService.searchContacts(userId, query);
  },

  /**
   * Set authentication token
   */
  setAuthToken: (token: string) => {
    contactApiService.setAuthToken(token);
  },

  /** Update verification flags */
  updateContactVerification: async (
    contactHash: string,
    updates: {
      physical_mfa_verified?: boolean;
      vp_verified?: boolean;
      verification_proofs_encrypted?: string;
    }
  ) => contactApiService.updateContactVerification(contactHash, updates),

  /** Create an attestation (vouch) */
  attestContact: async (
    contactHash: string,
    type: "physical_nfc" | "vp_jwt" | "inbox_relays" | "group_peer",
    vpHash?: string,
    metadata?: string
  ) => contactApiService.attestContact(contactHash, type, vpHash, metadata),

  /** Recalculate trust scores */
  recalculateTrust: async () => contactApiService.recalculateTrust(),
};

export default contactApiService;
